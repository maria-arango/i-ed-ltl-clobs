"use client";
/**
 * Scoring: eight concepts, the rubric alongside, notes readable in place.
 * Rules in force here (DESIGN_SYSTEM §4): NO motion on score selection —
 * instant fill and border. The anchor guidance callout may fade in at
 * 150ms. Keyboard: 1–4 selects, arrows move between options.
 * Submission requires all eight items, warns (never blocks) on empty
 * justifications, and LOCKS the scores permanently.
 */
import { useMemo, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import GlideMenu from "@/components/primitives/GlideMenu";
import { SPRING_LAYOUT } from "@/lib/ease";
import { AutosaveIndicator } from "@/components/workspace/autosave-indicator";
import { MomentCard } from "@/components/ui/moment-card";
import { encouragement } from "@/lib/encouragement";
import { useAutosave } from "@/lib/use-autosave";

/* ------------------------------- types ------------------------------ */

export interface RubricConceptData {
  itemNo: number;
  name: string;
  statement: string;
  importance: string;
  specialNote: string;
  indicators: string[];
  anchors: Record<string, string>;
  examples: Array<{ scoreNum: number; items: string[] }>;
}

export interface RubricGuidanceRow {
  kind: string;
  position: number;
  label: string;
  text: string;
}

export interface ScoreState {
  scoreNum: number | null;
  justification: string;
}

const SCORE_META = [
  { num: 1, label: "Column A — Very Accurate", fill: "var(--clobs-score-1)", edge: "var(--clobs-score-1-edge)" },
  { num: 2, label: "Column A — Somewhat Accurate", fill: "var(--clobs-score-2)", edge: "var(--clobs-score-2-edge)" },
  { num: 3, label: "Column B — Somewhat Accurate", fill: "var(--clobs-score-3)", edge: "var(--clobs-score-3-edge)" },
  { num: 4, label: "Column B — Very Accurate", fill: "var(--clobs-score-4)", edge: "var(--clobs-score-4-edge)" },
] as const;

/* --------------------------- score chips ---------------------------- */

function ScoreChips({
  value,
  onSelect,
  disabled,
  itemNo,
}: {
  value: number | null;
  onSelect: (n: number) => void;
  disabled: boolean;
  itemNo: number;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  const onKeyDown = (e: React.KeyboardEvent, index: number) => {
    if (disabled) return;
    if (["1", "2", "3", "4"].includes(e.key)) {
      e.preventDefault();
      onSelect(Number(e.key));
      refs.current[Number(e.key) - 1]?.focus();
    } else if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      e.preventDefault();
      refs.current[(index + 1) % 4]?.focus();
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      e.preventDefault();
      refs.current[(index + 3) % 4]?.focus();
    }
  };

  return (
    <div
      role="radiogroup"
      aria-label={`Score for concept ${itemNo}`}
      className="flex flex-wrap gap-2"
    >
      {SCORE_META.map((meta, i) => {
        const selected = value === meta.num;
        const somethingSelected = value != null;
        return (
          <button
            key={meta.num}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            tabIndex={selected || (value == null && i === 0) ? 0 : -1}
            onClick={() => onSelect(meta.num)}
            onKeyDown={(e) => onKeyDown(e, i)}
            // Selection is deliberately INSTANT — no transition (DESIGN_SYSTEM
            // §4: the scoring grid gets no motion). Emphasis comes from the
            // edge-filled numeral badge, weight, check, and dimmed siblings.
            className="inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-[14px] text-ink disabled:cursor-not-allowed"
            style={{
              background: meta.fill,
              border: selected
                ? `2px solid ${meta.edge}`
                : "1px solid var(--clobs-hairline)",
              margin: selected ? 0 : 1, // selection never shifts layout
              opacity: somethingSelected && !selected ? 0.55 : 1,
              fontWeight: selected ? 600 : 500,
            }}
          >
            <span
              className="mono flex size-6 shrink-0 items-center justify-center rounded-full text-[13px]"
              style={
                selected
                  ? { background: meta.edge, color: "var(--clobs-paper)" }
                  : {
                      border: "1px solid var(--clobs-hairline-strong)",
                      color: "var(--clobs-ink)",
                    }
              }
            >
              {meta.num}
            </span>
            <span>{meta.label}</span>
            {selected && (
              <span aria-hidden style={{ color: meta.edge }}>
                ✓
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------ panel ------------------------------- */

export function ScoringPanel({
  videoId,
  concepts,
  guidance,
  initialScores,
  initialSubmitted,
  noteHtml,
  onProgress,
}: {
  videoId: string;
  concepts: RubricConceptData[];
  guidance: RubricGuidanceRow[];
  initialScores: Array<{ itemNo: number; scoreNum: number; justification: string | null }>;
  initialSubmitted: boolean;
  /** The coder's OWN note (HTML they authored), shown side by side. */
  noteHtml?: string | null;
  onProgress?: (scoredCount: number, submitted: boolean) => void;
}) {
  const reduce = useReducedMotion();
  const [currentItem, setCurrentItem] = useState(1);
  const [submitted, setSubmitted] = useState(initialSubmitted);
  const [confirming, setConfirming] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [moment, setMoment] = useState<string | null>(null);
  const [scores, setScores] = useState<Record<number, ScoreState>>(() => {
    const map: Record<number, ScoreState> = {};
    for (let n = 1; n <= 8; n++) map[n] = { scoreNum: null, justification: "" };
    for (const s of initialScores) {
      map[s.itemNo] = { scoreNum: s.scoreNum, justification: s.justification ?? "" };
    }
    return map;
  });

  const concept = concepts.find((c) => c.itemNo === currentItem)!;
  const current = scores[currentItem];
  const scoredCount = Object.values(scores).filter((s) => s.scoreNum != null).length;
  const emptyJustifications = Object.entries(scores).filter(
    ([, s]) => s.scoreNum != null && s.justification.trim() === "",
  ).length;

  const { status, savedAt, flush } = useAutosave({
    value: current,
    storageKey: `score-${videoId}-${currentItem}`,
    enabled: !submitted && current.scoreNum != null,
    save: async (v) => {
      if (v.scoreNum == null) return;
      const res = await fetch(`/api/coder/videos/${videoId}/scores`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          itemNo: currentItem,
          scoreNum: v.scoreNum,
          justification: v.justification.trim() === "" ? null : v.justification,
        }),
      });
      if (!res.ok) throw new Error("save failed");
    },
  });

  const select = (n: number) => {
    if (submitted) return;
    // Compute the next map OUTSIDE the updater: calling the parent's
    // setState from inside an updater runs during render (React error).
    const next = {
      ...scores,
      [currentItem]: { ...scores[currentItem], scoreNum: n },
    };
    setScores(next);
    onProgress?.(
      Object.values(next).filter((s) => s.scoreNum != null).length,
      false,
    );
  };

  /** Table-view editing: update state, notify the shell, save the item. */
  const saveFromTable = async (itemNo: number, next: ScoreState) => {
    const nextMap = { ...scores, [itemNo]: next };
    setScores(nextMap);
    onProgress?.(
      Object.values(nextMap).filter((s) => s.scoreNum != null).length,
      false,
    );
    if (next.scoreNum != null) {
      await fetch(`/api/coder/videos/${videoId}/scores`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          itemNo,
          scoreNum: next.scoreNum,
          justification:
            next.justification.trim() === "" ? null : next.justification,
        }),
      }).catch(() => {});
    }
  };

  const submit = async () => {
    setSubmitError(null);
    await flush();
    const res = await fetch(`/api/coder/videos/${videoId}/submit`, {
      method: "POST",
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: "Submission failed" }));
      setSubmitError(body.error ?? "Submission failed");
      setConfirming(false);
      return;
    }
    setSubmitted(true);
    setConfirming(false);
    setReviewOpen(false);
    setMoment(encouragement.scoresSubmitted());
    window.scrollTo({
      top: 0,
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
    });
    onProgress?.(8, true);
    // The full completion moment (DESIGN_SYSTEM §4) — never under reduced motion.
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const confetti = (await import("canvas-confetti")).default;
      confetti({ particleCount: 90, spread: 70, origin: { y: 0.7 } });
    }
  };

  const anchorText = current.scoreNum != null ? concept.anchors[String(current.scoreNum)] : null;
  const reachBands = useMemo(() => guidance.filter((g) => g.kind === "reach_band"), [guidance]);
  const rules = useMemo(() => guidance.filter((g) => g.kind === "guiding_rule"), [guidance]);

  if (reviewOpen) {
    return (
      <div className="space-y-5">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h3 className="text-[16px] font-medium text-ink">
            {submitted ? "Your submitted scores" : "Score in a single table"}
          </h3>
          <button
            type="button"
            onClick={() => {
              setReviewOpen(false);
              setConfirming(false);
            }}
            className="rounded-md border border-hairline bg-paper px-3 py-1.5 text-[13px] font-medium text-ink transition-colors duration-[90ms] hover:bg-card active:scale-[0.98]"
          >
            {submitted ? "Back to the items" : "Back to one-by-one view"}
          </button>
        </div>

        {confirming && !submitted && (
          <div
            className="elev-card rounded-xl border border-hairline p-4"
            style={{ background: "var(--clobs-lake-wash)" }}
          >
            <p className="text-[14px] leading-[1.6] text-ink">
              One last look before it locks. Read each score against its
              justification: does every pair still feel right? You can still
              change anything here. Careful checking is what makes the data
              trustworthy.
            </p>
          </div>
        )}

        <div className="space-y-3">
          {concepts.map((c) => {
            const entry = scores[c.itemNo];
            return (
              <div
                key={c.itemNo}
                className="elev-card rounded-xl border border-hairline bg-card p-4"
              >
                <div className="grid gap-3 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
                  <div className="min-w-0">
                    <p className="text-[14px] font-medium text-ink">
                      <span className="mono mr-2 text-[12px] text-smoke">
                        {c.itemNo}
                      </span>
                      {c.name}
                    </p>
                    <div
                      role="radiogroup"
                      aria-label={`Score for concept ${c.itemNo}`}
                      className="mt-2 flex flex-wrap gap-1.5"
                    >
                      {SCORE_META.map((meta) => {
                        const selected = entry.scoreNum === meta.num;
                        const somethingSelected = entry.scoreNum != null;
                        return (
                          <button
                            key={meta.num}
                            type="button"
                            role="radio"
                            aria-checked={selected}
                            disabled={submitted}
                            onClick={() =>
                              void saveFromTable(c.itemNo, {
                                ...entry,
                                scoreNum: meta.num,
                              })
                            }
                            className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] text-ink disabled:cursor-not-allowed"
                            style={{
                              background: meta.fill,
                              border: selected
                                ? `2px solid ${meta.edge}`
                                : "1px solid var(--clobs-hairline)",
                              margin: selected ? 0 : 1,
                              opacity: somethingSelected && !selected ? 0.55 : 1,
                              fontWeight: selected ? 600 : 500,
                            }}
                          >
                            <span
                              className="mono flex size-4 items-center justify-center rounded-full text-[10px]"
                              style={
                                selected
                                  ? {
                                      background: meta.edge,
                                      color: "var(--clobs-paper)",
                                    }
                                  : {
                                      border:
                                        "1px solid var(--clobs-hairline-strong)",
                                      color: "var(--clobs-ink)",
                                    }
                              }
                            >
                              {meta.num}
                            </span>
                            {meta.num <= 2 ? "A" : "B"} ·{" "}
                            {meta.num === 1 || meta.num === 4
                              ? "Very"
                              : "Somewhat"}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <div className="min-w-0">
                    <label
                      htmlFor={`table-just-${c.itemNo}`}
                      className="block text-[12px] font-medium text-graphite"
                    >
                      Justification (required)
                    </label>
                    {submitted ? (
                      <p className="mt-1 text-[13px] leading-[1.5] text-graphite">
                        {entry.justification.trim() || (
                          <span className="text-smoke">—</span>
                        )}
                      </p>
                    ) : (
                      <textarea
                        id={`table-just-${c.itemNo}`}
                        rows={2}
                        value={entry.justification}
                        onChange={(e) =>
                          setScores((prev) => ({
                            ...prev,
                            [c.itemNo]: {
                              ...prev[c.itemNo],
                              justification: e.target.value,
                            },
                          }))
                        }
                        onBlur={() => void saveFromTable(c.itemNo, scores[c.itemNo])}
                        placeholder="What you saw that earned this score."
                        className={`mt-1 block w-full resize-none rounded-md border bg-paper px-3 py-2 text-[13px] text-ink focus:border-hairline-strong ${
                          entry.scoreNum != null &&
                          entry.justification.trim() === ""
                            ? "border-clay/60"
                            : "border-hairline"
                        }`}
                      />
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {!submitted && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-[13px] text-smoke" aria-live="polite">
              <span className="mono">{scoredCount}</span> of{" "}
              <span className="mono">8</span> scored
              {emptyJustifications > 0 && (
                <span className="text-clay">
                  {" "}
                  · {emptyJustifications} justification
                  {emptyJustifications > 1 ? "s" : ""} missing
                </span>
              )}
            </p>
            <div className="flex items-center gap-3">
              {submitError && (
                <p role="alert" className="text-[13px] text-clay">{submitError}</p>
              )}
              {confirming ? (
                <button
                  type="button"
                  onClick={submit}
                  disabled={scoredCount < 8 || emptyJustifications > 0}
                  className="rounded-md bg-bark px-[18px] py-[10px] text-[15px] font-semibold text-paper transition-colors duration-[90ms] hover:bg-bark-deep active:scale-[0.98] disabled:bg-sunken disabled:text-ash"
                >
                  Everything checks out. Submit and lock
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirming(true)}
                  disabled={scoredCount < 8 || emptyJustifications > 0}
                  className="rounded-md bg-bark px-[18px] py-[10px] text-[15px] font-semibold text-paper transition-colors duration-[90ms] hover:bg-bark-deep active:scale-[0.98] disabled:bg-sunken disabled:text-ash"
                >
                  Review and submit
                </button>
              )}
            </div>
          </div>
        )}
        {submitted && (
          <p
            className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-[12px] font-medium"
            style={{ background: "var(--clobs-forest-wash)", color: "var(--clobs-forest)" }}
          >
            Submitted and locked ✓
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[13rem_minmax(0,1fr)_20rem]">
      {/* Item rail — hover layer and active pill both GLIDE (María's
          gliding-everywhere rule, 2026-09-01, supersedes the static rail). */}
      <nav aria-label="Concepts">
        <GlideMenu className="space-y-1" highlightClassName="rounded-md bg-card">
          {concepts.map((c) => {
            const done = scores[c.itemNo].scoreNum != null;
            const active = c.itemNo === currentItem;
            return (
              <button
                key={c.itemNo}
                type="button"
                data-menu-row
                onClick={() => setCurrentItem(c.itemNo)}
                aria-current={active ? "true" : undefined}
                className="relative flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-[14px]"
              >
                {active && (
                  <motion.span
                    layoutId="scoring-rail-pill"
                    transition={reduce ? { duration: 0 } : SPRING_LAYOUT}
                    className="absolute inset-0 rounded-md bg-lake-wash"
                    aria-hidden
                  />
                )}
                <span
                  className={`relative z-10 flex w-full items-center gap-2 ${
                    active ? "text-ink" : "text-graphite"
                  }`}
                >
                  <span
                    aria-hidden
                    className="size-2 shrink-0 rounded-full"
                    style={{
                      background: done
                        ? "var(--clobs-forest)"
                        : "var(--clobs-hairline-strong)",
                    }}
                  />
                  <span className="mono text-[12px]">{c.itemNo}</span>
                  <span className="truncate">{c.name}</span>
                </span>
              </button>
            );
          })}
        </GlideMenu>
        <div className="pt-4">
          <p className="text-[12px] text-smoke">
            <span className="mono">{scoredCount}</span> of <span className="mono">8</span> scored
          </p>
          {scoredCount > 0 && (
            <button
              type="button"
              onClick={() => setReviewOpen(true)}
              className="mt-2 w-full rounded-md border border-hairline bg-paper px-3 py-2 text-[13px] font-medium text-ink transition-colors duration-[90ms] hover:bg-card active:scale-[0.98]"
            >
              Enter scores as a table
            </button>
          )}
          {!submitted && scoredCount === 8 && (
            <div className="mt-3 space-y-2">
              {emptyJustifications > 0 && (
                <p className="text-[12px] leading-[1.5] text-clay">
                  {emptyJustifications} item{emptyJustifications > 1 ? "s" : ""} still
                  need{emptyJustifications > 1 ? "" : "s"} a justification.
                  Scores cannot be submitted without them.
                </p>
              )}
              {!confirming ? (
                <button
                  type="button"
                  onClick={() => {
                    setConfirming(true);
                    setReviewOpen(true);
                  }}
                  className="w-full rounded-md bg-bark px-[18px] py-[10px] text-[15px] font-semibold text-paper transition-colors duration-[90ms] hover:bg-bark-deep active:scale-[0.98]"
                >
                  Review and submit
                </button>
              ) : (
                <button
                  type="button"
                  onClick={submit}
                  className="w-full rounded-md bg-bark px-[18px] py-[10px] text-[14px] font-semibold text-paper transition-colors duration-[90ms] hover:bg-bark-deep active:scale-[0.98]"
                >
                  Click again to confirm. Scores lock permanently
                </button>
              )}
              {submitError && (
                <p role="alert" className="text-[12px] text-clay">{submitError}</p>
              )}
            </div>
          )}
          {submitted && (
            <p
              className="mt-3 inline-flex items-center gap-2 rounded-full px-3 py-1 text-[12px] font-medium"
              style={{ background: "var(--clobs-forest-wash)", color: "var(--clobs-forest)" }}
            >
              Submitted and locked ✓
            </p>
          )}
        </div>
      </nav>

      {/* Rubric + scoring */}
      <div className="min-w-0 space-y-6">
        {moment && <MomentCard>{moment}</MomentCard>}
        <div className="rounded-xl border border-hairline bg-card p-6">
          <p className="text-[11px] font-medium uppercase tracking-[0.02em] text-smoke">
            Concept {concept.itemNo} of 8
          </p>
          <h2
            className="mt-1 font-serif text-ink"
            style={{
              fontSize: "var(--clobs-text-display)",
              lineHeight: "var(--clobs-leading-display)",
              letterSpacing: "var(--clobs-tracking-display)",
            }}
          >
            {concept.statement}
          </h2>
          <h3 className="mt-5 text-[12px] font-semibold uppercase tracking-[0.02em] text-smoke">
            Importance of concept
          </h3>
          <p
            className="mt-1 max-w-[68ch] font-serif text-graphite"
            style={{ fontSize: "var(--clobs-text-prose)", lineHeight: "var(--clobs-leading-prose)" }}
          >
            {concept.importance}
          </p>
          <h3 className="mt-5 text-[12px] font-semibold uppercase tracking-[0.02em] text-smoke">
            Indicators include
          </h3>
          <ul className="mt-1 max-w-[68ch] list-disc space-y-1 pl-5 text-[14px] leading-[1.55] text-ink">
            {concept.indicators.map((ind, i) => (
              <li key={i}>{ind}</li>
            ))}
          </ul>
          <div className="mt-5 rounded-sm bg-sunken p-3">
            <p className="text-[11px] font-medium uppercase tracking-[0.02em] text-smoke">
              Special note (read first)
            </p>
            <p className="mt-1 max-w-[68ch] font-serif text-[15px] leading-[1.6] text-graphite">
              {concept.specialNote}
            </p>
          </div>
          <details className="mt-4">
            <summary className="cursor-pointer rounded-sm text-[13px] text-lake">
              Reach scale and guiding rules
            </summary>
            <div className="mt-2 space-y-3 text-[14px] leading-[1.55] text-graphite">
              <div>
                {reachBands.map((b) => (
                  <p key={b.position} className="mt-1">
                    <span className="font-medium text-ink">{b.label}.</span> {b.text}
                  </p>
                ))}
              </div>
              <div className="border-t border-hairline pt-2">
                {rules.map((r) => (
                  <p key={r.position} className="mt-1">
                    <span className="font-medium text-ink">{r.label}.</span> {r.text}
                  </p>
                ))}
              </div>
            </div>
          </details>
        </div>

        <div className="space-y-3">
          <ScoreChips
            value={current.scoreNum}
            onSelect={select}
            disabled={submitted}
            itemNo={currentItem}
          />
          {anchorText && (
            <div
              key={`${currentItem}-${current.scoreNum}`}
              className="motion-safe:animate-[anchor-reveal_150ms_cubic-bezier(0.22,1,0.36,1)] rounded-lg border border-hairline bg-paper p-4"
            >
              <p className="text-[11px] font-medium uppercase tracking-[0.02em] text-smoke">
                Does this match what you saw?
              </p>
              <p className="mt-1 max-w-[68ch] font-serif text-[15px] leading-[1.6] text-graphite">
                {anchorText}
              </p>
            </div>
          )}
          <div className="flex items-start justify-between gap-4">
            <label className="w-full text-[14px] text-ink">
              Justification
              <textarea
                value={current.justification}
                disabled={submitted}
                onChange={(e) =>
                  setScores((prev) => ({
                    ...prev,
                    [currentItem]: { ...prev[currentItem], justification: e.target.value },
                  }))
                }
                rows={4}
                placeholder="What did you see or hear that supports this score?"
                className="mt-1 w-full resize-y rounded-md border border-hairline bg-paper p-3 text-[17px] leading-[1.65] text-ink placeholder:text-ash focus:border-hairline-strong disabled:bg-sunken disabled:text-graphite"
              />
            </label>
          </div>
          <div className="flex items-center justify-between">
            <AutosaveIndicator status={status} savedAt={savedAt} />
            <div className="flex gap-2">
              <button
                type="button"
                disabled={currentItem === 1}
                onClick={() => setCurrentItem((i) => Math.max(1, i - 1))}
                className="rounded-md border border-hairline-strong bg-paper px-4 py-2 text-[14px] font-semibold text-ink transition-colors duration-[90ms] hover:bg-card disabled:cursor-not-allowed disabled:text-ash"
              >
                ← Previous
              </button>
              {currentItem === 8 && !submitted ? (
                <button
                  type="button"
                  onClick={() => {
                    if (scoredCount === 8) setConfirming(true);
                    setReviewOpen(true);
                  }}
                  className="rounded-md bg-bark px-4 py-2 text-[14px] font-semibold text-paper transition-colors duration-[90ms] hover:bg-bark-deep active:scale-[0.98]"
                >
                  {scoredCount === 8 ? "Review and submit →" : "Review my scores →"}
                </button>
              ) : (
                <button
                  type="button"
                  disabled={currentItem === 8}
                  onClick={() => setCurrentItem((i) => Math.min(8, i + 1))}
                  className="rounded-md border border-hairline-strong bg-paper px-4 py-2 text-[14px] font-semibold text-ink transition-colors duration-[90ms] hover:bg-card disabled:cursor-not-allowed disabled:text-ash"
                >
                  Next →
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Notes, side by side (addendum §5). The HTML is the coder's OWN
          Tiptap output rendered back to them; sanitize before ever showing
          one coder's note to another (calibration, Stage 3). */}
      <aside
        aria-label="Your notes"
        className="hidden max-h-[75vh] overflow-y-auto rounded-xl border border-hairline bg-card p-4 xl:block"
      >
        <h3 className="text-[12px] font-semibold uppercase tracking-[0.02em] text-smoke">
          Your notes
        </h3>
        {!noteHtml || noteHtml === "<p></p>" ? (
          <p className="mt-2 text-[13px] text-graphite">
            Nothing yet. What you write in the Notes tab appears here while
            you score.
          </p>
        ) : (
          <div
            className="note-editor mt-1 !min-h-0 !p-0 text-[13px]"
            dangerouslySetInnerHTML={{ __html: noteHtml }}
          />
        )}
      </aside>
    </div>
  );
}

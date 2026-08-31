"use client";
/**
 * The calibration room. Client side of the co-presence flow:
 *
 *  - polls POST /join every few seconds — that is also the heartbeat.
 *    The server flips the session to 'open' when both coders are live,
 *    and only then does the payload start carrying partner data.
 *  - per concept: both individual scores side by side, a consensus chip
 *    row (same fixed encoding and tokens as scoring — NO motion, per
 *    DESIGN_SYSTEM §4), and a rationale field whenever anyone moved.
 *  - sign-off is two-step; the second signature completes and freezes
 *    the record.
 *
 * Partner note HTML arrives already sanitized server-side
 * (lib/sanitize-note.ts); it is rendered, never re-parsed.
 */
import { useCallback, useEffect, useRef, useState } from "react";

interface ScoreView {
  itemNo: number;
  scoreNum: number;
  scoreColumn: string;
  scoreDegree: string;
  justification: string | null;
}

interface ConsensusItem {
  itemNo: number;
  finalScoreNum: number;
  finalScoreColumn: string;
  finalScoreDegree: string;
  resolution: string;
  consensusRationale: string | null;
}

export interface RoomStateJson {
  videoId: string;
  displayCode: string;
  partnerName: string | null;
  sessionStatus: "none" | "scheduled" | "lobby" | "open" | "completed";
  partnerPresent: boolean;
  myScores: ScoreView[];
  myNoteHtml: string | null;
  partnerScores: ScoreView[] | null;
  partnerNoteHtml: string | null;
  items: ConsensusItem[];
  mySignedAt: string | null;
  partnerSignedAt: string | null;
  completedAt: string | null;
}

const SCORE_META = [
  { num: 1, label: "Column A — Very Accurate", fill: "var(--clobs-score-1)", edge: "var(--clobs-score-1-edge)" },
  { num: 2, label: "Column A — Somewhat Accurate", fill: "var(--clobs-score-2)", edge: "var(--clobs-score-2-edge)" },
  { num: 3, label: "Column B — Somewhat Accurate", fill: "var(--clobs-score-3)", edge: "var(--clobs-score-3-edge)" },
  { num: 4, label: "Column B — Very Accurate", fill: "var(--clobs-score-4)", edge: "var(--clobs-score-4-edge)" },
] as const;

const POLL_MS = 5000;

/* --------------------------- small pieces --------------------------- */

function ScoreBadge({ score }: { score: ScoreView | undefined }) {
  if (!score) return <span className="text-[13px] text-smoke">—</span>;
  const meta = SCORE_META[score.scoreNum - 1];
  return (
    <span
      className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[13px] text-ink"
      style={{ background: meta.fill, border: `1px solid ${meta.edge}` }}
    >
      <span
        className="mono flex size-5 shrink-0 items-center justify-center rounded-full text-[12px]"
        style={{ background: meta.edge, color: "var(--clobs-paper)" }}
      >
        {score.scoreNum}
      </span>
      {meta.label}
    </span>
  );
}

function ConsensusChips({
  itemNo,
  value,
  disabled,
  onSelect,
}: {
  itemNo: number;
  value: number | null;
  disabled: boolean;
  onSelect: (n: number) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={`Consensus score for concept ${itemNo}`}
      className="flex flex-wrap gap-2"
    >
      {SCORE_META.map((meta) => {
        const selected = value === meta.num;
        const somethingSelected = value != null;
        return (
          <button
            key={meta.num}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            onClick={() => onSelect(meta.num)}
            // Instant, like the scoring grid — no motion (DESIGN_SYSTEM §4).
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] text-ink disabled:cursor-not-allowed"
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
              className="mono flex size-5 shrink-0 items-center justify-center rounded-full text-[12px]"
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
            {meta.num <= 2 ? "A" : "B"} ·{" "}
            {meta.num === 1 || meta.num === 4 ? "Very" : "Somewhat"}
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

/** Overlapping initial bubbles: you and your partner. The partner's
 *  bubble fills in (forest ring) while they are live in the room. */
function PresenceBubbles({
  myName,
  partnerName,
  partnerPresent,
}: {
  myName: string;
  partnerName: string;
  partnerPresent: boolean;
}) {
  const initials = (s: string) =>
    s
      .split(/[\s.@_-]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]!.toUpperCase())
      .join("");
  const bubble = (name: string, present: boolean, z: string) => (
    <span
      title={present ? `${name} is here` : `${name} is not here yet`}
      className={`mono relative flex size-9 items-center justify-center rounded-full border-2 text-[12px] ${z}`}
      style={{
        background: present ? "var(--clobs-forest-wash)" : "var(--clobs-sunken)",
        borderColor: present ? "var(--clobs-forest)" : "var(--clobs-hairline-strong)",
        color: present ? "var(--clobs-ink)" : "var(--clobs-smoke)",
        opacity: present ? 1 : 0.7,
      }}
    >
      {initials(name)}
      {present && (
        <span
          aria-hidden
          className="absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full border-2"
          style={{
            background: "var(--clobs-forest)",
            borderColor: "var(--clobs-paper)",
          }}
        />
      )}
    </span>
  );
  return (
    <span className="flex items-center -space-x-2" aria-hidden>
      {bubble(myName, true, "z-10")}
      {bubble(partnerName, partnerPresent, "z-0")}
    </span>
  );
}

function NotePane({ title, html }: { title: string; html: string | null }) {
  return (
    <div className="min-w-0 rounded-lg border border-hairline bg-paper p-4">
      <p className="text-[11px] font-medium uppercase tracking-[0.02em] text-smoke">
        {title}
      </p>
      {html ? (
        <div
          className="mt-2 text-[14px] leading-[1.6] text-ink [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5"
          // Sanitized server-side in lib/sanitize-note.ts before it ever
          // reaches this payload.
          dangerouslySetInnerHTML={{ __html: html }}
        />
      ) : (
        <p className="mt-2 text-[13px] text-smoke">No notes were written.</p>
      )}
    </div>
  );
}

/* ------------------------------ room -------------------------------- */

export function CalibrationRoom({
  videoId,
  conceptNames,
  initial,
  myName,
}: {
  videoId: string;
  conceptNames: Record<number, string>;
  initial: RoomStateJson;
  myName: string;
}) {
  const [room, setRoom] = useState<RoomStateJson>(initial);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [itemErrors, setItemErrors] = useState<Record<number, string>>({});
  const [pending, setPending] = useState<Record<number, number>>({}); // itemNo → chosen score awaiting rationale
  const [rationales, setRationales] = useState<Record<number, string>>({});
  const [confirmingSign, setConfirmingSign] = useState(false);
  const [signError, setSignError] = useState<string | null>(null);
  const roomRef = useRef(room);
  useEffect(() => {
    roomRef.current = room;
  }, [room]);

  const completed = room.sessionStatus === "completed";
  const open = room.sessionStatus === "open" || completed;

  const join = useCallback(async () => {
    try {
      const res = await fetch(`/api/coder/calibration/${videoId}/join`, {
        method: "POST",
      });
      const json = await res.json();
      if (!res.ok) {
        setJoinError(json.error ?? "Something went wrong");
        return;
      }
      setJoinError(null);
      setRoom(json);
    } catch {
      // Offline blip — the next tick retries.
    }
  }, [videoId]);

  // Join immediately, then heartbeat. Polling continues after my own
  // signature so the partner's signature (and completion) shows up.
  useEffect(() => {
    if (completed) return;
    const t = setTimeout(join, 0); // join now, without a sync setState
    const id = setInterval(join, POLL_MS);
    return () => {
      clearTimeout(t);
      clearInterval(id);
    };
  }, [join, completed]);

  // Best-effort leave on unload.
  useEffect(() => {
    const leave = () =>
      navigator.sendBeacon(`/api/coder/calibration/${videoId}/leave`);
    window.addEventListener("pagehide", leave);
    return () => {
      window.removeEventListener("pagehide", leave);
      if (!roomRef.current || roomRef.current.sessionStatus !== "completed") {
        navigator.sendBeacon(`/api/coder/calibration/${videoId}/leave`);
      }
    };
  }, [videoId]);

  const myByItem = new Map(room.myScores.map((s) => [s.itemNo, s]));
  const partnerByItem = new Map(
    (room.partnerScores ?? []).map((s) => [s.itemNo, s]),
  );
  const consensusByItem = new Map(room.items.map((i) => [i.itemNo, i]));
  const agreedCount = room.items.length;

  async function saveItem(itemNo: number, finalScoreNum: number, rationale: string | null) {
    setItemErrors((e) => ({ ...e, [itemNo]: "" }));
    const res = await fetch(`/api/coder/calibration/${videoId}/items`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemNo, finalScoreNum, rationale }),
    });
    const json = await res.json();
    if (!res.ok) {
      setItemErrors((e) => ({ ...e, [itemNo]: json.error ?? "Could not save" }));
      return false;
    }
    setPending((p) => {
      const next = { ...p };
      delete next[itemNo];
      return next;
    });
    await join(); // pull the authoritative state
    return true;
  }

  function onSelect(itemNo: number, num: number) {
    const mine = myByItem.get(itemNo)?.scoreNum;
    const theirs = partnerByItem.get(itemNo)?.scoreNum;
    const isAgreed = mine === num && theirs === num;
    const existing = consensusByItem.get(itemNo);
    if (isAgreed) {
      void saveItem(itemNo, num, null);
    } else {
      setPending((p) => ({ ...p, [itemNo]: num }));
      if (existing?.consensusRationale && rationales[itemNo] === undefined) {
        setRationales((r) => ({ ...r, [itemNo]: existing.consensusRationale ?? "" }));
      }
    }
  }

  async function signOff() {
    if (!confirmingSign) {
      setConfirmingSign(true);
      setTimeout(() => setConfirmingSign(false), 5000);
      return;
    }
    setConfirmingSign(false);
    setSignError(null);
    const res = await fetch(`/api/coder/calibration/${videoId}/signoff`, {
      method: "POST",
    });
    const json = await res.json();
    if (!res.ok) {
      setSignError(json.error ?? "Could not sign");
      return;
    }
    await join();
  }

  /* ----------------------------- header ----------------------------- */

  const header = (
    <header className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-hairline bg-card p-5">
      <div>
        <p className="text-[11px] font-medium uppercase tracking-[0.02em] text-smoke">
          Calibration room
        </p>
        <h1 className="video-code mt-0.5 text-[22px] text-ink">
          {room.displayCode}
        </h1>
      </div>
      <div className="flex items-center gap-3 text-[14px]">
        <PresenceBubbles
          myName={myName}
          partnerName={room.partnerName ?? "Partner"}
          partnerPresent={room.partnerPresent || completed}
        />
        <span className={room.partnerPresent ? "text-ink" : "text-graphite"}>
          {completed
            ? `Calibrated with ${room.partnerName ?? "your partner"}`
            : room.partnerPresent
              ? `${room.partnerName ?? "Your partner"} is here`
              : `Waiting for ${room.partnerName ?? "your partner"}…`}
        </span>
      </div>
    </header>
  );

  /* ----------------------------- lobby ------------------------------ */

  if (!open) {
    return (
      <div className="space-y-6">
        {header}
        {joinError ? (
          <div className="elev-card rounded-xl border border-hairline bg-card p-6">
            <p role="alert" className="text-[15px] text-clay">
              {joinError}
            </p>
          </div>
        ) : (
          <div className="elev-card rounded-xl border border-hairline bg-card p-6">
            <p className="text-[15px] leading-[1.6] text-graphite">
              You are in the room. As soon as{" "}
              <span className="font-medium text-ink">
                {room.partnerName ?? "your partner"}
              </span>{" "}
              opens this video&apos;s room too, both sets of scores appear
              side by side. Nothing is revealed until you are both here.
            </p>
            <p className="mt-3 text-[13px] text-smoke">
              Keep this page open. It checks every few seconds.
            </p>
          </div>
        )}
      </div>
    );
  }

  /* --------------------------- open room ---------------------------- */

  return (
    <div className="space-y-6">
      {header}

      {completed && (
        <div
          className="rounded-xl border p-5"
          style={{
            borderColor: "var(--clobs-forest)",
            background: "var(--clobs-forest-wash, var(--clobs-card))",
          }}
        >
          <p className="text-[15px] font-medium text-ink">
            Calibration complete, signed by both of you.
          </p>
          <p className="mt-1 text-[13px] text-graphite">
            The record below is final. Individual scores stay on file
            unchanged, alongside the consensus.
          </p>
        </div>
      )}

      <section aria-label="Consensus by concept" className="space-y-4">
        <div className="flex items-baseline justify-between">
          <h2 className="text-[16px] font-medium text-ink">
            Agree on each concept
          </h2>
          <p className="text-[13px] text-smoke" aria-live="polite">
            <span className="mono">{agreedCount}</span> of{" "}
            <span className="mono">8</span> agreed
          </p>
        </div>

        {[1, 2, 3, 4, 5, 6, 7, 8].map((itemNo) => {
          const mine = myByItem.get(itemNo);
          const theirs = partnerByItem.get(itemNo);
          const consensus = consensusByItem.get(itemNo);
          const pendingNum = pending[itemNo];
          const selected = pendingNum ?? consensus?.finalScoreNum ?? null;
          const same =
            mine && theirs ? mine.scoreNum === theirs.scoreNum : false;
          const needsRationale =
            selected != null &&
            !(mine?.scoreNum === selected && theirs?.scoreNum === selected);

          return (
            <div
              key={itemNo}
              className="elev-card rounded-xl border border-hairline bg-card p-5"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-[15px] font-medium text-ink">
                  <span className="mono mr-2 text-[13px] text-smoke">
                    {itemNo}
                  </span>
                  {conceptNames[itemNo] ?? `Concept ${itemNo}`}
                </h3>
                <span
                  className={`text-[12px] ${same ? "text-smoke" : "text-clay"}`}
                >
                  {same ? "Same score" : "Scores differ"}
                </span>
              </div>

              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div className="min-w-0">
                  <p className="text-[11px] font-medium uppercase tracking-[0.02em] text-smoke">
                    You
                  </p>
                  <div className="mt-1.5">
                    <ScoreBadge score={mine} />
                  </div>
                  {mine?.justification && (
                    <p className="mt-2 text-[13px] leading-[1.5] text-graphite">
                      {mine.justification}
                    </p>
                  )}
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] font-medium uppercase tracking-[0.02em] text-smoke">
                    {room.partnerName ?? "Partner"}
                  </p>
                  <div className="mt-1.5">
                    <ScoreBadge score={theirs} />
                  </div>
                  {theirs?.justification && (
                    <p className="mt-2 text-[13px] leading-[1.5] text-graphite">
                      {theirs.justification}
                    </p>
                  )}
                </div>
              </div>

              <div className="mt-4 border-t border-hairline pt-4">
                <p className="text-[12px] font-medium text-ink">
                  Consensus
                  {consensus && !pendingNum && (
                    <span className="ml-2 font-normal text-smoke">
                      saved
                      {consensus.resolution !== "agreed" &&
                        " · rationale on record"}
                    </span>
                  )}
                </p>
                <div className="mt-2">
                  <ConsensusChips
                    itemNo={itemNo}
                    value={selected}
                    disabled={completed}
                    onSelect={(n) => onSelect(itemNo, n)}
                  />
                </div>

                {!completed && needsRationale && pendingNum != null && (
                  <div className="mt-3">
                    <label
                      htmlFor={`rationale-${itemNo}`}
                      className="block text-[13px] font-medium text-ink"
                    >
                      Why did the score move?
                    </label>
                    <div className="mt-1 flex flex-wrap items-end gap-2">
                      <textarea
                        id={`rationale-${itemNo}`}
                        rows={2}
                        value={rationales[itemNo] ?? ""}
                        onChange={(e) =>
                          setRationales((r) => ({ ...r, [itemNo]: e.target.value }))
                        }
                        placeholder="One or two sentences on what convinced you both."
                        className="block min-w-64 flex-1 resize-none rounded-md border border-hairline bg-paper px-3 py-2 text-[14px] text-ink focus:border-hairline-strong"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          void saveItem(itemNo, pendingNum, rationales[itemNo] ?? "")
                        }
                        className="shrink-0 rounded-md border border-hairline-strong bg-paper px-4 py-2 text-[14px] font-semibold text-ink transition-colors duration-[90ms] hover:bg-card active:scale-[0.98]"
                      >
                        Save consensus
                      </button>
                    </div>
                  </div>
                )}
                {!completed &&
                  consensus &&
                  !pendingNum &&
                  consensus.consensusRationale && (
                    <p className="mt-2 text-[13px] leading-[1.5] text-graphite">
                      {consensus.consensusRationale}
                    </p>
                  )}
                {completed && consensus?.consensusRationale && (
                  <p className="mt-2 text-[13px] leading-[1.5] text-graphite">
                    {consensus.consensusRationale}
                  </p>
                )}
                {itemErrors[itemNo] && (
                  <p role="alert" className="mt-2 text-[13px] text-clay">
                    {itemErrors[itemNo]}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </section>

      <details className="elev-card rounded-xl border border-hairline bg-card p-5" open>
        <summary className="cursor-pointer rounded-sm text-[14px] font-medium text-ink">
          Notes, side by side
        </summary>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <NotePane title="Your notes" html={room.myNoteHtml} />
          <NotePane
            title={`${room.partnerName ?? "Partner"}'s notes`}
            html={room.partnerNoteHtml}
          />
        </div>
      </details>

      {!completed && (
        <section
          aria-label="Sign off"
          className="elev-card rounded-xl border border-hairline bg-card p-5"
        >
          <h2 className="text-[15px] font-medium text-ink">Sign off</h2>
          <p className="mt-1 text-[13px] leading-[1.5] text-graphite">
            Both of you sign once all eight consensus scores are recorded;
            after the second signature the calibration is final and can never
            be edited.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            {room.mySignedAt ? (
              <span className="text-[14px]" style={{ color: "var(--clobs-forest)" }}>
                You signed. Waiting for{" "}
                {room.partnerName ?? "your partner"} to sign.
              </span>
            ) : (
              <button
                type="button"
                disabled={agreedCount < 8}
                onClick={() => void signOff()}
                className="rounded-md bg-bark px-[18px] py-[10px] text-[15px] font-semibold text-paper transition-colors duration-[90ms] hover:bg-bark-deep active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {confirmingSign
                  ? "Click again to sign. This is final"
                  : agreedCount < 8
                    ? `Sign off (${agreedCount} of 8 agreed)`
                    : "Sign off on this calibration"}
              </button>
            )}
            {room.partnerSignedAt && !room.mySignedAt && (
              <span className="text-[13px] text-graphite">
                {room.partnerName ?? "Your partner"} has already signed.
              </span>
            )}
          </div>
          {signError && (
            <p role="alert" className="mt-2 text-[13px] text-clay">
              {signError}
            </p>
          )}
        </section>
      )}
    </div>
  );
}

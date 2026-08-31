"use client";
/**
 * The 8-item master-score form. Same chips and fixed encoding as the
 * coder's scoring grid (and the same rule: selection is instant, no
 * motion). One save button writes all completed items.
 */
import { useState, useTransition } from "react";
import { saveGoldScoresAction } from "../actions";

const SCORE_META = [
  { num: 1, label: "A · Very", fill: "var(--clobs-score-1)", edge: "var(--clobs-score-1-edge)" },
  { num: 2, label: "A · Somewhat", fill: "var(--clobs-score-2)", edge: "var(--clobs-score-2-edge)" },
  { num: 3, label: "B · Somewhat", fill: "var(--clobs-score-3)", edge: "var(--clobs-score-3-edge)" },
  { num: 4, label: "B · Very", fill: "var(--clobs-score-4)", edge: "var(--clobs-score-4-edge)" },
] as const;

interface ItemState {
  scoreNum: number | null;
  rationale: string;
}

export function GoldScoreForm({
  videoId,
  concepts,
  existing,
}: {
  videoId: string;
  concepts: Array<{ itemNo: number; name: string }>;
  existing: Array<{ itemNo: number; scoreNum: number; rationale: string | null }>;
}) {
  const [items, setItems] = useState<Record<number, ItemState>>(() => {
    const base: Record<number, ItemState> = {};
    for (let i = 1; i <= 8; i++) {
      const prior = existing.find((e) => e.itemNo === i);
      base[i] = {
        scoreNum: prior?.scoreNum ?? null,
        rationale: prior?.rationale ?? "",
      };
    }
    return base;
  });
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const scored = Object.values(items).filter((i) => i.scoreNum !== null).length;
  const nameOf = (n: number) =>
    concepts.find((c) => c.itemNo === n)?.name ?? `Concept ${n}`;

  function save() {
    startTransition(async () => {
      setMessage(null);
      const payload = Object.entries(items)
        .filter(([, v]) => v.scoreNum !== null)
        .map(([k, v]) => ({
          itemNo: Number(k),
          scoreNum: v.scoreNum!,
          rationale: v.rationale.trim() || null,
        }));
      const r = await saveGoldScoresAction(videoId, payload);
      setMessage(
        r.ok
          ? { kind: "ok", text: `Saved ${payload.length} master score${payload.length === 1 ? "" : "s"}.` }
          : { kind: "error", text: r.error ?? "Something went wrong" },
      );
    });
  }

  return (
    <div className="space-y-4">
      {[1, 2, 3, 4, 5, 6, 7, 8].map((itemNo) => {
        const item = items[itemNo];
        return (
          <div
            key={itemNo}
            className="elev-card rounded-2xl border border-hairline bg-card p-5"
          >
            <h3 className="text-[15px] font-medium text-ink">
              <span className="mono mr-2 text-[13px] text-smoke">{itemNo}</span>
              {nameOf(itemNo)}
            </h3>
            <div
              role="radiogroup"
              aria-label={`Master score for concept ${itemNo}`}
              className="mt-3 flex flex-wrap gap-2"
            >
              {SCORE_META.map((meta) => {
                const selected = item.scoreNum === meta.num;
                const somethingSelected = item.scoreNum !== null;
                return (
                  <button
                    key={meta.num}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() =>
                      setItems((prev) => ({
                        ...prev,
                        [itemNo]: { ...item, scoreNum: meta.num },
                      }))
                    }
                    className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] text-ink"
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
                    {meta.label}
                    {selected && (
                      <span aria-hidden style={{ color: meta.edge }}>
                        ✓
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            <label
              htmlFor={`gold-rationale-${itemNo}`}
              className="mt-3 block text-[13px] font-medium text-ink"
            >
              Rationale (optional, feeds the AI training)
            </label>
            <textarea
              id={`gold-rationale-${itemNo}`}
              rows={2}
              value={item.rationale}
              onChange={(e) =>
                setItems((prev) => ({
                  ...prev,
                  [itemNo]: { ...item, rationale: e.target.value },
                }))
              }
              className="mt-1 block w-full resize-none rounded-md border border-hairline bg-paper px-3 py-2 text-[14px] text-ink focus:border-hairline-strong"
            />
          </div>
        );
      })}

      <div className="flex items-center justify-between gap-4">
        <span aria-live="polite" className="text-[13px]">
          {message?.kind === "error" && <span className="text-clay">{message.text}</span>}
          {message?.kind === "ok" && (
            <span style={{ color: "var(--clobs-forest)" }}>{message.text}</span>
          )}
        </span>
        <button
          type="button"
          disabled={pending || scored === 0}
          onClick={save}
          className="rounded-md bg-bark px-[18px] py-[10px] text-[15px] font-semibold text-paper transition-colors duration-[90ms] hover:bg-bark-deep active:scale-[0.98] disabled:bg-sunken disabled:text-ash"
        >
          {pending ? "Saving…" : `Save master scores (${scored} of 8)`}
        </button>
      </div>
    </div>
  );
}

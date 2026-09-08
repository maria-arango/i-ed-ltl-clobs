"use client";
/**
 * The context card, ODK style: one question per screen, a progress line,
 * Back / Next, adults added one at a time, Submit at the end. Saves through
 * the same API as the full form (autosave with a local mirror), so a lost
 * connection never loses an answer. No motion on the inputs themselves.
 */
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AutosaveIndicator } from "@/components/workspace/autosave-indicator";
import { MomentCard } from "@/components/ui/moment-card";
import { encouragement } from "@/lib/encouragement";
import { useAutosave } from "@/lib/use-autosave";
import type { AdultData, CardData } from "@/components/workspace/context-card-form";

const EMPTY_ADULT = (n: number): AdultData => ({
  adultNo: n,
  role: n === 1 ? "teacher" : null,
  sex: null,
  clothing: null,
  clothingCaveats: null,
  features: null,
  behavior: null,
  speaks: null,
});

const EMPTY: CardData = {
  subject: null,
  composition: null,
  approxCount: null,
  uniforms: null,
  appearanceCaveats: null,
  room: null,
  camera: null,
  notes: null,
  timeline: null,
  settingChange: null,
  adults: [EMPTY_ADULT(1)],
};

type GeneralKey = Exclude<keyof CardData, "adults" | "subject">;
type Step =
  | { kind: "general"; key: GeneralKey; label: string; help?: string; input: "select" | "text" | "textarea"; options?: string[]; required?: boolean }
  | { kind: "adult"; adultNo: number }
  | { kind: "more_adults" }
  | { kind: "review" };

const GENERAL: Array<Extract<Step, { kind: "general" }>> = [
  { kind: "general", key: "composition", label: "Who are the pupils?", input: "select", options: ["all_boys", "all_girls", "mixed"], required: true },
  { kind: "general", key: "approxCount", label: "About how many pupils?", help: "A number, a range, or 'unknown'.", input: "text", required: true },
  { kind: "general", key: "uniforms", label: "What are the pupils wearing?", input: "textarea" },
  { kind: "general", key: "appearanceCaveats", label: "Anything about appearance the AI should know?", input: "textarea" },
  { kind: "general", key: "room", label: "Describe the room", input: "textarea" },
  { kind: "general", key: "camera", label: "Where is the camera?", input: "textarea" },
  { kind: "general", key: "timeline", label: "How did the lesson unfold?", input: "textarea" },
  { kind: "general", key: "settingChange", label: "Did the setting change mid-recording?", help: "Rare. Leave empty if not.", input: "textarea" },
  { kind: "general", key: "notes", label: "Anything else about the setting?", input: "textarea" },
];

const inputCls =
  "w-full rounded-md border border-hairline bg-paper p-3 text-[17px] leading-[1.6] text-ink placeholder:text-ash focus:border-hairline-strong disabled:bg-sunken disabled:text-graphite";
const optionCls = (on: boolean) =>
  `w-full rounded-xl border px-4 py-4 text-left text-[17px] transition-colors duration-[90ms] active:scale-[0.99] ${
    on ? "border-lake bg-lake-wash text-ink" : "border-hairline-strong bg-paper text-ink hover:bg-card"
  }`;

export function SimpleCardStepper({
  videoId,
  initialCard,
  initialStatus,
  fieldHelp,
}: {
  videoId: string;
  initialCard: CardData | null;
  initialStatus: "none" | "draft" | "submitted";
  fieldHelp: Record<string, string>;
}) {
  const router = useRouter();
  const [card, setCard] = useState<CardData>(initialCard ?? EMPTY);
  const [status, setStatus] = useState(initialStatus);
  const [index, setIndex] = useState(0);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [moment, setMoment] = useState<string | null>(null);
  const editable = status !== "submitted";

  const steps: Step[] = useMemo(() => {
    const s: Step[] = [...GENERAL];
    for (const a of card.adults) s.push({ kind: "adult", adultNo: a.adultNo });
    s.push({ kind: "more_adults" }, { kind: "review" });
    return s;
  }, [card.adults]);
  const step = steps[Math.min(index, steps.length - 1)];

  const { status: saveStatus, savedAt, flush } = useAutosave({
    value: card,
    storageKey: `card-${videoId}`,
    enabled: editable,
    save: async (v) => {
      const res = await fetch(`/api/coder/videos/${videoId}/context-card`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(v),
      });
      if (!res.ok) throw new Error("save failed");
      if (status === "none") setStatus("draft");
    },
  });

  const set = (key: GeneralKey, value: string) => setCard((p) => ({ ...p, [key]: value === "" ? null : value }));
  const setAdult = (n: number, key: keyof AdultData, value: string) =>
    setCard((p) => ({ ...p, adults: p.adults.map((a) => (a.adultNo === n ? { ...a, [key]: value === "" ? null : value } : a)) }));
  const addAdult = () => {
    const used = new Set(card.adults.map((a) => a.adultNo));
    const next = [1, 2, 3, 4, 5, 6].find((n) => !used.has(n));
    if (!next) return;
    setCard((p) => ({ ...p, adults: [...p.adults, EMPTY_ADULT(next)] }));
    setIndex(GENERAL.length + card.adults.length); // jump to the new adult
  };
  const removeAdult = (n: number) => {
    setCard((p) => ({ ...p, adults: p.adults.filter((a) => a.adultNo !== n) }));
    setIndex((i) => Math.max(0, i - 1));
  };

  const submit = async () => {
    setError(null);
    await flush();
    const res = await fetch(`/api/coder/videos/${videoId}/context-card/submit`, { method: "POST" });
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: "Submission failed" }));
      setError(body.error ?? "Submission failed");
      setConfirming(false);
      return;
    }
    setStatus("submitted");
    setMoment(encouragement.cardSubmitted());
    setConfirming(false);
  };

  const canNext = step.kind !== "general" || !step.required || !!card[step.key];
  const progress = Math.round(((index + 1) / steps.length) * 100);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between text-[13px] text-smoke">
        <span>
          {index + 1} of {steps.length}
        </span>
        <AutosaveIndicator status={saveStatus} savedAt={savedAt} />
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-sunken" aria-hidden>
        <div className="h-full rounded-full bg-lake transition-[width] duration-200 motion-reduce:transition-none" style={{ width: `${progress}%` }} />
      </div>

      {moment && <MomentCard>{moment}</MomentCard>}

      <section className="elev-card space-y-4 rounded-2xl border border-hairline bg-card p-5">
        {step.kind === "general" && (
          <>
            <h2 className="font-serif text-[24px] leading-[1.25] text-ink">{step.label}</h2>
            {(step.help ?? fieldHelp[step.key === "approxCount" ? "approx_count" : step.key === "appearanceCaveats" ? "appearance_caveats" : step.key === "settingChange" ? "setting_change" : step.key]) && (
              <p className="text-[14px] leading-[1.5] text-smoke">
                {step.help ?? fieldHelp[step.key === "approxCount" ? "approx_count" : step.key === "appearanceCaveats" ? "appearance_caveats" : step.key === "settingChange" ? "setting_change" : step.key]}
              </p>
            )}
            {step.input === "select" ? (
              <div className="space-y-2">
                {step.options!.map((o) => (
                  <button key={o} type="button" disabled={!editable} onClick={() => set(step.key, o)} aria-pressed={card[step.key] === o} className={optionCls(card[step.key] === o)}>
                    {o.replace("_", " ")}
                  </button>
                ))}
              </div>
            ) : step.input === "text" ? (
              <input disabled={!editable} value={card[step.key] ?? ""} onChange={(e) => set(step.key, e.target.value)} className={inputCls} />
            ) : (
              <textarea disabled={!editable} rows={5} value={card[step.key] ?? ""} onChange={(e) => set(step.key, e.target.value)} className={inputCls} />
            )}
          </>
        )}

        {step.kind === "adult" && (() => {
          const a = card.adults.find((x) => x.adultNo === step.adultNo)!;
          return (
            <>
              <div className="flex items-baseline justify-between">
                <h2 className="font-serif text-[24px] leading-[1.25] text-ink">Adult {step.adultNo}</h2>
                {editable && card.adults.length > 1 && (
                  <button type="button" onClick={() => removeAdult(a.adultNo)} className="text-[13px] text-clay underline-offset-2 hover:underline">
                    Remove
                  </button>
                )}
              </div>
              <p className="text-[14px] text-smoke">Role</p>
              <div className="grid grid-cols-3 gap-2">
                {["teacher", "camera_operator", "other"].map((o) => (
                  <button key={o} type="button" disabled={!editable} onClick={() => setAdult(a.adultNo, "role", o)} aria-pressed={a.role === o} className={optionCls(a.role === o)}>
                    {o.replace("_", " ")}
                  </button>
                ))}
              </div>
              <p className="text-[14px] text-smoke">Sex</p>
              <div className="grid grid-cols-3 gap-2">
                {["female", "male", "unknown"].map((o) => (
                  <button key={o} type="button" disabled={!editable} onClick={() => setAdult(a.adultNo, "sex", o)} aria-pressed={a.sex === o} className={optionCls(a.sex === o)}>
                    {o}
                  </button>
                ))}
              </div>
              <p className="text-[14px] text-smoke">Speaks on camera?</p>
              <div className="grid grid-cols-2 gap-2">
                {["yes", "no"].map((o) => (
                  <button key={o} type="button" disabled={!editable} onClick={() => setAdult(a.adultNo, "speaks", o)} aria-pressed={a.speaks === o} className={optionCls(a.speaks === o)}>
                    {o}
                  </button>
                ))}
              </div>
              <label className="block text-[14px] text-smoke">
                Clothing
                <textarea disabled={!editable} rows={2} value={a.clothing ?? ""} onChange={(e) => setAdult(a.adultNo, "clothing", e.target.value)} className={`${inputCls} mt-1`} />
              </label>
              <label className="block text-[14px] text-smoke">
                Distinguishing features
                <textarea disabled={!editable} rows={2} value={a.features ?? ""} onChange={(e) => setAdult(a.adultNo, "features", e.target.value)} className={`${inputCls} mt-1`} />
              </label>
              <label className="block text-[14px] text-smoke">
                What do they do during the lesson?
                <textarea disabled={!editable} rows={3} value={a.behavior ?? ""} onChange={(e) => setAdult(a.adultNo, "behavior", e.target.value)} className={`${inputCls} mt-1`} />
              </label>
            </>
          );
        })()}

        {step.kind === "more_adults" && (
          <>
            <h2 className="font-serif text-[24px] leading-[1.25] text-ink">Is there another adult in the room?</h2>
            <p className="text-[14px] text-smoke">
              {card.adults.length} recorded so far. Up to six.
            </p>
            {editable && card.adults.length < 6 && (
              <button type="button" onClick={addAdult} className={optionCls(false)}>
                Yes, add another adult
              </button>
            )}
            <button type="button" onClick={() => setIndex(steps.length - 1)} className={optionCls(false)}>
              No, that is everyone
            </button>
          </>
        )}

        {step.kind === "review" && (
          <>
            <h2 className="font-serif text-[24px] leading-[1.25] text-ink">
              {status === "submitted" ? "Your card is submitted" : "Check and submit"}
            </h2>
            <dl className="space-y-2 text-[15px]">
              {GENERAL.map((g) => (
                <div key={g.key} className="flex justify-between gap-4 border-t border-hairline pt-2 first:border-t-0 first:pt-0">
                  <dt className="text-smoke">{g.label}</dt>
                  <dd className="max-w-[60%] text-right text-ink">{card[g.key]?.toString().replace("_", " ") || <span className="text-ash">–</span>}</dd>
                </div>
              ))}
              <div className="flex justify-between gap-4 border-t border-hairline pt-2">
                <dt className="text-smoke">Adults</dt>
                <dd className="text-right text-ink">{card.adults.map((a) => `${a.role ?? "?"} (${a.sex ?? "?"})`).join(", ")}</dd>
              </div>
            </dl>
            {editable && (
              <div className="space-y-2 pt-2">
                {!confirming ? (
                  <button type="button" onClick={() => setConfirming(true)} className="w-full rounded-md bg-bark px-[18px] py-[14px] text-[17px] font-semibold text-paper transition-colors duration-[90ms] hover:bg-bark-deep active:scale-[0.98]">
                    Submit context card
                  </button>
                ) : (
                  <button type="button" onClick={submit} className="w-full rounded-md bg-bark px-[18px] py-[14px] text-[16px] font-semibold text-paper transition-colors duration-[90ms] hover:bg-bark-deep active:scale-[0.98]">
                    Tap again to confirm. The card becomes read-only
                  </button>
                )}
                {error && (
                  <p role="alert" className="text-[14px] text-clay">
                    {error}
                  </p>
                )}
              </div>
            )}
            {status === "submitted" && (
              <button type="button" onClick={() => router.push(`/s/videos/${videoId}`)} className="w-full rounded-md border border-hairline-strong bg-paper px-[18px] py-[14px] text-[16px] font-semibold text-ink transition-colors duration-[90ms] hover:bg-card active:scale-[0.98]">
                Back to the video
              </button>
            )}
          </>
        )}
      </section>

      {step.kind !== "review" && (
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            disabled={index === 0}
            onClick={() => setIndex((i) => Math.max(0, i - 1))}
            className="rounded-md border border-hairline-strong bg-paper px-[18px] py-[14px] text-[16px] font-semibold text-ink transition-colors duration-[90ms] hover:bg-card active:scale-[0.98] disabled:cursor-not-allowed disabled:text-ash"
          >
            ← Back
          </button>
          {step.kind !== "more_adults" && (
            <button
              type="button"
              disabled={!canNext}
              onClick={() => setIndex((i) => Math.min(steps.length - 1, i + 1))}
              className="rounded-md bg-bark px-[22px] py-[14px] text-[16px] font-semibold text-paper transition-colors duration-[90ms] hover:bg-bark-deep active:scale-[0.98] disabled:bg-sunken disabled:text-ash"
            >
              Next →
            </button>
          )}
        </div>
      )}
    </div>
  );
}

"use client";
/**
 * The context card — one per video (Amendments A + B). Only the assigned
 * filler edits it; add/remove adults (up to six); the field instructions
 * from the original instrument render as inline help. Comfortable density,
 * no motion. The non-author sees a locked note until they submit their own
 * scores, then a read-only view.
 */
import { useState } from "react";
import { AutosaveIndicator } from "@/components/workspace/autosave-indicator";
import { encouragement } from "@/lib/encouragement";
import { useAutosave } from "@/lib/use-autosave";

export interface AdultData {
  adultNo: number;
  role: string | null;
  sex: string | null;
  clothing: string | null;
  clothingCaveats: string | null;
  features: string | null;
  behavior: string | null;
  speaks: string | null;
}

export interface CardData {
  subject: string | null;
  composition: string | null;
  approxCount: string | null;
  uniforms: string | null;
  appearanceCaveats: string | null;
  room: string | null;
  camera: string | null;
  notes: string | null;
  timeline: string | null;
  settingChange: string | null;
  adults: AdultData[];
}

const EMPTY_CARD: CardData = {
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
  adults: [{ adultNo: 1, role: "teacher", sex: null, clothing: null, clothingCaveats: null, features: null, behavior: null, speaks: null }],
};

function Field({
  label,
  help,
  children,
}: {
  label: string;
  help?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block text-[14px] font-medium text-ink">
      {label}
      {help && (
        <span className="mt-0.5 block text-[12px] font-normal leading-[1.5] text-smoke">
          {help}
        </span>
      )}
      <span className="mt-1 block">{children}</span>
    </label>
  );
}

const inputCls =
  "w-full rounded-md border border-hairline bg-paper p-3 text-[15px] leading-[1.6] text-ink placeholder:text-ash focus:border-hairline-strong disabled:bg-sunken disabled:text-graphite";

export function ContextCardForm({
  videoId,
  initialCard,
  initialStatus,
  fieldHelp,
  mode,
  onStatusChange,
}: {
  videoId: string;
  initialCard: CardData | null;
  initialStatus: "none" | "draft" | "submitted";
  fieldHelp: Record<string, string>;
  /** 'edit' (assigned filler), 'locked' (partner, pre-submission),
   *  'readonly' (partner, released). */
  mode: "edit" | "locked" | "readonly";
  onStatusChange?: (status: "none" | "draft" | "submitted") => void;
}) {
  const [card, setCard] = useState<CardData>(initialCard ?? EMPTY_CARD);
  const [status, setStatusRaw] = useState(initialStatus);
  const setStatus = (s: "none" | "draft" | "submitted") => {
    setStatusRaw(s);
    onStatusChange?.(s);
  };
  const [confirming, setConfirming] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [moment, setMoment] = useState<string | null>(null);
  const editable = mode === "edit" && status !== "submitted";

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

  if (mode === "locked") {
    return (
      <div className="max-w-[68ch] rounded-xl border border-hairline bg-card p-6">
        <p className="text-[15px] leading-[1.6] text-graphite">
          Your partner is filling the context card for this video. It appears
          here after you submit your own scores, so it cannot colour what
          you see first.
        </p>
      </div>
    );
  }

  const set = (key: keyof CardData, value: string) =>
    setCard((prev) => ({ ...prev, [key]: value === "" ? null : value }));

  const setAdult = (adultNo: number, key: keyof AdultData, value: string) =>
    setCard((prev) => ({
      ...prev,
      adults: prev.adults.map((a) =>
        a.adultNo === adultNo ? { ...a, [key]: value === "" ? null : value } : a,
      ),
    }));

  const addAdult = () => {
    setCard((prev) => {
      const used = new Set(prev.adults.map((a) => a.adultNo));
      const next = [1, 2, 3, 4, 5, 6].find((n) => !used.has(n));
      if (!next) return prev;
      return {
        ...prev,
        adults: [
          ...prev.adults,
          { adultNo: next, role: null, sex: null, clothing: null, clothingCaveats: null, features: null, behavior: null, speaks: null },
        ],
      };
    });
  };

  const removeAdult = (adultNo: number) =>
    setCard((prev) => ({
      ...prev,
      adults: prev.adults.filter((a) => a.adultNo !== adultNo),
    }));

  const submit = async () => {
    setSubmitError(null);
    await flush();
    const res = await fetch(`/api/coder/videos/${videoId}/context-card/submit`, {
      method: "POST",
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: "Submission failed" }));
      setSubmitError(body.error ?? "Submission failed");
      setConfirming(false);
      return;
    }
    setStatus("submitted");
    setConfirming(false);
    setMoment(encouragement.cardSubmitted());
  };

  return (
    <div className="max-w-[68ch] space-y-6">
      {mode === "readonly" && (
        <p className="rounded-lg bg-lake-wash p-3 text-[13px] leading-[1.5] text-ink">
          Your partner wrote this card. Read-only.
        </p>
      )}
      {moment && (
        <div
          role="status"
          className="flex items-center gap-4 rounded-xl border border-hairline p-5"
          style={{ background: "var(--clobs-forest-wash)" }}
        >
          <span
            aria-hidden
            className="flex size-10 shrink-0 items-center justify-center rounded-full"
            style={{ background: "var(--clobs-forest)", color: "var(--clobs-paper)" }}
          >
            ✓
          </span>
          <p
            className="font-serif text-ink"
            style={{ fontSize: "var(--clobs-text-prose)", lineHeight: "var(--clobs-leading-prose)" }}
          >
            {moment}
          </p>
        </div>
      )}
      {status === "submitted" && mode === "edit" && !moment && (
        <p
          className="inline-flex items-center rounded-full px-3 py-1 text-[12px] font-medium"
          style={{ background: "var(--clobs-forest-wash)", color: "var(--clobs-forest)" }}
        >
          Card submitted
        </p>
      )}

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Subject" help={fieldHelp.subject}>
          <input disabled={!editable} value={card.subject ?? ""} onChange={(e) => set("subject", e.target.value)} className={inputCls} />
        </Field>
        <Field label="Composition" help={fieldHelp.composition}>
          <select
            disabled={!editable}
            value={card.composition ?? ""}
            onChange={(e) => set("composition", e.target.value)}
            className={inputCls}
          >
            <option value="">—</option>
            <option value="all_boys">all_boys</option>
            <option value="all_girls">all_girls</option>
            <option value="mixed">mixed</option>
          </select>
        </Field>
        <Field label="Approximate count" help={fieldHelp.approx_count}>
          <input disabled={!editable} value={card.approxCount ?? ""} onChange={(e) => set("approxCount", e.target.value)} className={inputCls} />
        </Field>
        <Field label="Uniforms" help={fieldHelp.uniforms}>
          <input disabled={!editable} value={card.uniforms ?? ""} onChange={(e) => set("uniforms", e.target.value)} className={inputCls} />
        </Field>
      </div>

      <Field label="Appearance caveats" help={fieldHelp.appearance_caveats}>
        <textarea disabled={!editable} rows={2} value={card.appearanceCaveats ?? ""} onChange={(e) => set("appearanceCaveats", e.target.value)} className={inputCls} />
      </Field>
      <Field label="Room" help={fieldHelp.room}>
        <textarea disabled={!editable} rows={2} value={card.room ?? ""} onChange={(e) => set("room", e.target.value)} className={inputCls} />
      </Field>
      <Field label="Camera" help={fieldHelp.camera}>
        <textarea disabled={!editable} rows={2} value={card.camera ?? ""} onChange={(e) => set("camera", e.target.value)} className={inputCls} />
      </Field>
      <Field label="Notes" help={fieldHelp.notes}>
        <textarea disabled={!editable} rows={2} value={card.notes ?? ""} onChange={(e) => set("notes", e.target.value)} className={inputCls} />
      </Field>

      {/* Adults */}
      <section aria-label="Adults" className="space-y-4">
        <h3 className="text-[12px] font-semibold uppercase tracking-[0.02em] text-smoke">
          Adults in the recording
        </h3>
        {card.adults.map((adult) => (
          <div key={adult.adultNo} className="rounded-xl border border-hairline bg-card p-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="mono text-[12px] text-graphite">Adult A{adult.adultNo}</span>
              {editable && card.adults.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeAdult(adult.adultNo)}
                  className="rounded-sm text-[12px] text-smoke underline-offset-2 hover:text-clay hover:underline"
                >
                  Remove
                </button>
              )}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Role" help={fieldHelp.adult_role}>
                <select disabled={!editable} value={adult.role ?? ""} onChange={(e) => setAdult(adult.adultNo, "role", e.target.value)} className={inputCls}>
                  <option value="">—</option>
                  <option value="teacher">teacher</option>
                  <option value="camera_operator">camera_operator</option>
                  <option value="other">other</option>
                </select>
              </Field>
              <Field label="Sex" help={fieldHelp.adult_sex}>
                <select disabled={!editable} value={adult.sex ?? ""} onChange={(e) => setAdult(adult.adultNo, "sex", e.target.value)} className={inputCls}>
                  <option value="">—</option>
                  <option value="male">male</option>
                  <option value="female">female</option>
                  <option value="unknown">unknown</option>
                </select>
              </Field>
              <Field label="Clothing" help={fieldHelp.adult_clothing}>
                <input disabled={!editable} value={adult.clothing ?? ""} onChange={(e) => setAdult(adult.adultNo, "clothing", e.target.value)} className={inputCls} />
              </Field>
              <Field label="Clothing caveats" help={fieldHelp.adult_clothing_caveats}>
                <input disabled={!editable} value={adult.clothingCaveats ?? ""} onChange={(e) => setAdult(adult.adultNo, "clothingCaveats", e.target.value)} className={inputCls} />
              </Field>
              <Field label="Features" help={fieldHelp.adult_features}>
                <input disabled={!editable} value={adult.features ?? ""} onChange={(e) => setAdult(adult.adultNo, "features", e.target.value)} className={inputCls} />
              </Field>
              <Field label="Speaks" help={fieldHelp.adult_speaks}>
                <select disabled={!editable} value={adult.speaks ?? ""} onChange={(e) => setAdult(adult.adultNo, "speaks", e.target.value)} className={inputCls}>
                  <option value="">—</option>
                  <option value="yes">yes</option>
                  <option value="no">no</option>
                </select>
              </Field>
            </div>
            <div className="mt-4">
              <Field label="Behavior" help={fieldHelp.adult_behavior}>
                <textarea disabled={!editable} rows={2} value={adult.behavior ?? ""} onChange={(e) => setAdult(adult.adultNo, "behavior", e.target.value)} className={inputCls} />
              </Field>
            </div>
          </div>
        ))}
        {editable && card.adults.length < 6 && (
          <button
            type="button"
            onClick={addAdult}
            className="rounded-md border border-hairline-strong bg-paper px-[18px] py-[10px] text-[15px] font-semibold text-ink transition-colors duration-[90ms] hover:bg-card active:scale-[0.98]"
          >
            Add adult
          </button>
        )}
      </section>

      <Field label="Timeline" help={fieldHelp.timeline}>
        <textarea disabled={!editable} rows={4} value={card.timeline ?? ""} onChange={(e) => set("timeline", e.target.value)} className={inputCls} />
      </Field>
      <Field label="Setting change" help={fieldHelp.setting_change}>
        <textarea disabled={!editable} rows={2} value={card.settingChange ?? ""} onChange={(e) => set("settingChange", e.target.value)} className={inputCls} />
      </Field>

      {editable && (
        <div className="flex items-center justify-between border-t border-hairline pt-4">
          <AutosaveIndicator status={saveStatus} savedAt={savedAt} />
          <div className="space-y-2 text-right">
            {!confirming ? (
              <button
                type="button"
                onClick={() => setConfirming(true)}
                className="rounded-md bg-bark px-[18px] py-[10px] text-[15px] font-semibold text-paper transition-colors duration-[90ms] hover:bg-bark-deep active:scale-[0.98]"
              >
                Submit context card
              </button>
            ) : (
              <button
                type="button"
                onClick={submit}
                className="rounded-md bg-bark px-[18px] py-[10px] text-[14px] font-semibold text-paper transition-colors duration-[90ms] hover:bg-bark-deep active:scale-[0.98]"
              >
                Click again to confirm. The card becomes read-only
              </button>
            )}
            {submitError && (
              <p role="alert" className="text-[12px] text-clay">{submitError}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

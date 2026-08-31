import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Style guide — LTL CLOBS",
};

/* Internal reference page: every token from DESIGN_SYSTEM.md §9 rendered for
   inspection. Not linked from the application shell. */

const surfaces = [
  { name: "Paper", token: "--clobs-paper", value: "#FBF8F1", note: "Page canvas. Never #ffffff." },
  { name: "Card", token: "--clobs-card", value: "#F5F1E8", note: "Cards, panels, rubric pane." },
  { name: "Sunken", token: "--clobs-sunken", value: "#EDE8DC", note: "Input wells, table headers." },
  { name: "Hairline", token: "--clobs-hairline", value: "#DFD8C8", note: "Default 1px border." },
  { name: "Hairline Strong", token: "--clobs-hairline-strong", value: "#C9C0AC", note: "Group boundaries, focused input border." },
];

const inks = [
  { name: "Ink", token: "--clobs-ink", value: "#23201A", note: "Headings, body, values. 15.1:1 on Paper." },
  { name: "Graphite", token: "--clobs-graphite", value: "#57524A", note: "Secondary text, rubric prose. 8.0:1." },
  { name: "Smoke", token: "--clobs-smoke", value: "#6F695E", note: "Metadata, timestamps. 5.9:1." },
  { name: "Ash", token: "--clobs-ash", value: "#9A9284", note: "Placeholders and disabled ONLY. 3.1:1." },
];

const actions = [
  { name: "Bark", token: "--clobs-bark", value: "#5C4630", note: "The single primary action fill." },
  { name: "Bark Deep", token: "--clobs-bark-deep", value: "#48351F", note: "Bark hover / pressed." },
  { name: "Lake", token: "--clobs-lake", value: "#2C5C8F", note: "Links, focus ring. Never a button fill." },
  { name: "Lake Wash", token: "--clobs-lake-wash", value: "#DCE6F1", note: "Selected row, active tab." },
  { name: "Forest", token: "--clobs-forest", value: "#3F6B4F", note: "Completion and saved. A signal, never an action." },
  { name: "Forest Wash", token: "--clobs-forest-wash", value: "#DEEADF", note: "Completed chip, progress fill." },
  { name: "Clay", token: "--clobs-clay", value: "#9E3B2E", note: "Errors, unsaved warnings, flags." },
  { name: "Clay Wash", token: "--clobs-clay-wash", value: "#F6E2DE", note: "Error field background, flag banner." },
];

const scores = [
  { num: 1, label: "Column A — Very Accurate", fill: "var(--clobs-score-1)", edge: "var(--clobs-score-1-edge)" },
  { num: 2, label: "Column A — Somewhat Accurate", fill: "var(--clobs-score-2)", edge: "var(--clobs-score-2-edge)" },
  { num: 3, label: "Column B — Somewhat Accurate", fill: "var(--clobs-score-3)", edge: "var(--clobs-score-3-edge)" },
  { num: 4, label: "Column B — Very Accurate", fill: "var(--clobs-score-4)", edge: "var(--clobs-score-4-edge)" },
];

const typeScale = [
  { role: "micro", px: "11px", family: "sans", sample: "MICRO — UPPERCASE SECTION LABEL" },
  { role: "caption", px: "12px", family: "sans", sample: "Caption — helper text under a field" },
  { role: "body-sm", px: "14px", family: "sans", sample: "Body small — table values, chip labels" },
  { role: "body", px: "15px", family: "sans", sample: "Body — the interface default" },
  { role: "body-lg", px: "17px", family: "sans", sample: "Body large — notes and justification textareas" },
  { role: "prose", px: "17px", family: "serif", sample: "Prose — rubric body text, read hundreds of times" },
  { role: "prose-lg", px: "19px", family: "serif", sample: "Prose large — concept statements in context" },
  { role: "heading-sm", px: "20px", family: "sans", sample: "Heading small — card titles" },
  { role: "heading", px: "26px", family: "sans", sample: "Heading — the largest type inside the app" },
  { role: "display", px: "36px", family: "serif", sample: "Display — rubric concept statement" },
  { role: "display-lg", px: "52px", family: "serif", sample: "Display large — sign-in only" },
];

const spaces = [1, 2, 3, 4, 5, 6, 8, 10, 12, 16] as const;

const radii = [
  { name: "sm — inline code, small badges", token: "--clobs-radius-sm", px: "6px" },
  { name: "control — buttons, inputs", token: "--clobs-radius-control", px: "10px" },
  { name: "frame — tables, video frame", token: "--clobs-radius-frame", px: "12px" },
  { name: "card — cards, panels, modals", token: "--clobs-radius-card", px: "16px" },
];

const durations = [
  { token: "--clobs-dur-instant", value: "90ms", use: "Press states, hover, focus ring" },
  { token: "--clobs-dur-fast", value: "150ms", use: "Tooltips, chip selection, toasts entering" },
  { token: "--clobs-dur-base", value: "220ms", use: "Tabs, accordions, dropdowns" },
  { token: "--clobs-dur-page", value: "280ms", use: "Route transitions" },
  { token: "--clobs-dur-moment", value: "420ms", use: "Success check, calibration reveal. Twice per hour at most." },
];

const easings = [
  { token: "--clobs-ease-out", value: "cubic-bezier(0.22, 1, 0.36, 1)", use: "Entering, expanding" },
  { token: "--clobs-ease-in", value: "cubic-bezier(0.64, 0, 0.78, 0)", use: "Exits only" },
  { token: "--clobs-ease-inout", value: "cubic-bezier(0.65, 0, 0.35, 1)", use: "Position changes both ways" },
];

function Swatch({ name, token, value, note }: { name: string; token: string; value: string; note: string }) {
  return (
    <div className="rounded-lg border border-hairline bg-paper">
      <div className="h-16 rounded-t-lg border-b border-hairline" style={{ background: `var(${token})` }} />
      <div className="space-y-1 p-3">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-[14px] font-medium text-ink">{name}</span>
          <span className="mono text-[11px] text-smoke">{value}</span>
        </div>
        <div className="mono text-[11px] text-smoke">{token}</div>
        <p className="text-[12px] leading-[1.5] text-graphite">{note}</p>
      </div>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2
      className="border-b border-hairline pb-2 font-sans font-medium text-ink"
      style={{ fontSize: "var(--clobs-text-heading-sm)", lineHeight: "var(--clobs-leading-heading-sm)", letterSpacing: "var(--clobs-tracking-heading-sm)" }}
    >
      {children}
    </h2>
  );
}

function ScoreChip({ num, label, fill, edge, selected, dimmed }: { num: number; label: string; fill: string; edge: string; selected?: boolean; dimmed?: boolean }) {
  return (
    <span
      className="inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-[14px] text-ink"
      style={{
        background: fill,
        border: selected ? `2px solid ${edge}` : "1px solid var(--clobs-hairline)",
        // Compensate the 1px difference so selection never shifts layout.
        margin: selected ? 0 : 1,
        opacity: dimmed ? 0.55 : 1,
        fontWeight: selected ? 600 : 500,
      }}
      aria-label={`Score ${num}: ${label}${selected ? " (selected)" : ""}`}
    >
      <span
        className="mono flex size-6 shrink-0 items-center justify-center rounded-full text-[13px]"
        style={
          selected
            ? { background: edge, color: "var(--clobs-paper)" }
            : { border: "1px solid var(--clobs-hairline-strong)", color: "var(--clobs-ink)" }
        }
      >
        {num}
      </span>
      <span>{label}</span>
      {selected && (
        <span aria-hidden style={{ color: edge }}>
          ✓
        </span>
      )}
    </span>
  );
}

function StatusPill({ kind }: { kind: "complete" | "in-progress" | "flagged" }) {
  const map = {
    complete: { bg: "var(--clobs-forest-wash)", fg: "var(--clobs-forest)", text: "Complete" },
    "in-progress": { bg: "var(--clobs-lake-wash)", fg: "var(--clobs-lake)", text: "In progress" },
    flagged: { bg: "var(--clobs-clay-wash)", fg: "var(--clobs-clay)", text: "Flagged" },
  }[kind];
  return (
    <span className="inline-flex items-center rounded-full px-3 py-1 text-[12px] font-medium" style={{ background: map.bg, color: map.fg }}>
      {map.text}
    </span>
  );
}

const btnBase =
  "inline-flex items-center justify-center rounded-md px-[18px] py-[10px] font-sans text-[15px] font-semibold " +
  "transition-[background-color,transform] duration-[90ms]";

export default function Styleguide() {
  return (
    <main className="mx-auto max-w-[1440px] space-y-12 bg-paper p-8 pb-24">
      <header className="space-y-2">
        <h1 className="font-serif text-ink" style={{ fontSize: "var(--clobs-text-display)", lineHeight: "var(--clobs-leading-display)", letterSpacing: "var(--clobs-tracking-display)" }}>
          LTL CLOBS — Style guide
        </h1>
        <p className="max-w-[68ch] text-graphite">
          Every token from <span className="mono text-[13px]">DESIGN_SYSTEM.md</span> §9, rendered.
          Warm paper observatory: cream canvas, ink hairlines, one bark action, one ordinal
          sand-to-lake ramp. Light only.
        </p>
        <Link href="/" className="text-[14px] text-lake underline underline-offset-4">← Home</Link>
      </header>

      {/* ------------------------------------------------ Color */}
      <section className="space-y-4">
        <SectionTitle>Surfaces and hairlines</SectionTitle>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
          {surfaces.map((s) => <Swatch key={s.token} {...s} />)}
        </div>
      </section>

      <section className="space-y-4">
        <SectionTitle>Ink</SectionTitle>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {inks.map((s) => <Swatch key={s.token} {...s} />)}
        </div>
      </section>

      <section className="space-y-4">
        <SectionTitle>Action and state</SectionTitle>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {actions.map((s) => <Swatch key={s.token} {...s} />)}
        </div>
        <p className="max-w-[68ch] text-[14px] text-graphite">
          Bark is rationed to one filled button per view. Treatment arm and school have no color,
          no icon, and no visual encoding anywhere in a coder-facing surface.
        </p>
      </section>

      {/* ------------------------------------------------ Score ramp */}
      <section className="space-y-4">
        <SectionTitle>The score ramp — ordinal, warm to cool</SectionTitle>
        <p className="max-w-[68ch] text-[14px] text-graphite">
          Column A Very Accurate means the practice was absent — a finding, not a failure. The ramp
          is never red-to-green, never used for anything that is not a score. Numeral + label always
          accompany the fill so the value survives greyscale.
        </p>
        <div className="space-y-3">
          <div>
            <div className="mb-2 text-[11px] uppercase tracking-[0.02em] text-smoke">Unselected</div>
            <div className="flex flex-wrap gap-2">
              {scores.map((s) => <ScoreChip key={s.num} {...s} />)}
            </div>
          </div>
          <div>
            <div className="mb-2 text-[11px] uppercase tracking-[0.02em] text-smoke">
              One selected — edge-filled numeral, 2px border, check, dimmed siblings. No motion, no scale.
            </div>
            <div className="flex flex-wrap gap-2">
              {scores.map((s) => (
                <ScoreChip key={s.num} {...s} selected={s.num === 3} dimmed={s.num !== 3} />
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------ Typography */}
      <section className="space-y-4">
        <SectionTitle>Typography — Newsreader for the manual, Inter for the interface, JetBrains Mono for the data</SectionTitle>
        <div className="overflow-x-auto rounded-lg border border-hairline">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="bg-sunken text-[12px] text-graphite">
                <th className="px-4 py-2 font-semibold">Role</th>
                <th className="px-4 py-2 font-semibold">Size</th>
                <th className="px-4 py-2 font-semibold">Family</th>
                <th className="px-4 py-2 font-semibold">Sample</th>
              </tr>
            </thead>
            <tbody>
              {typeScale.map((t) => (
                <tr key={t.role} className="border-t border-hairline align-middle">
                  <td className="mono px-4 py-3 text-[12px] text-graphite">{t.role}</td>
                  <td className="num px-4 py-3 text-[12px] text-smoke">{t.px}</td>
                  <td className="px-4 py-3 text-[12px] text-smoke">{t.family}</td>
                  <td
                    className="px-4 py-3 text-ink"
                    style={{
                      fontFamily: t.family === "serif" ? "var(--clobs-font-serif)" : "var(--clobs-font-sans)",
                      fontSize: `var(--clobs-text-${t.role})`,
                      lineHeight: `var(--clobs-leading-${t.role})`,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {t.sample}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[14px] text-graphite">
          Mono with tabular figures for data: <span className="video-code text-[14px]">V-0417</span> ·{" "}
          <span className="timestamp text-[14px]">00:14:32</span> ·{" "}
          <span className="mono text-[14px]">clobs_scores_long.csv</span>
        </p>
      </section>

      {/* ------------------------------------------------ Space, radius, elevation */}
      <section className="space-y-4">
        <SectionTitle>Space — 4px base unit</SectionTitle>
        <div className="flex flex-wrap items-end gap-4">
          {spaces.map((n) => (
            <div key={n} className="flex flex-col items-center gap-1">
              <div className="w-8 rounded-sm bg-lake-wash" style={{ height: `var(--clobs-space-${n})` }} />
              <span className="mono text-[11px] text-smoke">{n === 1 ? "4" : n * 4}px</span>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <SectionTitle>Radius</SectionTitle>
        <div className="flex flex-wrap gap-4">
          {radii.map((r) => (
            <div key={r.token} className="flex items-center gap-3 border border-hairline bg-card p-4" style={{ borderRadius: `var(${r.token})` }}>
              <span className="mono text-[12px] text-smoke">{r.px}</span>
              <span className="text-[14px] text-ink">{r.name}</span>
            </div>
          ))}
          <div className="flex items-center gap-3 rounded-full border border-hairline bg-card px-5 py-3">
            <span className="mono text-[12px] text-smoke">pill</span>
            <span className="text-[14px] text-ink">score chips, status, tags — never buttons</span>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <SectionTitle>Elevation — hairlines first, one shadow only</SectionTitle>
        <div className="flex flex-wrap gap-6">
          <div className="w-64 rounded-xl border border-hairline bg-card p-6">
            <div className="text-[14px] font-medium text-ink">A card</div>
            <p className="mt-1 text-[12px] text-graphite">Hairline + radius. Never a shadow.</p>
          </div>
          <div className="w-64 rounded-xl bg-paper p-6" style={{ boxShadow: "var(--clobs-shadow-float)" }}>
            <div className="text-[14px] font-medium text-ink">A float</div>
            <p className="mt-1 text-[12px] text-graphite">
              <span className="mono text-[11px]">--clobs-shadow-float</span> — popovers, modals,
              toasts, the dock. Things that genuinely float and can be dismissed.
            </p>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------ Motion */}
      <section className="space-y-4">
        <SectionTitle>Motion tokens</SectionTitle>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="overflow-x-auto rounded-lg border border-hairline">
            <table className="w-full text-left text-[14px]">
              <thead><tr className="bg-sunken text-[12px] text-graphite"><th className="px-4 py-2 font-semibold">Duration</th><th className="px-4 py-2 font-semibold">Use</th></tr></thead>
              <tbody>
                {durations.map((d) => (
                  <tr key={d.token} className="border-t border-hairline">
                    <td className="px-4 py-2"><span className="mono text-[12px] text-graphite">{d.token}</span> <span className="num text-[12px] text-smoke">{d.value}</span></td>
                    <td className="px-4 py-2 text-graphite">{d.use}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="overflow-x-auto rounded-lg border border-hairline">
            <table className="w-full text-left text-[14px]">
              <thead><tr className="bg-sunken text-[12px] text-graphite"><th className="px-4 py-2 font-semibold">Easing</th><th className="px-4 py-2 font-semibold">Use</th></tr></thead>
              <tbody>
                {easings.map((e) => (
                  <tr key={e.token} className="border-t border-hairline">
                    <td className="px-4 py-2"><span className="mono text-[12px] text-graphite">{e.token}</span></td>
                    <td className="px-4 py-2 text-graphite">{e.use}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <p className="max-w-[68ch] text-[14px] text-graphite">
          Motion never delays input. The scoring grid, notes editor and autosave indicator get no
          motion at all; the full 420ms moment is reserved for completing an observation or a
          calibration.
        </p>
      </section>

      {/* ------------------------------------------------ Buttons */}
      <section className="space-y-4">
        <SectionTitle>Buttons — every state</SectionTitle>
        <p className="text-[14px] text-graphite">
          The first row is live: hover, press and Tab to it to see the real 90ms states and the lake
          focus ring. One bark fill per view; everything else outline or ghost. 10px radius — never
          pills.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className={`${btnBase} bg-bark text-paper hover:bg-bark-deep active:scale-[0.98]`}>
            Primary — live
          </button>
          <button type="button" className={`${btnBase} border border-hairline-strong bg-paper text-ink hover:bg-card active:scale-[0.98]`}>
            Outline — live
          </button>
          <button type="button" className={`${btnBase} bg-transparent text-ink hover:bg-card active:scale-[0.98]`}>
            Ghost — live
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span className={`${btnBase} bg-bark text-paper`}>Default</span>
          <span className={`${btnBase} bg-bark-deep text-paper`}>Hover / pressed</span>
          <span className={`${btnBase} bg-bark text-paper outline-2 outline-offset-2 outline-lake`}>Focused</span>
          <span className={`${btnBase} cursor-not-allowed bg-sunken text-ash`} aria-disabled="true">Disabled</span>
        </div>
      </section>

      {/* ------------------------------------------------ Densities */}
      <section className="space-y-4">
        <SectionTitle>Two densities</SectionTitle>
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Comfortable: rubric-pane sample */}
          <div className="rounded-xl border border-hairline bg-card p-6">
            <div className="mb-1 text-[11px] uppercase tracking-[0.02em] text-smoke">
              Comfortable — reading and writing · 24px padding
            </div>
            <h3 className="font-serif text-ink" style={{ fontSize: "var(--clobs-text-display)", lineHeight: "var(--clobs-leading-display)", letterSpacing: "var(--clobs-tracking-display)" }}>
              Teacher checks for understanding.
            </h3>
            <p className="mt-3 max-w-[68ch] font-serif text-graphite" style={{ fontSize: "var(--clobs-text-prose)", lineHeight: "var(--clobs-leading-prose)" }}>
              Checking should also happen at more than one point in the lesson, not in a single
              isolated moment. Strong evidence comes from the teacher who checks, finds a gap, and
              acts on it. (Sample rubric prose — Newsreader at 17px, never smaller.)
            </p>
            <div className="mt-4 rounded-sm bg-sunken p-3">
              <div className="text-[11px] font-medium uppercase tracking-[0.02em] text-smoke">Special note</div>
              <p className="mt-1 font-serif text-[15px] leading-[1.6] text-graphite">
                Rote chanting and copying reveal nothing and do not count towards this concept.
              </p>
            </div>
          </div>
          {/* Compact: video queue sample */}
          <div>
            <div className="mb-2 text-[11px] uppercase tracking-[0.02em] text-smoke">
              Compact — scanning and comparing · 40px rows
            </div>
            <div className="overflow-x-auto rounded-lg border border-hairline">
              <table className="w-full border-collapse text-left text-[14px]">
                <thead>
                  <tr className="bg-sunken text-[12px] text-graphite">
                    <th className="px-4 py-2 font-semibold">Video</th>
                    <th className="px-4 py-2 font-semibold">Duration</th>
                    <th className="px-4 py-2 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="h-10 border-t border-hairline transition-colors duration-[90ms] hover:bg-card">
                    <td className="video-code px-4 text-[14px] text-ink">V-0417</td>
                    <td className="num px-4 text-smoke">41:22</td>
                    <td className="px-4"><StatusPill kind="complete" /></td>
                  </tr>
                  <tr className="h-10 border-t border-hairline bg-lake-wash">
                    <td className="video-code px-4 text-[14px] text-ink">V-0233</td>
                    <td className="num px-4 text-smoke">38:05</td>
                    <td className="px-4"><StatusPill kind="in-progress" /></td>
                  </tr>
                  <tr className="h-10 border-t border-hairline transition-colors duration-[90ms] hover:bg-card">
                    <td className="video-code px-4 text-[14px] text-ink">V-0098</td>
                    <td className="num px-4 text-smoke">44:51</td>
                    <td className="px-4"><StatusPill kind="flagged" /></td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-[12px] text-graphite">
              Selected row = lake wash. Hover = card background at 90ms, no transform.
            </p>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------ Form + autosave */}
      <section className="space-y-4">
        <SectionTitle>Inputs and the autosave indicator</SectionTitle>
        <div className="grid max-w-xl gap-4">
          <label className="grid gap-1 text-[14px] text-ink">
            Justification
            <textarea
              rows={2}
              placeholder="What did you see or hear, and when?"
              className="rounded-md border border-hairline bg-paper p-3 text-[17px] leading-[1.65] text-ink placeholder:text-ash focus:border-hairline-strong"
              defaultValue=""
            />
          </label>
          <div className="flex flex-wrap items-center gap-6 text-[12px]" aria-live="polite">
            <span className="inline-flex items-center gap-2 text-smoke">
              <span className="size-1.5 rounded-full bg-forest" aria-hidden />
              <span className="mono">Saved 14:32</span>
            </span>
            <span className="inline-flex items-center gap-2 text-smoke">
              <span className="size-1.5 rounded-full bg-ash" aria-hidden />
              <span className="mono">Saving…</span>
            </span>
            <span className="inline-flex items-center gap-2 text-smoke">
              <span className="size-1.5 rounded-full bg-clay" aria-hidden />
              <span className="mono">Offline — saved on this device</span>
            </span>
          </div>
          <div className="rounded-md border border-clay bg-clay-wash p-3 text-[14px] text-ink">
            <span className="font-medium" style={{ color: "var(--clobs-clay)" }}>Error:</span>{" "}
            this field is required before the section can be completed.
          </div>
        </div>
      </section>
    </main>
  );
}

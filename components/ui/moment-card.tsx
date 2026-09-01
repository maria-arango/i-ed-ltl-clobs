/**
 * The shared completion MOMENT (DESIGN_SYSTEM §4, amended 2026-09-01):
 * forest-washed card that rises in while its check draws itself. Never
 * static; reduced motion collapses to an instant, fully-drawn state.
 */
export function MomentCard({ children }: { children: React.ReactNode }) {
  return (
    <div
      role="status"
      className="moment-enter elev-card flex items-center gap-4 rounded-xl border p-5"
      style={{
        borderColor: "var(--clobs-forest)",
        background: "var(--clobs-forest-wash)",
      }}
    >
      <span
        aria-hidden
        className="flex size-11 shrink-0 items-center justify-center rounded-full"
        style={{ background: "var(--clobs-forest)" }}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
          <path
            className="check-draw"
            d="M5 12.5l4.5 4.5L19 7.5"
            stroke="var(--clobs-paper)"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
      <div
        className="font-serif text-ink"
        style={{
          fontSize: "var(--clobs-text-prose)",
          lineHeight: "var(--clobs-leading-prose)",
        }}
      >
        {children}
      </div>
    </div>
  );
}

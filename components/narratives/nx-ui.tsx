/**
 * Building blocks for the Narratives screens, in the platform's design
 * system (DESIGN_SYSTEM.md): bark primary buttons, quiet bordered secondary
 * buttons, pill row actions, elevated cards and the shared status pills.
 */
import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

type Variant = "primary" | "secondary" | "danger" | "ghost" | "pill";

const variants: Record<Variant, string> = {
  primary:
    "rounded-md bg-bark px-[18px] py-[10px] text-[15px] font-semibold text-paper transition-colors duration-[90ms] hover:bg-bark-deep active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-sunken disabled:text-ash",
  secondary:
    "rounded-md border border-hairline-strong bg-paper px-4 py-2 text-[13px] font-semibold text-ink transition-colors duration-[90ms] hover:bg-card active:scale-[0.98] disabled:cursor-not-allowed disabled:text-ash",
  danger:
    "rounded-md border border-hairline bg-paper px-4 py-2 text-[13px] font-semibold text-clay transition-colors duration-[90ms] hover:border-clay hover:bg-card active:scale-[0.98] disabled:cursor-not-allowed disabled:text-ash",
  ghost: "rounded-sm text-[14px] text-lake underline underline-offset-4 disabled:text-ash",
  pill:
    "rounded-full border border-hairline-strong bg-paper px-3 py-1 text-[12px] font-medium text-ink transition-colors duration-[90ms] hover:bg-card active:scale-[0.98] disabled:cursor-not-allowed disabled:text-ash",
};

export function nxButtonClass(variant: Variant = "secondary", extra = ""): string {
  return `inline-flex items-center justify-center gap-2 ${variants[variant]} ${extra}`.trim();
}

export function NxButton({
  variant = "secondary",
  className = "",
  ...props
}: ComponentProps<"button"> & { variant?: Variant }) {
  return <button type="button" {...props} className={nxButtonClass(variant, className)} />;
}

export function NxLinkButton({
  variant = "secondary",
  className = "",
  ...props
}: ComponentProps<typeof Link> & { variant?: Variant }) {
  return <Link {...props} className={nxButtonClass(variant, className)} />;
}

export function NxCard({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`elev-card rounded-2xl border border-hairline bg-card ${className}`}>{children}</div>;
}

export type NarrativeStatus = "not_started" | "in_progress" | "submitted" | "returned";

const STATUS: Record<NarrativeStatus, { bg: string; fg: string; text: string }> = {
  not_started: { bg: "var(--clobs-sunken)", fg: "var(--clobs-graphite)", text: "Not started" },
  in_progress: { bg: "var(--clobs-lake-wash)", fg: "var(--clobs-lake)", text: "In progress" },
  submitted: { bg: "var(--clobs-forest-wash)", fg: "var(--clobs-forest)", text: "Submitted" },
  returned: { bg: "var(--clobs-sunken)", fg: "var(--clobs-smoke)", text: "Reassigned" },
};

/** Status pill, same shape and colours as the scoring StatusPill. */
export function NxStatus({ status }: { status: NarrativeStatus }) {
  const s = STATUS[status];
  return (
    <span
      className="inline-flex items-center rounded-full px-3 py-1 text-[12px] font-medium"
      style={{ background: s.bg, color: s.fg }}
    >
      {s.text}
    </span>
  );
}

/** Page heading in the platform's style (same as My videos, Progress …). */
export function NxPageTitle({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  return (
    <header className="mb-6 space-y-1">
      <h1
        className="font-sans font-medium text-ink"
        style={{
          fontSize: "var(--clobs-text-heading)",
          lineHeight: "var(--clobs-leading-heading)",
          letterSpacing: "var(--clobs-tracking-heading)",
        }}
      >
        {children}
      </h1>
      {sub && <p className="text-[14px] text-smoke">{sub}</p>}
    </header>
  );
}

/** Section heading (heading-sm), as on the admin screens. */
export function NxSectionTitle({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <h2
      id={id}
      className="mb-3 font-sans font-medium text-ink"
      style={{
        fontSize: "var(--clobs-text-heading-sm)",
        lineHeight: "var(--clobs-leading-heading-sm)",
        letterSpacing: "var(--clobs-tracking-heading-sm)",
      }}
    >
      {children}
    </h2>
  );
}

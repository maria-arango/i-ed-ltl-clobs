/**
 * Small building blocks for the Narratives area (landing, workspace,
 * dashboard). Plain, rectangular, 6px corners, one accent (DESIGN_SYSTEM.md
 * §11). No motion: these screens are tools.
 */
import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

type Variant = "primary" | "secondary" | "danger" | "ghost";

const base =
  "inline-flex items-center justify-center gap-2 rounded-md px-3.5 py-2 text-[14px] font-medium " +
  "disabled:cursor-not-allowed disabled:opacity-50";
const variants: Record<Variant, string> = {
  primary: "bg-nx-accent text-white hover:bg-nx-accent-hover",
  secondary: "border border-nx-border-strong bg-nx-surface text-nx-text hover:bg-nx-sunken",
  danger: "border border-nx-danger bg-nx-surface text-nx-danger hover:bg-nx-danger-wash",
  ghost: "text-nx-text hover:bg-nx-sunken",
};

export function nxButtonClass(variant: Variant = "secondary", extra = ""): string {
  return `${base} ${variants[variant]} ${extra}`.trim();
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
  return (
    <div className={`rounded-md border border-nx-border bg-nx-surface ${className}`}>{children}</div>
  );
}

export type NarrativeStatus = "not_started" | "in_progress" | "submitted" | "returned";

const STATUS: Record<NarrativeStatus, { label: string; cls: string }> = {
  not_started: { label: "Not started", cls: "border-nx-border-strong bg-nx-surface text-nx-muted" },
  in_progress: { label: "In progress", cls: "border-transparent bg-nx-warn-wash text-nx-warn" },
  submitted: { label: "Submitted", cls: "border-transparent bg-nx-success-wash text-nx-success" },
  returned: { label: "Reassigned", cls: "border-nx-border bg-nx-sunken text-nx-muted" },
};

/** Status tag: rectangular, text label always present (never colour alone). */
export function NxStatus({ status }: { status: NarrativeStatus }) {
  const s = STATUS[status];
  return (
    <span
      className={`inline-flex items-center rounded border px-2 py-0.5 text-[12px] font-medium ${s.cls}`}
    >
      {s.label}
    </span>
  );
}

export function NxPageTitle({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  return (
    <div className="mb-6">
      <h1 className="text-[24px] font-semibold leading-tight text-nx-text">{children}</h1>
      {sub && <p className="mt-1 text-[15px] text-nx-muted">{sub}</p>}
    </div>
  );
}

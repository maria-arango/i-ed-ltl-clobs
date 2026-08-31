"use client";
// beui.dev/components/motion/dock

import { motion, useReducedMotion } from "motion/react";
import { createContext, useContext, useId, useMemo, type ReactNode } from "react";
import { cn } from "@/lib/utils";

// Position change both ways: --clobs-dur-base + --clobs-ease-inout (DESIGN_SYSTEM §4).
const PILL_TRANSITION = { duration: 0.22, ease: [0.65, 0, 0.35, 1] as const };

type DockContextValue = {
  size: number;
  pillLayoutId: string;
};

const DockContext = createContext<DockContextValue | null>(null);

export interface DockProps {
  children: ReactNode;
  className?: string;
  /** Size of each item in px. */
  size?: number;
}

export function Dock({ children, size = 44, className }: DockProps) {
  const pillLayoutId = useId();
  const ctx = useMemo<DockContextValue>(
    () => ({ size, pillLayoutId }),
    [size, pillLayoutId],
  );

  return (
    <DockContext.Provider value={ctx}>
      <div
        className={cn(
          // The dock floats: hairline border, card fill (solid — no blur on
          // chrome), and the system's single float shadow (DESIGN_SYSTEM §3).
          "inline-flex h-auto items-end gap-1.5 rounded-2xl border border-border bg-card px-2 py-1 shadow-float",
          className,
        )}
      >
        {children}
      </div>
    </DockContext.Provider>
  );
}

export interface DockItemProps {
  children: ReactNode;
  className?: string;
  /** When set, the item renders as a <button>. Omit when children carry their own link or button. */
  onClick?: () => void;
  active?: boolean;
  "aria-label"?: string;
}

export function DockItem({
  children,
  className,
  onClick,
  active,
  ...rest
}: DockItemProps) {
  const dock = useContext(DockContext);
  const reduce = useReducedMotion();
  const size = dock?.size ?? 44;
  const pillLayoutId = dock?.pillLayoutId ?? "dock-pill";

  const pill = active ? (
    <motion.span
      layoutId={pillLayoutId}
      transition={reduce ? { duration: 0 } : PILL_TRANSITION}
      // Active underlay = lake wash (--clobs-accent), the "active tab" token.
      className="absolute inset-0.5 -z-10 rounded-xl bg-accent"
    />
  ) : null;
  const sharedStyle = { width: size, height: size };
  const sharedClass = cn(
    "relative flex shrink-0 items-center justify-center rounded-full text-foreground",
    className,
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label={rest["aria-label"]}
        aria-pressed={active}
        style={sharedStyle}
        className={cn(
          sharedClass,
          "cursor-pointer border-0 bg-transparent p-0 outline-none",
          "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        )}
      >
        {pill}
        {children}
      </button>
    );
  }

  // Children carry their own link or button (and its accessible name).
  return (
    <div style={sharedStyle} className={sharedClass}>
      {pill}
      {children}
    </div>
  );
}

export function DockSeparator({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("mx-1 h-6 w-px self-center bg-border", className)}
    />
  );
}

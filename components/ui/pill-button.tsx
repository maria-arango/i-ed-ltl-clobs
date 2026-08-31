/**
 * Small pill-shaped action button for table rows and inline actions
 * (DESIGN_SYSTEM: quiet borders, instant feedback, no ghost links).
 */
import { cn } from "@/lib/utils";

const styles = {
  default:
    "border-hairline-strong bg-paper text-ink hover:bg-card",
  danger:
    "border-hairline bg-paper text-clay hover:border-clay hover:bg-card",
} as const;

export function PillButton({
  variant = "default",
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof styles;
}) {
  return (
    <button
      type="button"
      {...props}
      className={cn(
        "rounded-full border px-3 py-1 text-[12px] font-medium transition-colors duration-[90ms] active:scale-[0.98] disabled:cursor-not-allowed disabled:text-ash",
        styles[variant],
        className,
      )}
    />
  );
}

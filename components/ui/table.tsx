/**
 * Shared table primitives (shadcn-style composition, re-themed to the
 * CLOBS tokens). One look everywhere: quiet uppercase header on the paper
 * ground, hairline row separators, a soft row hover, generous cell height.
 * Wide tables scroll inside their own container — the page never does.
 */
import { cn } from "@/lib/utils";

export function Table({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "elev-card overflow-x-auto rounded-xl border border-hairline bg-paper",
        className,
      )}
    >
      <table className="w-full border-collapse text-left text-[14px]">
        {children}
      </table>
    </div>
  );
}

export function TableHeader({ children }: { children: React.ReactNode }) {
  return <thead>{children}</thead>;
}

export function TableBody({ children }: { children: React.ReactNode }) {
  return <tbody>{children}</tbody>;
}

export function TableRow({
  className,
  header,
  children,
}: {
  className?: string;
  header?: boolean;
  children: React.ReactNode;
}) {
  return (
    <tr
      className={cn(
        header
          ? "border-b border-hairline"
          : "border-t border-hairline transition-colors duration-[90ms] first:border-t-0 hover:bg-card",
        className,
      )}
    >
      {children}
    </tr>
  );
}

export function TableHead({
  className,
  ...props
}: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={cn(
        "px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.05em] text-smoke",
        className,
      )}
      {...props}
    />
  );
}

export function TableCell({
  className,
  ...props
}: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn("px-4 py-3", className)} {...props} />;
}

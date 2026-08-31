/**
 * Loading skeleton for every (shell) screen: quiet shimmering placeholders
 * in the shape of a typical page (breadcrumb, heading, a table). The
 * pulse comes from the shared Skeleton primitive; reduced motion shows
 * static blocks (globals collapses animate-pulse).
 */
import { Skeleton } from "@/components/ui/skeleton";

export default function ShellLoading() {
  return (
    <div className="mx-auto mt-2 max-w-[980px] space-y-8" aria-busy="true">
      <Skeleton className="h-4 w-40 bg-sunken" />
      <div className="space-y-3">
        <Skeleton className="h-9 w-64 bg-sunken" />
        <Skeleton className="h-4 w-full max-w-xl bg-sunken" />
      </div>
      <div className="elev-card overflow-hidden rounded-xl border border-hairline bg-paper">
        <div className="border-b border-hairline bg-paper px-4 py-3">
          <Skeleton className="h-3 w-56 bg-sunken" />
        </div>
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="flex items-center gap-6 border-t border-hairline px-4 py-3 first:border-t-0">
            <Skeleton className="h-4 w-24 bg-sunken" />
            <Skeleton className="h-4 w-40 bg-sunken" />
            <Skeleton className="h-4 w-28 bg-sunken" />
            <Skeleton className="ml-auto h-5 w-20 rounded-full bg-sunken" />
          </div>
        ))}
      </div>
    </div>
  );
}

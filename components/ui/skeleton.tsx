import { cn } from "@/lib/utils"

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn("shimmer rounded-md bg-muted motion-reduce:animate-pulse", className)}
      {...props}
    />
  )
}

export { Skeleton }

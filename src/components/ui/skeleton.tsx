import { cn } from "../../lib/utils";

function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-md bg-muted/40 after:absolute after:inset-0 after:bg-[radial-gradient(circle_at_top,oklch(1_0_0/0.12),transparent_58%)] before:absolute before:inset-0 before:bg-[image:var(--skeleton-shimmer)] before:bg-[length:200%_100%] before:animate-[shimmer_1.8s_infinite]",
        className,
      )}
      {...props}
    />
  );
}

export { Skeleton };

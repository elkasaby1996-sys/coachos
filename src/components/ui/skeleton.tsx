import { cn } from "../../lib/utils";

function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-md bg-muted/40 before:absolute before:inset-0 before:bg-[linear-gradient(110deg,transparent,oklch(1_0_0/0.06),transparent)] before:bg-[length:200%_100%] before:animate-[shimmer_1.6s_infinite]",
        className,
      )}
      {...props}
    />
  );
}

export { Skeleton };

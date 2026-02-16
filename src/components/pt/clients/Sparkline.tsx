import { cn } from "../../../lib/utils";

const defaultPoints = [2, 6, 4, 8, 6, 10, 7];

export function Sparkline({
  points = defaultPoints,
  className,
}: {
  points?: number[];
  className?: string;
}) {
  const max = Math.max(...points, 1);
  const min = Math.min(...points, 0);
  const range = Math.max(max - min, 1);
  const normalized = points.map((point, index) => {
    const x = (index / (points.length - 1)) * 44;
    const y = 14 - ((point - min) / range) * 12;
    return `${x},${y}`;
  });

  return (
    <svg
      viewBox="0 0 44 16"
      className={cn("h-4 w-12 text-accent", className)}
      aria-hidden="true"
    >
      <polyline
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        points={normalized.join(" ")}
      />
    </svg>
  );
}

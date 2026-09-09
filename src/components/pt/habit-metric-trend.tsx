import { useEffect, useRef, useState } from "react";

type TrendPoint = { date: string; value: number | null };

type HabitMetricTrendProps = {
  label: string;
  points: TrendPoint[];
  initialDate: string;
  formatValue: (value: number) => string;
};

const dateLabel = (date: string) =>
  new Date(`${date}T12:00:00`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });

export function HabitMetricTrend({
  label,
  points,
  initialDate,
  formatValue,
}: HabitMetricTrendProps) {
  const chartRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(600);
  const [activeIndex, setActiveIndex] = useState(() =>
    Math.max(
      0,
      points.findIndex((point) => point.date === initialDate),
    ),
  );

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(entry.contentRect.width);
    });
    observer.observe(chart);
    return () => observer.disconnect();
  }, []);

  const values = points.flatMap((point) =>
    point.value !== null && Number.isFinite(point.value) ? [point.value] : [],
  );
  const average = values.length
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : null;
  const active = points[Math.min(activeIndex, points.length - 1)];
  const activeValue =
    active?.value !== null && active?.value !== undefined
      ? formatValue(active.value)
      : "No entry";
  const minimum = values.length ? Math.min(...values) : 0;
  const maximum = values.length ? Math.max(...values) : 1;
  const padding = Math.max((maximum - minimum) * 0.2, maximum * 0.025, 1);
  const low = Math.max(0, minimum - padding);
  const high = maximum + padding;
  const axisLabel = (value: number) =>
    new Intl.NumberFormat(undefined, {
      notation: "standard",
      maximumFractionDigits: 1,
    }).format(value);
  const left = Math.max(
    width < 400 ? 48 : 58,
    ...[0, 1, 2, 3].map(
      (tick) => axisLabel(low + ((high - low) * tick) / 3).length * 7 + 16,
    ),
  );
  const right = width - 22;
  const top = 20;
  const bottom = 246;
  const x = (index: number) =>
    left + (index / Math.max(1, points.length - 1)) * (right - left);
  const y = (value: number) =>
    bottom - ((value - low) / (high - low)) * (bottom - top);
  let connected = false;
  const path = points
    .map((point, index) => {
      if (point.value === null || !Number.isFinite(point.value)) {
        connected = false;
        return "";
      }
      const command = `${connected ? "L" : "M"} ${x(index)} ${y(point.value)}`;
      connected = true;
      return command;
    })
    .join(" ");

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-6 border-b border-[var(--ui-border)] pb-5">
        <div>
          <p className="text-xs text-muted-foreground">Selected day</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
            {activeValue}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {active ? dateLabel(active.date) : "No date selected"}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">7-day average</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
            {average === null ? "No data" : formatValue(average)}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">Logged entries</p>
        </div>
      </div>

      <div ref={chartRef} className="min-w-0">
        {values.length ? (
          <div
            role="slider"
            tabIndex={0}
            aria-label={`${label} trend: selected day`}
            aria-valuemin={0}
            aria-valuemax={points.length - 1}
            aria-valuenow={Math.min(activeIndex, points.length - 1)}
            aria-valuetext={`${active ? dateLabel(active.date) : ""}: ${activeValue}`}
            className="cursor-crosshair rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--ui-action)]"
            onPointerMove={(event) => {
              if (event.pointerType === "touch") return;
              const bounds = event.currentTarget.getBoundingClientRect();
              const index = Math.round(
                ((event.clientX - bounds.left - left) / (right - left)) *
                  (points.length - 1),
              );
              setActiveIndex(Math.max(0, Math.min(points.length - 1, index)));
            }}
            onPointerDown={(event) => {
              const bounds = event.currentTarget.getBoundingClientRect();
              const index = Math.round(
                ((event.clientX - bounds.left - left) / (right - left)) *
                  (points.length - 1),
              );
              setActiveIndex(Math.max(0, Math.min(points.length - 1, index)));
            }}
            onKeyDown={(event) => {
              const offsets: Record<string, number> = {
                ArrowLeft: -1,
                ArrowDown: -1,
                ArrowRight: 1,
                ArrowUp: 1,
              };
              if (event.key in offsets) {
                event.preventDefault();
                setActiveIndex((index) =>
                  Math.max(
                    0,
                    Math.min(
                      points.length - 1,
                      index + (offsets[event.key] ?? 0),
                    ),
                  ),
                );
              } else if (event.key === "Home" || event.key === "End") {
                event.preventDefault();
                setActiveIndex(event.key === "Home" ? 0 : points.length - 1);
              }
            }}
          >
            <svg
              width="100%"
              height="288"
              viewBox={`0 0 ${width} 288`}
              aria-hidden="true"
            >
              {[0, 1, 2, 3].map((tick) => {
                const value = low + ((high - low) * tick) / 3;
                return (
                  <g key={tick}>
                    <line
                      x1={left}
                      x2={right}
                      y1={y(value)}
                      y2={y(value)}
                      stroke="var(--ui-border)"
                      strokeDasharray="3 5"
                    />
                    <text
                      x={left - 10}
                      y={y(value)}
                      dy="0.35em"
                      textAnchor="end"
                      fontSize="11"
                      fill="oklch(var(--muted-foreground))"
                    >
                      {axisLabel(value)}
                    </text>
                  </g>
                );
              })}
              <line
                x1={x(activeIndex)}
                x2={x(activeIndex)}
                y1={top}
                y2={bottom}
                stroke="var(--ui-action)"
                strokeOpacity="0.35"
                strokeDasharray="4 4"
              />
              <path
                d={path}
                fill="none"
                stroke="var(--ui-action)"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {points.map((point, index) => (
                <g key={point.date}>
                  {point.value !== null && Number.isFinite(point.value) ? (
                    <circle
                      cx={x(index)}
                      cy={y(point.value)}
                      r={index === activeIndex ? 6 : 4}
                      fill={
                        index === activeIndex
                          ? "var(--ui-action)"
                          : "var(--ui-surface)"
                      }
                      stroke="var(--ui-action)"
                      strokeWidth="2"
                    />
                  ) : null}
                  {(width >= 400 ||
                    index % 2 === 0 ||
                    index === points.length - 1) && (
                    <text
                      x={x(index)}
                      y={bottom + 28}
                      textAnchor="middle"
                      fontSize="11"
                      fill="oklch(var(--muted-foreground))"
                    >
                      {dateLabel(point.date)}
                    </text>
                  )}
                </g>
              ))}
            </svg>
          </div>
        ) : (
          <div className="flex h-72 items-center justify-center text-sm text-muted-foreground">
            No entries in the last 7 days.
          </div>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        Hover or tap to inspect a day. Use arrow keys when the graph is focused.
        Gaps indicate days without an entry.
      </p>
    </div>
  );
}

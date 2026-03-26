import type { ReactNode } from "react";
import { Card, CardHeader, CardTitle } from "../card";
import { cn } from "../../../lib/utils";

export function StatCard({
  label,
  value,
  helper,
  icon: Icon,
  accent,
  sparkline,
  surface = "default",
  className,
}: {
  label: string;
  value: string | number;
  helper?: string;
  icon?: React.ComponentType<{ className?: string }>;
  accent?: boolean;
  sparkline?: ReactNode;
  surface?: "default" | "pt-hub";
  className?: string;
}) {
  const isPtHub = surface === "pt-hub";

  return (
    <Card
      className={cn(
        isPtHub
          ? "rounded-[28px] border-border/70 bg-[linear-gradient(180deg,rgba(18,24,38,0.82),rgba(11,15,25,0.86))] shadow-[0_20px_60px_-48px_rgba(0,0,0,0.9)]"
          : "rounded-[24px] border-border/70 bg-[linear-gradient(180deg,oklch(var(--card)/0.98),oklch(var(--card)/0.9))] shadow-card",
        accent &&
          (isPtHub
            ? "border-primary/30 bg-[linear-gradient(180deg,rgba(20,29,44,0.92),rgba(11,16,28,0.9))]"
            : "border-primary/40 bg-card/90 shadow-glow"),
        className,
      )}
    >
      <CardHeader
        className={cn("space-y-2", isPtHub ? "px-5 py-5" : "px-5 py-4")}
      >
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span className="uppercase tracking-[0.22em]">{label}</span>
          {Icon ? (
            <span
              className={cn(
                "flex h-9 w-9 items-center justify-center rounded-xl border",
                isPtHub
                  ? "border-border/70 bg-background/45 text-primary"
                  : "border-transparent text-primary",
              )}
            >
              <Icon className="h-4 w-4" />
            </span>
          ) : null}
        </div>
        <div className="flex items-end justify-between gap-3">
          <div>
            <CardTitle
                className={cn(
                  "text-[1.85rem] font-semibold tracking-tight",
                )}
              >
                {value}
              </CardTitle>
            {helper ? (
              <p
                className={cn(
                  "mt-1 text-xs text-muted-foreground",
                  isPtHub && "text-sm",
                )}
              >
                {helper}
              </p>
            ) : null}
          </div>
          {sparkline ? (
            <div className="hidden sm:block">{sparkline}</div>
          ) : null}
        </div>
      </CardHeader>
    </Card>
  );
}

// Example:
// <StatCard label="Momentum" value="4 workouts" helper="2 day streak" icon={Rocket} sparkline={<MiniSparkline />} />

import { Card, CardHeader, CardTitle } from "../card";
import { cn } from "../../../lib/utils";

export function StatCard({
  label,
  value,
  helper,
  icon: Icon,
  accent,
  delta,
  surface = "default",
  className,
}: {
  label: string;
  value: string | number;
  helper?: string;
  icon?: React.ComponentType<{ className?: string }>;
  accent?: boolean;
  delta?: {
    value: string;
    tone?: "positive" | "negative" | "neutral";
  } | null;
  surface?: "default" | "pt-hub";
  className?: string;
}) {
  const isPtHub = surface === "pt-hub";

  return (
    <Card
      className={cn(
        isPtHub
          ? "surface-panel-strong rounded-[28px] border-border/70"
          : "border-border/70 bg-card/80",
        accent &&
          (isPtHub
            ? "border-primary/30 bg-[linear-gradient(180deg,oklch(var(--bg-surface-elevated)/0.98),oklch(var(--bg-surface)/0.92))]"
            : "border-primary/40 bg-card/90 shadow-glow"),
        className,
      )}
    >
      <CardHeader className={cn("space-y-2", isPtHub && "px-5 py-5")}>
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
                "text-2xl font-semibold tracking-tight",
                isPtHub && "text-[1.85rem]",
              )}
            >
              {value}
            </CardTitle>
            {helper ? (
              <p
                className={cn(
                  "text-xs text-muted-foreground",
                  isPtHub && "mt-1 text-sm",
                )}
              >
                {helper}
              </p>
            ) : null}
          </div>
          {delta ? (
            <span
              className={cn(
                "inline-flex shrink-0 items-center rounded-full border px-2.5 py-1 text-xs font-semibold",
                delta.tone === "positive" &&
                  "border-success/30 bg-success/12 text-success",
                delta.tone === "negative" &&
                  "border-danger/30 bg-danger/12 text-danger",
                (!delta.tone || delta.tone === "neutral") &&
                  "border-border/70 bg-muted/28 text-muted-foreground",
              )}
            >
              {delta.value}
            </span>
          ) : null}
        </div>
      </CardHeader>
    </Card>
  );
}

// Example:
// <StatCard label="Momentum" value="4 workouts" helper="Last 7 days" icon={Rocket} delta={{ value: "+2", tone: "positive" }} />

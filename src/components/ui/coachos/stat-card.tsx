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
          ? "surface-panel relative overflow-hidden rounded-[30px] border-border/70 shadow-[0_24px_60px_-42px_rgba(0,0,0,0.82)] backdrop-blur-xl"
          : "border-border/70 bg-card/80",
        accent &&
          (isPtHub
            ? "border-primary/25"
            : "border-primary/40 bg-card/90 shadow-glow"),
        className,
      )}
    >
      {isPtHub ? (
        <div
          className={cn(
            "pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,oklch(var(--accent)/0.18),transparent_34%),linear-gradient(180deg,oklch(var(--bg-surface-elevated)/0.12),transparent_48%)]",
            accent &&
              "bg-[radial-gradient(circle_at_top_right,oklch(var(--accent)/0.22),transparent_32%),linear-gradient(180deg,oklch(var(--bg-surface-elevated)/0.14),transparent_48%)]",
          )}
        />
      ) : null}
      <CardHeader
        className={cn("space-y-3", isPtHub && "relative px-5 py-5 sm:px-6")}
      >
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span className="font-semibold uppercase tracking-[0.22em]">
            {label}
          </span>
          {Icon ? (
            <span
              className={cn(
                "flex h-10 w-10 items-center justify-center rounded-[16px] border",
                isPtHub
                  ? "border-primary/20 bg-[linear-gradient(180deg,oklch(var(--bg-surface-elevated)/0.74),oklch(var(--bg-surface)/0.42))] text-primary shadow-[inset_0_1px_0_oklch(1_0_0/0.08)] backdrop-blur-lg"
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
                isPtHub && "text-[2.5rem] uppercase tracking-[0.04em]",
              )}
            >
              {value}
            </CardTitle>
            {helper ? (
              <p
                className={cn(
                  "text-xs text-muted-foreground",
                  isPtHub && "mt-1 text-[0.95rem] leading-5",
                )}
              >
                {helper}
              </p>
            ) : null}
          </div>
          {delta ? (
            <span
              className={cn(
                "inline-flex shrink-0 items-center rounded-full border px-2.5 py-1 text-xs font-semibold tracking-[0.08em]",
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

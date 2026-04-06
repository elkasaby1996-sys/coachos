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
          ? "surface-panel relative min-h-[188px] overflow-hidden rounded-[30px] border-border/70 shadow-[0_24px_60px_-42px_rgba(0,0,0,0.82)] backdrop-blur-xl"
          : "relative overflow-hidden rounded-[26px] border border-border/75 bg-[linear-gradient(180deg,oklch(var(--bg-surface-elevated)/0.8),oklch(var(--bg-surface)/0.66))] shadow-[0_28px_70px_-50px_oklch(0_0_0/0.78)] backdrop-blur-xl",
        accent &&
          (isPtHub
            ? "border-primary/25"
            : "border-primary/35 shadow-[0_26px_60px_-42px_oklch(var(--accent)/0.24)]"),
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
      ) : (
        <div
          className={cn(
            "pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,oklch(var(--accent)/0.1),transparent_30%),linear-gradient(180deg,oklch(1_0_0/0.05),transparent_44%)]",
            accent &&
              "bg-[radial-gradient(circle_at_top_right,oklch(var(--accent)/0.14),transparent_28%),linear-gradient(180deg,oklch(1_0_0/0.06),transparent_44%)]",
          )}
        />
      )}
      <CardHeader
        className={cn(
          "space-y-3",
          isPtHub && "relative flex h-full px-5 py-5 sm:px-6",
        )}
      >
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span className="font-semibold uppercase tracking-[0.22em]">
            {label}
          </span>
          {Icon ? (
            <Icon
              className={cn(
                "h-4.5 w-4.5 shrink-0",
                isPtHub ? "text-primary/90" : "text-primary",
              )}
            />
          ) : null}
        </div>
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0 flex-1">
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
                  isPtHub && "mt-1 text-[0.78rem] leading-[1.15rem]",
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

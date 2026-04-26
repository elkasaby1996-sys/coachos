import { Card, CardHeader, CardTitle } from "../card";
import { motion, useReducedMotion } from "framer-motion";
import { cn } from "../../../lib/utils";
import { AnimatedValue } from "../../common/action-feedback";
import {
  getSemanticToneClasses,
  type SemanticToneLike,
} from "../../../lib/semantic-status";
import {
  getModuleToneClasses,
  getModuleToneStyle,
  type ModuleTone,
} from "../../../lib/module-tone";

export function StatCard({
  label,
  value,
  helper,
  icon: Icon,
  iconClassName,
  accent,
  delta,
  surface = "default",
  className,
  disableHoverMotion = false,
  module,
  onClick,
  ariaLabel,
}: {
  label: string;
  value: string | number;
  helper?: string;
  icon?: React.ComponentType<{ className?: string }>;
  iconClassName?: string;
  accent?: boolean;
  delta?: {
    value: string;
    tone?: SemanticToneLike;
  } | null;
  surface?: "default" | "pt-hub";
  className?: string;
  disableHoverMotion?: boolean;
  module?: ModuleTone;
  onClick?: (() => void) | null;
  ariaLabel?: string;
}) {
  const isPtHub = surface === "pt-hub";
  const reduceMotion = useReducedMotion();
  const ptHubLabelClassName = "text-[oklch(var(--text-secondary)/0.88)]";
  const ptHubHelperClassName = "text-muted-foreground";
  const moduleClasses = module ? getModuleToneClasses(module) : null;
  const toneStyle = getModuleToneStyle(module);

  const card = (
    <Card
      className={cn(
        isPtHub
          ? "surface-panel relative h-full min-h-[188px] overflow-hidden rounded-[30px] border-border/70 shadow-[var(--surface-shadow)] backdrop-blur-xl"
          : "relative overflow-hidden rounded-[26px] border border-border/75 bg-[linear-gradient(180deg,oklch(var(--bg-surface-elevated)/0.8),oklch(var(--bg-surface)/0.66))] shadow-[0_28px_70px_-50px_oklch(0_0_0/0.78)] backdrop-blur-xl",
        module && moduleClasses?.card,
        accent &&
          (isPtHub
            ? "border-primary/25"
            : "border-primary/35 shadow-[0_26px_60px_-42px_oklch(var(--accent)/0.24)]"),
        onClick && "cursor-pointer",
        className,
      )}
      style={toneStyle}
    >
      {isPtHub ? (
        <div
          className={cn(
            "pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,oklch(var(--accent)/0.14),transparent_34%),radial-gradient(circle_at_bottom_left,oklch(var(--chart-3)/0.08),transparent_28%),linear-gradient(180deg,oklch(var(--bg-surface-elevated)/0.12),transparent_48%)]",
            accent &&
              "bg-[radial-gradient(circle_at_top_right,oklch(var(--accent)/0.18),transparent_32%),radial-gradient(circle_at_bottom_left,oklch(var(--chart-3)/0.1),transparent_28%),linear-gradient(180deg,oklch(var(--bg-surface-elevated)/0.14),transparent_48%)]",
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
        <div
          className={cn(
            "flex items-center justify-between text-xs text-muted-foreground",
            isPtHub && ptHubLabelClassName,
          )}
        >
          <span className="font-semibold uppercase tracking-[0.22em]">
            {label}
          </span>
          {Icon ? (
            <Icon
              className={cn(
                "h-5 w-5 shrink-0 [stroke-width:1.9]",
                module ? moduleClasses?.title : "text-foreground",
                iconClassName,
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
              <AnimatedValue value={value} />
            </CardTitle>
            {helper ? (
              <p
                className={cn(
                  "text-xs text-muted-foreground",
                  isPtHub &&
                    cn(
                      "mt-1 text-[0.78rem] leading-[1.15rem]",
                      ptHubHelperClassName,
                    ),
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
                getSemanticToneClasses(delta.tone).surface,
                !isPtHub &&
                  (!delta.tone || delta.tone === "neutral") &&
                  "bg-muted/28 text-muted-foreground",
              )}
            >
              {delta.value}
            </span>
          ) : null}
        </div>
      </CardHeader>
    </Card>
  );

  return (
    <motion.div
      className="h-full"
      whileHover={
        reduceMotion || disableHoverMotion
          ? undefined
          : { y: -4, transition: { duration: 0.2, ease: "easeOut" } }
      }
    >
      {onClick ? (
        <button
          type="button"
          className="block h-full w-full rounded-[26px] text-left outline-none transition focus-visible:ring-2 focus-visible:ring-primary/70 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          onClick={onClick}
          aria-label={ariaLabel ?? label}
        >
          {card}
        </button>
      ) : (
        card
      )}
    </motion.div>
  );
}

// Example:
// <StatCard label="Momentum" value="4 workouts" helper="Last 7 days" icon={Rocket} delta={{ value: "+2", tone: "positive" }} />

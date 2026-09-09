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
  accent,
  delta,
  surface = "default",
  className,
  headerClassName,
  disableHoverMotion = true,
  module,
  onClick,
  ariaLabel,
}: {
  label: string;
  value: string | number;
  helper?: string;
  /** @deprecated Shared KPI cards intentionally render without decorative icons. */
  icon?: React.ComponentType<{ className?: string }>;
  /** @deprecated Shared KPI cards intentionally render without decorative icons. */
  iconClassName?: string;
  accent?: boolean;
  delta?: {
    value: string;
    tone?: SemanticToneLike;
  } | null;
  surface?: "default" | "pt-hub";
  className?: string;
  headerClassName?: string;
  disableHoverMotion?: boolean;
  module?: ModuleTone;
  onClick?: (() => void) | null;
  ariaLabel?: string;
}) {
  const isPtHub = surface === "pt-hub";
  const reduceMotion = useReducedMotion();
  const ptHubLabelClassName = "text-[oklch(var(--text-secondary)/0.88)]";
  const moduleClasses = module ? getModuleToneClasses(module) : null;
  const toneStyle = getModuleToneStyle(module);

  const card = (
    <Card
      className={cn(
        "kpi-card relative h-full overflow-hidden border border-border/70 backdrop-blur-xl",
        module && moduleClasses?.card,
        accent && (isPtHub ? "border-primary/25" : "border-primary/35"),
        onClick && "cursor-pointer",
        className,
      )}
      style={toneStyle}
    >
      <CardHeader
        className={cn(
          "kpi-card-content relative flex h-full gap-2 space-y-0 p-4 sm:p-4",
          headerClassName,
        )}
      >
        <div
          className={cn(
            "flex items-center justify-between text-xs text-muted-foreground",
            isPtHub && ptHubLabelClassName,
          )}
        >
          <span className="kpi-label font-semibold normal-case tracking-normal">
            {label}
          </span>
        </div>
        <div className="kpi-card-reading flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0 flex-1">
            <CardTitle className="kpi-value text-2xl font-semibold tracking-tight tabular-nums">
              <AnimatedValue value={value} />
            </CardTitle>
            {helper ? (
              <p className="kpi-helper mt-1 text-xs leading-[1.15rem] text-muted-foreground">
                {helper}
              </p>
            ) : null}
          </div>
          {delta ? (
            <span
              className={cn(
                "inline-flex shrink-0 items-center rounded-full border px-2.5 py-1 text-xs font-semibold tracking-normal",
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
          className="kpi-card-button block h-full w-full rounded-[20px] text-left outline-none transition focus-visible:ring-2 focus-visible:ring-primary/70 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
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

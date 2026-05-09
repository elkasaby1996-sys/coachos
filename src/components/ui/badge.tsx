import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/utils";
import {
  getModuleToneClasses,
  getModuleToneStyle,
  moduleTones,
  type ModuleTone,
} from "../../lib/module-tone";
import {
  semanticToneClassNames,
  semanticTones,
  type SemanticTone,
} from "../../lib/semantic-status";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em]",
  {
    variants: {
      variant: {
        default: "border-border/70 bg-card/60 text-foreground",
        secondary: "border-border/70 bg-secondary/72 text-secondary-foreground",
        success:
          "border-[var(--state-success-border)] bg-[var(--state-success-bg-soft)] text-[var(--state-success-text)]",
        info: "border-[var(--state-info-border)] bg-[var(--state-info-bg-soft)] text-[var(--state-info-text)]",
        warning:
          "border-[var(--state-warning-border)] bg-[var(--state-warning-bg-soft)] text-[var(--state-warning-text)]",
        danger:
          "border-[var(--state-danger-border)] bg-[var(--state-danger-bg-soft)] text-[var(--state-danger-text)]",
        neutral:
          "border-[var(--state-neutral-border)] bg-[var(--state-neutral-bg-soft)] text-[var(--state-neutral-text)]",
        overview: "section-accent-badge",
        leads: "section-accent-badge",
        clients: "section-accent-badge",
        coaching: "section-accent-badge",
        checkins: "section-accent-badge",
        billing: "section-accent-badge",
        analytics: "section-accent-badge",
        profile: "section-accent-badge",
        settings: "section-accent-badge",
        muted: "border-border/60 bg-muted/55 text-muted-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps
  extends
    React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {
  tone?: SemanticTone | null;
  module?: ModuleTone | null;
}

export type BadgeVariant = NonNullable<BadgeProps["variant"]>;

const Badge = React.forwardRef<HTMLDivElement, BadgeProps>(
  ({ className, variant, tone, module, style, ...props }, ref) => {
    const resolvedModule =
      module ??
      (variant && moduleTones.includes(variant as ModuleTone)
        ? (variant as ModuleTone)
        : null);
    const resolvedTone =
      tone ??
      (variant && semanticTones.includes(variant as SemanticTone)
        ? (variant as SemanticTone)
        : null);
    const moduleClasses = resolvedModule
      ? getModuleToneClasses(resolvedModule)
      : null;
    const toneClasses = resolvedTone
      ? semanticToneClassNames[resolvedTone].badge
      : null;

    return (
      <div
        ref={ref}
        className={cn(
          badgeVariants({ variant }),
          resolvedModule && moduleClasses?.badge,
          toneClasses,
          className,
        )}
        style={{
          ...getModuleToneStyle(resolvedModule),
          ...style,
        }}
        {...props}
      />
    );
  },
);
Badge.displayName = "Badge";

export { Badge };

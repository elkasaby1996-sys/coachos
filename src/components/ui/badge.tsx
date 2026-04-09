import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/utils";
import {
  getModuleToneClasses,
  getModuleToneStyle,
  type ModuleTone,
} from "../../lib/module-tone";
import { semanticToneClassNames, type SemanticTone } from "../../lib/semantic-status";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em]",
  {
    variants: {
      variant: {
        default: "border-border/70 bg-card/60 text-foreground",
        secondary: "border-border/70 bg-secondary/72 text-secondary-foreground",
        success: "border-success/22 bg-success/12 text-success",
        info: "border-info/22 bg-info/12 text-info",
        warning: "border-warning/22 bg-warning/12 text-warning",
        danger: "border-danger/22 bg-danger/12 text-danger",
        neutral: "border-neutral/22 bg-neutral/12 text-neutral",
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
    const moduleClasses = module ? getModuleToneClasses(module) : null;
    const toneClasses = tone ? semanticToneClassNames[tone].badge : null;

    return (
    <div
      ref={ref}
      className={cn(
        badgeVariants({ variant }),
        module && moduleClasses?.badge,
        toneClasses,
        className,
      )}
      style={{
        ...getModuleToneStyle(module),
        ...style,
      }}
      {...props}
    />
    );
  },
);
Badge.displayName = "Badge";

export { Badge };

import * as React from "react";
import {
  CheckCircle2,
  ClipboardCheck,
  Info,
  Lock,
  TriangleAlert,
  XCircle,
} from "lucide-react";
import { Button } from "../../ui/button";
import { Reveal } from "../../common/motion-primitives";
import { cn } from "../../../lib/utils";
import {
  getModuleToneClasses,
  getModuleToneStyle,
  type ModuleTone,
} from "../../../lib/module-tone";
import {
  getSemanticToneClasses,
  type SemanticTone,
} from "../../../lib/semantic-status";
import { useWorkspaceHeaderMode } from "../../pt/workspace-header-mode";

type PortalPageHeaderProps = {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  stateText?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
  module?: ModuleTone;
};

export function PortalPageHeader({
  title,
  subtitle,
  stateText,
  actions,
  className,
  module,
}: PortalPageHeaderProps) {
  const headerMode = useWorkspaceHeaderMode();
  const moduleClasses = module ? getModuleToneClasses(module) : null;

  if (headerMode === "shell") {
    if (!actions) return null;

    return (
      <Reveal>
        <section className={cn("flex flex-wrap items-center gap-2", className)}>
          {actions}
        </section>
      </Reveal>
    );
  }

  return (
    <Reveal>
      <section
        className={cn(
          "flex flex-col gap-5 border-b border-border/50 pb-5 lg:flex-row lg:items-end lg:justify-between",
          className,
        )}
        style={getModuleToneStyle(module)}
      >
        <div className="min-w-0 space-y-2">
          <h1
            className={cn(
              "text-[1.85rem] font-semibold tracking-[-0.035em] text-foreground sm:text-[2.15rem] lg:text-[2.35rem]",
              moduleClasses?.title,
            )}
          >
            {title}
          </h1>
          {subtitle || stateText ? (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm leading-6 text-muted-foreground sm:text-[15px] sm:leading-7">
              {subtitle ? <p className="max-w-3xl">{subtitle}</p> : null}
              {stateText ? (
                <span className="inline-flex max-w-full items-center gap-2 text-sm font-medium text-foreground/80">
                  <span
                    className={cn(
                      "h-1.5 w-1.5 rounded-full",
                      moduleClasses?.dot ?? "bg-primary/80",
                    )}
                  />
                  <span>{stateText}</span>
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
        {actions ? (
          <div className="grid w-full gap-2 sm:flex sm:flex-wrap sm:items-center lg:w-auto lg:justify-end">
            {actions}
          </div>
        ) : null}
      </section>
    </Reveal>
  );
}

export const SurfaceCard = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & { module?: ModuleTone | null }
>(({ className, module, style, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "surface-panel-portal overflow-hidden transition-[transform,border-color,box-shadow] duration-300 ease-out",
      module && getModuleToneClasses(module).card,
      className,
    )}
    style={{
      ...getModuleToneStyle(module),
      ...style,
    }}
    {...props}
  />
));
SurfaceCard.displayName = "SurfaceCard";

export const SurfaceCardHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & { module?: ModuleTone | null }
>(({ className, module, style, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "flex flex-col gap-2 px-5 py-5 sm:px-6 sm:py-6",
      module && getModuleToneClasses(module).panel,
      className,
    )}
    style={{
      ...getModuleToneStyle(module),
      ...style,
    }}
    {...props}
  />
));
SurfaceCardHeader.displayName = "SurfaceCardHeader";

export const SurfaceCardTitle = React.forwardRef<
  HTMLHeadingElement,
  React.HTMLAttributes<HTMLHeadingElement> & { module?: ModuleTone | null }
>(({ className, module, style, ...props }, ref) => (
  <h2
    ref={ref}
    className={cn(
      "text-lg font-semibold tracking-tight text-foreground sm:text-[1.15rem]",
      module && getModuleToneClasses(module).title,
      className,
    )}
    style={{
      ...getModuleToneStyle(module),
      ...style,
    }}
    {...props}
  />
));
SurfaceCardTitle.displayName = "SurfaceCardTitle";

export const SurfaceCardDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn("text-[15px] leading-7 text-muted-foreground", className)}
    {...props}
  />
));
SurfaceCardDescription.displayName = "SurfaceCardDescription";

export const SurfaceCardContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("px-5 pb-5 pt-0 sm:px-6 sm:pb-6", className)}
    {...props}
  />
));
SurfaceCardContent.displayName = "SurfaceCardContent";

export const SectionCard = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & { module?: ModuleTone | null }
>(({ className, module, style, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "surface-section p-4 shadow-none transition-[transform,border-color,box-shadow] duration-300 ease-out sm:p-5",
      module && getModuleToneClasses(module).card,
      className,
    )}
    style={{
      ...getModuleToneStyle(module),
      ...style,
    }}
    {...props}
  />
));
SectionCard.displayName = "SectionCard";

type StatusBannerVariant =
  | "success"
  | "info"
  | "warning"
  | "error"
  | "reviewed"
  | "locked";

const bannerConfig: Record<
  StatusBannerVariant,
  {
    icon: React.ComponentType<{ className?: string }>;
    root: string;
    iconClassName: string;
  }
> = {
  success: {
    icon: CheckCircle2,
    root: "border-success/28 bg-success/12 text-foreground",
    iconClassName: "text-success",
  },
  info: {
    icon: Info,
    root: "border-accent/30 bg-accent/10 text-foreground",
    iconClassName: "text-accent",
  },
  warning: {
    icon: TriangleAlert,
    root: "border-warning/28 bg-warning/12 text-foreground",
    iconClassName: "text-warning",
  },
  error: {
    icon: XCircle,
    root: "border-danger/28 bg-danger/12 text-foreground",
    iconClassName: "text-danger",
  },
  reviewed: {
    icon: ClipboardCheck,
    root: "border-primary/28 bg-primary/10 text-foreground",
    iconClassName: "text-primary",
  },
  locked: {
    icon: Lock,
    root: "border-border/70 bg-muted/28 text-foreground",
    iconClassName: "text-muted-foreground",
  },
};

type StatusBannerProps = {
  variant: StatusBannerVariant;
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
  tone?: SemanticTone;
};

export function StatusBanner({
  variant,
  title,
  description,
  actions,
  icon,
  className,
  tone,
}: StatusBannerProps) {
  const config = bannerConfig[variant];
  const Icon = config.icon;
  const semanticTone =
    tone ??
    (variant === "success"
      ? "success"
      : variant === "info" || variant === "reviewed"
        ? "info"
        : variant === "warning"
          ? "warning"
          : variant === "error"
            ? "danger"
            : "neutral");
  const toneClasses = getSemanticToneClasses(semanticTone);

  return (
    <Reveal delay={0.04}>
      <div
        className={cn(
          "flex flex-col gap-4 rounded-[22px] border px-4 py-4 shadow-[inset_0_1px_0_oklch(1_0_0/0.04)] sm:flex-row sm:items-start sm:justify-between",
          config.root,
          toneClasses.surface,
          className,
        )}
      >
        <div className="flex items-start gap-3">
          {icon ?? (
            <Icon
              className={cn(
                "mt-0.5 h-5 w-5 shrink-0 transition-transform duration-300",
                config.iconClassName,
                toneClasses.text,
              )}
            />
          )}
          <div className="space-y-1">
            <p className="text-sm font-semibold text-foreground">{title}</p>
            {description ? (
              <div className="text-sm leading-6 text-foreground/80">
                {description}
              </div>
            ) : null}
          </div>
        </div>
        {actions ? (
          <div className="flex flex-wrap items-center gap-2 sm:justify-end">
            {actions}
          </div>
        ) : null}
      </div>
    </Reveal>
  );
}

type EmptyStateBlockProps = {
  title: React.ReactNode;
  description?: React.ReactNode;
  icon?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
  centered?: boolean;
};

export function EmptyStateBlock({
  title,
  description,
  icon,
  actions,
  className,
  centered = false,
}: EmptyStateBlockProps) {
  return (
    <Reveal delay={0.06}>
      <div
        className={cn(
          "surface-dashed px-6 py-7 transition-[transform,border-color,box-shadow] duration-300",
          centered && "text-center",
          className,
        )}
      >
        <div
          className={cn(
            "mb-4 flex h-12 w-12 items-center justify-center text-primary",
            centered && "mx-auto",
          )}
        >
          {icon ?? <Info className="h-5 w-5" />}
        </div>
        <p className="text-base font-semibold tracking-tight text-foreground">
          {title}
        </p>
        {description ? (
          <div className="mt-2 max-w-xl text-[15px] leading-7 text-muted-foreground">
            {description}
          </div>
        ) : null}
        {actions ? (
          <div
            className={cn(
              "mt-5 flex flex-col items-stretch gap-2 sm:flex-row sm:flex-wrap sm:items-center",
              centered && "sm:justify-center",
            )}
          >
            {actions}
          </div>
        ) : null}
      </div>
    </Reveal>
  );
}

export function StickyActionBar({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "sticky bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-20 mt-6 lg:bottom-6",
        className,
      )}
      {...props}
    >
      <div
        className="surface-panel-portal flex flex-col items-stretch gap-3 border border-border/70 px-4 py-4 backdrop-blur-xl sm:px-5 md:flex-row md:flex-wrap md:items-center md:justify-between"
        style={{
          backgroundColor: "var(--sticky-bar-bg)",
          boxShadow: "var(--sticky-shadow)",
        }}
      >
        {children}
      </div>
    </div>
  );
}

type StepIndicatorStep = {
  label: React.ReactNode;
  state: "current" | "completed" | "upcoming";
  onClick?: () => void;
  disabled?: boolean;
};

export function StepIndicator({
  steps,
  className,
  module,
}: {
  steps: StepIndicatorStep[];
  className?: string;
  module?: ModuleTone;
}) {
  return (
    <ol
      className={cn("grid gap-3 md:grid-cols-3", className)}
      aria-label="Progress"
      style={getModuleToneStyle(module)}
    >
      {steps.map((step, index) => {
        const isInteractive = Boolean(step.onClick) && !step.disabled;
        const Component = isInteractive ? "button" : "div";
        return (
          <li key={`${index}-${String(step.label)}`}>
            <Component
              type={isInteractive ? "button" : undefined}
              onClick={step.onClick}
              disabled={step.disabled}
              className={cn(
                "surface-section flex w-full items-center gap-3 px-4 py-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                step.state === "current" &&
                  "border-[var(--section-accent-border)] bg-[var(--section-accent-bg-soft)] shadow-[0_12px_36px_-28px_color-mix(in_oklab,var(--section-accent-bg-soft)_74%,transparent)]",
                step.state === "completed" && "border-success/30 bg-success/10",
                step.state === "upcoming" && "text-muted-foreground",
                isInteractive &&
                  "hover:-translate-y-0.5 hover:border-border/90 hover:bg-card/55",
              )}
            >
              <span
                className={cn(
                  "flex h-9 w-9 items-center justify-center rounded-full border text-sm font-semibold",
                  step.state === "current" &&
                    "border-[var(--section-accent-border)] bg-[var(--section-accent-text)] text-[oklch(var(--text-on-accent))]",
                  step.state === "completed" &&
                    "border-success/40 bg-success/18 text-success",
                  step.state === "upcoming" &&
                    "border-border/70 bg-card/60 text-muted-foreground",
                )}
              >
                {step.state === "completed" ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : (
                  index + 1
                )}
              </span>
              <div className="min-w-0">
                <p className="text-xs font-medium capitalize tracking-[0.04em] text-muted-foreground">
                  {step.state}
                </p>
                <p className="text-sm font-medium text-foreground">
                  {step.label}
                </p>
              </div>
            </Component>
          </li>
        );
      })}
    </ol>
  );
}

export function EmptyStateActionButton({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <Button size="sm" variant="secondary" className="h-9" onClick={onClick}>
      {label}
    </Button>
  );
}

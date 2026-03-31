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
import { cn } from "../../../lib/utils";

type PortalPageHeaderProps = {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  stateText?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
};

export function PortalPageHeader({
  title,
  subtitle,
  stateText,
  actions,
  className,
}: PortalPageHeaderProps) {
  return (
    <section
      className={cn(
        "flex flex-col gap-5 border-b border-border/50 pb-5 lg:flex-row lg:items-end lg:justify-between",
        className,
      )}
    >
      <div className="min-w-0 space-y-2">
        <h1 className="text-[1.85rem] font-semibold tracking-[-0.035em] text-foreground sm:text-[2.15rem] lg:text-[2.35rem]">
          {title}
        </h1>
        {subtitle || stateText ? (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm leading-6 text-muted-foreground sm:text-[15px] sm:leading-7">
            {subtitle ? <p className="max-w-3xl">{subtitle}</p> : null}
            {stateText ? (
              <span className="inline-flex max-w-full items-center rounded-full border border-border/70 bg-background/40 px-2.5 py-1 text-[12px] font-medium text-foreground/80">
                {stateText}
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
  );
}

export const SurfaceCard = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("surface-panel-portal overflow-hidden", className)}
    {...props}
  />
));
SurfaceCard.displayName = "SurfaceCard";

export const SurfaceCardHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "flex flex-col gap-2 px-5 py-5 sm:px-6 sm:py-6",
      className,
    )}
    {...props}
  />
));
SurfaceCardHeader.displayName = "SurfaceCardHeader";

export const SurfaceCardTitle = React.forwardRef<
  HTMLHeadingElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h2
    ref={ref}
    className={cn("text-lg font-semibold tracking-tight text-foreground", className)}
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
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("surface-section p-4 sm:p-5", className)}
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
  { icon: React.ComponentType<{ className?: string }>; root: string; iconBox: string }
> = {
  success: {
    icon: CheckCircle2,
    root: "border-success/28 bg-success/12 text-foreground",
    iconBox: "bg-success/18 text-success",
  },
  info: {
    icon: Info,
    root: "border-accent/30 bg-accent/10 text-foreground",
    iconBox: "bg-accent/18 text-accent",
  },
  warning: {
    icon: TriangleAlert,
    root: "border-warning/28 bg-warning/12 text-foreground",
    iconBox: "bg-warning/18 text-warning",
  },
  error: {
    icon: XCircle,
    root: "border-danger/28 bg-danger/12 text-foreground",
    iconBox: "bg-danger/18 text-danger",
  },
  reviewed: {
    icon: ClipboardCheck,
    root: "border-primary/28 bg-primary/10 text-foreground",
    iconBox: "bg-primary/18 text-primary",
  },
  locked: {
    icon: Lock,
    root: "border-border/70 bg-muted/28 text-foreground",
    iconBox: "bg-background/70 text-muted-foreground",
  },
};

type StatusBannerProps = {
  variant: StatusBannerVariant;
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
};

export function StatusBanner({
  variant,
  title,
  description,
  actions,
  icon,
  className,
}: StatusBannerProps) {
  const config = bannerConfig[variant];
  const Icon = config.icon;

  return (
    <div
      className={cn(
        "flex flex-col gap-4 rounded-[var(--radius-lg)] border px-4 py-4 sm:flex-row sm:items-start sm:justify-between",
        config.root,
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/5",
            config.iconBox,
          )}
        >
          {icon ?? <Icon className="h-5 w-5" />}
        </div>
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
    <div
      className={cn(
        "surface-dashed bg-[linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0.015))] px-6 py-7",
        centered && "text-center",
        className,
      )}
    >
      <div
        className={cn(
          "mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-border/70 bg-background/70 text-primary",
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
      <div className="surface-panel-portal flex flex-col items-stretch gap-3 border border-border/70 bg-background/92 px-4 py-4 shadow-[0_24px_60px_-40px_rgba(0,0,0,0.92)] backdrop-blur-xl sm:px-5 md:flex-row md:flex-wrap md:items-center md:justify-between">
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
}: {
  steps: StepIndicatorStep[];
  className?: string;
}) {
  return (
    <ol
      className={cn("grid gap-3 md:grid-cols-3", className)}
      aria-label="Progress"
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
                  "border-primary/45 bg-primary/10 shadow-[0_12px_36px_-28px_rgba(56,189,248,0.65)]",
                step.state === "completed" &&
                  "border-success/30 bg-success/10",
                step.state === "upcoming" &&
                  "text-muted-foreground",
                isInteractive && "hover:border-border/90 hover:bg-background/55",
              )}
            >
              <span
                className={cn(
                  "flex h-9 w-9 items-center justify-center rounded-full border text-sm font-semibold",
                  step.state === "current" &&
                    "border-primary/60 bg-primary text-primary-foreground",
                  step.state === "completed" &&
                    "border-success/40 bg-success/18 text-success",
                  step.state === "upcoming" &&
                    "border-border/70 bg-background/60 text-muted-foreground",
                )}
              >
                {step.state === "completed" ? <CheckCircle2 className="h-4 w-4" /> : index + 1}
              </span>
              <div className="min-w-0">
                <p className="text-xs font-medium capitalize tracking-[0.04em] text-muted-foreground">
                  {step.state}
                </p>
                <p className="text-sm font-medium text-foreground">{step.label}</p>
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

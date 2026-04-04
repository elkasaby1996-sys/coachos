import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Sparkles,
} from "lucide-react";
import { Link } from "react-router-dom";
import { EmptyState } from "../../../components/ui/coachos/empty-state";
import { Skeleton } from "../../../components/ui/coachos/skeleton";
import { Button } from "../../../components/ui/button";
import { cn } from "../../../lib/utils";
import type {
  PtHubOverviewActionItem,
  PtHubOverviewChecklistItem,
  PtHubOverviewQuickAction,
  PtHubOverviewSummaryItem,
} from "../lib/overview-dashboard";
import { PtHubSectionCard } from "./pt-hub-section-card";

export interface PtHubOverviewActivityItem {
  id: string;
  title: string;
  description: string;
  href: string;
  ctaLabel: string;
}

function getActionToneClassName(tone: PtHubOverviewActionItem["tone"]) {
  switch (tone) {
    case "danger":
      return "text-danger";
    case "warning":
      return "text-warning";
    case "success":
      return "text-success";
    default:
      return "text-muted-foreground";
  }
}

export function PtHubOverviewLoadingState() {
  return (
    <section className="space-y-7" aria-label="Loading overview dashboard">
      <div className="grid gap-4 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={`metric-skeleton-${index}`}
            className="surface-panel relative overflow-hidden rounded-[30px] border border-border/70 px-5 py-5 shadow-[0_24px_60px_-42px_rgba(0,0,0,0.82)] backdrop-blur-xl sm:px-6"
          >
            <Skeleton className="h-3 w-28" />
            <Skeleton className="mt-6 h-10 w-24 rounded-xl" />
            <Skeleton className="mt-3 h-4 w-36" />
          </div>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_380px]">
        <div className="surface-panel-strong rounded-[34px] border border-border/70 px-5 py-5 shadow-[0_34px_92px_-56px_rgba(0,0,0,0.98)] backdrop-blur-xl sm:px-6 sm:py-6">
          <div className="space-y-4">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-10 w-72 rounded-2xl" />
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, index) => (
                <Skeleton
                  key={`action-skeleton-${index}`}
                  className="h-24 w-full rounded-[28px]"
                />
              ))}
            </div>
          </div>
        </div>
        <div className="surface-panel rounded-[30px] border border-border/70 px-5 py-5 shadow-[0_26px_70px_-44px_rgba(0,0,0,0.82)] backdrop-blur-xl sm:px-6">
          <div className="space-y-4">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-8 w-44 rounded-xl" />
            {Array.from({ length: 3 }).map((_, index) => (
              <Skeleton
                key={`activity-skeleton-${index}`}
                className="h-20 w-full rounded-[24px]"
              />
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <div
            key={`panel-skeleton-${index}`}
            className="surface-panel rounded-[30px] border border-border/70 px-5 py-5 shadow-[0_26px_70px_-44px_rgba(0,0,0,0.82)] backdrop-blur-xl sm:px-6"
          >
            <Skeleton className="h-4 w-32" />
            <div className="mt-5 space-y-3">
              {Array.from({ length: 4 }).map((_, rowIndex) => (
                <Skeleton
                  key={`panel-skeleton-${index}-${rowIndex}`}
                  className="h-16 w-full rounded-[22px]"
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export function PtHubOverviewErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <section className="space-y-6">
      <PtHubSectionCard
        title="Overview unavailable"
        description="The overview could not load right now. Try refreshing the dashboard data."
        actions={
          <Button variant="secondary" onClick={onRetry}>
            Try again
          </Button>
        }
      >
        <EmptyState
          title="We hit a loading problem"
          description="The coach dashboard depends on multiple PT Hub queries, and one of them failed. A retry usually clears transient issues."
          icon={<AlertTriangle className="h-5 w-5 [stroke-width:1.7]" />}
          actionLabel="Retry dashboard"
          onAction={onRetry}
          className="rounded-[26px] border-border/70 bg-background/34"
        />
      </PtHubSectionCard>
    </section>
  );
}

export function PtHubActionCenter({
  items,
  mode,
}: {
  items: PtHubOverviewActionItem[];
  mode: "activation" | "operating";
}) {
  const helperText =
    mode === "activation"
      ? "Clear the blockers that keep your coaching space from going live."
      : null;

  return (
    <div className="surface-panel-strong relative overflow-hidden rounded-[34px] border border-border/70 px-5 py-5 shadow-[0_34px_92px_-56px_rgba(0,0,0,0.98)] backdrop-blur-xl sm:px-6 sm:py-6">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,oklch(var(--accent)/0.2),transparent_32%),radial-gradient(circle_at_bottom_left,oklch(var(--success)/0.14),transparent_28%),linear-gradient(180deg,oklch(var(--bg-surface-elevated)/0.18),transparent_46%,oklch(var(--bg-surface)/0.12))]" />
      <div className="pointer-events-none absolute inset-x-6 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.28),transparent)]" />

      <div className="relative space-y-4">
        <div className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-primary/90">
            Action center
          </p>
          <h2 className="text-balance text-[2.05rem] font-semibold uppercase tracking-[0.06em] text-foreground sm:text-[2.55rem]">
            {mode === "activation"
              ? "Needs attention before launch."
              : "Needs attention now."}
          </h2>
          {helperText ? (
            <p className="max-w-2xl text-[0.95rem] leading-6 text-muted-foreground">
              {helperText}
            </p>
          ) : null}
        </div>

        {items.length > 0 ? (
          <div className="-mx-1 divide-y divide-border/60">
            {items.map((item) => (
              <article
                key={item.id}
                className="pt-hub-interactive group grid gap-4 rounded-[24px] border border-transparent bg-transparent px-4 py-4 first:pt-1 sm:px-5 md:grid-cols-[minmax(0,1fr)_auto] md:items-center hover:bg-background/20"
              >
                <div className="min-w-0 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-[1rem] font-medium uppercase tracking-[0.04em] text-foreground">
                      {item.label}
                    </p>
                    <span
                      className={cn(
                        "text-[11px] font-semibold uppercase tracking-[0.2em]",
                        getActionToneClassName(item.tone),
                      )}
                    >
                      {item.badge}
                    </span>
                  </div>
                  <p className="max-w-2xl text-[0.95rem] leading-6 text-muted-foreground">
                    {item.description}
                  </p>
                </div>
                <Button
                  asChild
                  variant="ghost"
                  className="shrink-0 justify-between px-0 text-primary hover:bg-transparent hover:text-foreground"
                >
                  <Link to={item.href}>
                    {item.ctaLabel}
                    <ArrowRight className="h-4 w-4 [stroke-width:1.7]" />
                  </Link>
                </Button>
              </article>
            ))}
          </div>
        ) : (
          <div className="rounded-[28px] border border-success/18 bg-success/8 px-5 py-6">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[18px] border border-success/24 bg-success/14 text-success">
                <CheckCircle2 className="h-4 w-4 [stroke-width:1.7]" />
              </div>
              <div>
                <p className="text-[1rem] font-medium uppercase tracking-[0.04em] text-foreground">
                  Nothing urgent right now
                </p>
                <p className="mt-2 max-w-2xl text-[0.95rem] leading-6 text-muted-foreground">
                  You are caught up on the biggest blockers. Use the sections
                  below to keep momentum moving and look for the next growth
                  opportunity.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function PtHubRecentActivityCard({
  items,
}: {
  items: PtHubOverviewActivityItem[];
}) {
  return (
    <PtHubSectionCard title="Recent activity">
      {items.length > 0 ? (
        <div className="-mx-1 divide-y divide-border/60">
          {items.map((item) => (
            <div
              key={item.id}
              className="pt-hub-interactive group space-y-2 rounded-[22px] border border-transparent bg-transparent px-4 py-4 hover:bg-background/18"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-sm font-medium uppercase tracking-[0.04em] text-foreground">
                    {item.title}
                  </p>
                  <p className="mt-2 text-[0.95rem] leading-6 text-muted-foreground">
                    {item.description}
                  </p>
                </div>
                <Button
                  asChild
                  size="sm"
                  variant="ghost"
                  className="shrink-0 px-0 text-primary hover:bg-transparent hover:text-foreground"
                >
                  <Link to={item.href}>{item.ctaLabel}</Link>
                </Button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState
          title="Activity will build as you use the hub"
          description="Profile progress, lead movement, and coaching space changes will surface here once the business starts moving."
          icon={<Sparkles className="h-5 w-5 [stroke-width:1.7]" />}
          action={
            <Button asChild variant="secondary">
              <Link to="/pt-hub/profile">Open coach profile</Link>
            </Button>
          }
          className="rounded-[26px] border-border/70 bg-background/34"
        />
      )}
    </PtHubSectionCard>
  );
}

export function PtHubLaunchChecklistCard({
  items,
  completionPercent,
}: {
  items: PtHubOverviewChecklistItem[];
  completionPercent: number;
}) {
  return (
    <PtHubSectionCard title="Launch checklist">
      <div className="space-y-4">
        <div className="rounded-[20px] border border-border/55 bg-background/24 px-4 py-4 backdrop-blur-xl">
          <div className="flex items-center justify-between gap-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            <span>Completion</span>
            <span>{completionPercent}%</span>
          </div>
          <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-muted/70">
            <div
              className="h-full rounded-full bg-[linear-gradient(90deg,oklch(var(--accent)),oklch(var(--chart-2)),oklch(var(--success)))] transition-[width]"
              style={{ width: `${completionPercent}%` }}
            />
          </div>
        </div>

        <div className="-mx-1 divide-y divide-border/60">
          {items.map((item) => (
            <div
              key={item.id}
              className="pt-hub-interactive flex flex-col gap-4 rounded-[22px] border border-transparent bg-transparent px-4 py-4 hover:bg-background/18 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0 flex items-start gap-3">
                <span
                  className={cn(
                    "mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-[16px] border backdrop-blur-lg",
                    item.complete
                      ? "border-success/24 bg-success/12 text-success"
                      : "border-primary/20 bg-[linear-gradient(180deg,oklch(var(--bg-surface-elevated)/0.72),oklch(var(--bg-surface)/0.42))] text-primary",
                  )}
                >
                  <CheckCircle2
                    className={cn(
                      "h-4 w-4 [stroke-width:1.7]",
                      !item.complete && "opacity-55",
                    )}
                  />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-medium uppercase tracking-[0.04em] text-foreground">
                    {item.label}
                  </p>
                  <p className="mt-2 text-[0.95rem] leading-6 text-muted-foreground">
                    {item.description}
                  </p>
                </div>
              </div>
              <Button asChild variant={item.complete ? "ghost" : "secondary"}>
                <Link to={item.href}>{item.ctaLabel}</Link>
              </Button>
            </div>
          ))}
        </div>
      </div>
    </PtHubSectionCard>
  );
}

export function PtHubQuickActionsCard({
  actions,
}: {
  actions: PtHubOverviewQuickAction[];
}) {
  return (
    <PtHubSectionCard title="Quick actions">
      <div className="-mx-1 divide-y divide-border/60">
        {actions.map((action) => (
          <Link
            key={action.id}
            to={action.href}
            className="pt-hub-interactive group flex items-center gap-3 rounded-[22px] border border-transparent bg-transparent px-4 py-4 hover:bg-background/18"
          >
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium uppercase tracking-[0.04em] text-foreground">
                {action.label}
              </p>
              <p className="mt-1 text-[0.95rem] leading-6 text-muted-foreground">
                {action.description}
              </p>
            </div>
            <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 group-hover:translate-x-1 group-hover:text-primary" />
          </Link>
        ))}
      </div>
    </PtHubSectionCard>
  );
}

export function PtHubSummaryCard({
  title,
  description,
  items,
  isEmpty = false,
  emptyState,
}: {
  title: string;
  description?: string;
  items: PtHubOverviewSummaryItem[];
  isEmpty?: boolean;
  emptyState?: {
    title: string;
    description: string;
    href: string;
    ctaLabel: string;
  };
}) {
  return (
    <PtHubSectionCard title={title} description={description}>
      {emptyState && isEmpty ? (
        <EmptyState
          title={emptyState.title}
          description={emptyState.description}
          action={
            <Button asChild variant="secondary">
              <Link to={emptyState.href}>{emptyState.ctaLabel}</Link>
            </Button>
          }
          className="rounded-[26px] border-border/70 bg-background/34"
        />
      ) : (
        <div className="-mx-1 divide-y divide-border/60">
          {items.map((item) => (
            <div
              key={item.id}
              className="pt-hub-interactive rounded-[22px] border border-transparent bg-transparent px-4 py-4 hover:bg-background/18"
            >
              <div className="min-w-0 space-y-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                  {item.label}
                </p>
                <p className="text-[1.1rem] font-medium uppercase tracking-[0.03em] text-foreground">
                  {item.value}
                </p>
                {item.detail ? (
                  <p className="text-[0.92rem] leading-6 text-muted-foreground">
                    {item.detail}
                  </p>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}
    </PtHubSectionCard>
  );
}

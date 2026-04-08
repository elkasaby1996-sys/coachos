import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Sparkles,
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { EmptyState } from "../../../components/ui/coachos/empty-state";
import { Skeleton } from "../../../components/ui/coachos/skeleton";
import { Button } from "../../../components/ui/button";
import { cn } from "../../../lib/utils";
import { useWorkspace } from "../../../lib/use-workspace";
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

function getActionToneBadgeClassName(tone: PtHubOverviewActionItem["tone"]) {
  switch (tone) {
    case "danger":
      return "border-danger/30 bg-danger/12 text-danger";
    case "warning":
      return "border-warning/30 bg-warning/12 text-warning";
    case "success":
      return "border-success/30 bg-success/12 text-success";
    default:
      return "border-primary/24 bg-primary/10 text-primary";
  }
}

function getSummaryToneStyles(tone: PtHubOverviewSummaryItem["tone"]) {
  switch (tone) {
    case "danger":
      return {
        label: "border-danger/30 bg-danger/12 text-danger",
        value: "text-[oklch(var(--danger)/0.96)]",
        detail: "text-[oklch(var(--danger)/0.8)]",
      };
    case "warning":
      return {
        label: "border-warning/30 bg-warning/12 text-warning",
        value: "text-[oklch(var(--warning)/0.98)]",
        detail: "text-[oklch(var(--warning)/0.82)]",
      };
    case "success":
      return {
        label: "border-success/30 bg-success/12 text-success",
        value: "text-[oklch(var(--success)/0.96)]",
        detail: "text-[oklch(var(--success)/0.8)]",
      };
    case "info":
      return {
        label: "border-primary/24 bg-primary/10 text-primary",
        value: "text-primary",
        detail: "text-muted-foreground",
      };
    default:
      return {
        label: "border-border/60 bg-background/24 text-muted-foreground",
        value: "text-foreground",
        detail: "text-muted-foreground",
      };
  }
}

export function PtHubOverviewLoadingState() {
  return (
    <section className="space-y-7" aria-label="Loading overview dashboard">
      <div className="grid gap-4 xl:grid-cols-5">
        {Array.from({ length: 5 }).map((_, index) => (
          <div
            key={`metric-skeleton-${index}`}
            className="surface-panel relative overflow-hidden rounded-[30px] border border-border/70 px-5 py-5 shadow-[var(--surface-shadow)] backdrop-blur-xl sm:px-6"
          >
            <Skeleton className="h-3 w-28" />
            <Skeleton className="mt-6 h-10 w-24 rounded-xl" />
            <Skeleton className="mt-3 h-4 w-36" />
          </div>
        ))}
      </div>

      <div className="surface-panel-strong rounded-[34px] border border-border/70 px-5 py-5 shadow-[var(--surface-strong-shadow)] backdrop-blur-xl sm:px-6 sm:py-6">
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

      <div className="grid gap-6 xl:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <div
            key={`panel-skeleton-${index}`}
            className="surface-panel rounded-[30px] border border-border/70 px-5 py-5 shadow-[var(--surface-shadow)] backdrop-blur-xl sm:px-6"
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

      <div className="grid gap-6">
        <div className="surface-panel rounded-[30px] border border-border/70 px-5 py-5 shadow-[var(--surface-shadow)] backdrop-blur-xl sm:px-6">
          <div className="space-y-4">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-8 w-44 rounded-xl" />
            {Array.from({ length: 3 }).map((_, index) => (
              <Skeleton
                key={`bottom-skeleton-${index}`}
                className="h-20 w-full rounded-[24px]"
              />
            ))}
          </div>
        </div>
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
  const navigate = useNavigate();
  const { switchWorkspace } = useWorkspace();
  const helperText =
    mode === "activation"
      ? "Live priorities across setup, lead flow, and every coaching workspace."
      : "Live priorities across the PT Hub, client delivery, and every coaching workspace.";

  const handleActionClick = (item: PtHubOverviewActionItem) => {
    if (item.workspaceId) {
      switchWorkspace(item.workspaceId);
    }
    navigate(item.href);
  };

  return (
    <div className="surface-panel-strong relative overflow-hidden rounded-[34px] border border-border/70 px-5 py-5 shadow-[var(--surface-strong-shadow)] backdrop-blur-xl sm:px-6 sm:py-6">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,oklch(var(--accent)/0.18),transparent_32%),radial-gradient(circle_at_bottom_left,oklch(var(--chart-3)/0.1),transparent_28%),linear-gradient(180deg,oklch(var(--bg-surface-elevated)/0.18),transparent_46%,oklch(var(--bg-surface)/0.12))]" />
      <div className="pointer-events-none absolute inset-x-6 top-0 h-px bg-[linear-gradient(90deg,transparent,oklch(var(--border-strong)/0.34),transparent)]" />

      <div className="relative space-y-4">
        <div className="space-y-2">
          <p className="pt-hub-kicker">Action center</p>
          <h2 className="text-balance text-[2.05rem] font-semibold uppercase tracking-[0.06em] text-foreground sm:text-[2.55rem]">
            Everything that needs attention.
          </h2>
          <p className="pt-hub-meta-text max-w-3xl text-[0.95rem] leading-6">
            {helperText}
          </p>
        </div>

        {items.length > 0 ? (
          <div className="-mx-1 divide-y divide-border/60">
            {items.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => handleActionClick(item)}
                className="pt-hub-interactive group grid gap-4 rounded-[24px] border border-transparent bg-transparent px-4 py-4 first:pt-1 sm:px-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center hover:bg-background/20"
              >
                <div className="min-w-0 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-[1rem] font-medium uppercase tracking-[0.04em] text-foreground">
                      {item.label}
                    </p>
                    <span
                      className={cn(
                        "inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.2em]",
                        getActionToneBadgeClassName(item.tone),
                      )}
                    >
                      {item.badge}
                    </span>
                  </div>
                  <p className="pt-hub-meta-text max-w-4xl text-[0.95rem] leading-6">
                    {item.description}
                  </p>
                </div>
                <span className="inline-flex shrink-0 items-center justify-between gap-2 px-0 text-sm font-medium text-primary transition-colors group-hover:text-foreground">
                  {item.ctaLabel}
                  <ArrowRight className="h-4 w-4 [stroke-width:1.7]" />
                </span>
              </button>
            ))}
          </div>
        ) : (
          <div className="rounded-[28px] border border-primary/18 bg-primary/8 px-5 py-6">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-primary [stroke-width:1.7]" />
              <div>
                <p className="text-[1rem] font-medium uppercase tracking-[0.04em] text-foreground">
                  Nothing urgent right now
                </p>
                <p className="pt-hub-meta-text mt-2 max-w-3xl text-[0.95rem] leading-6">
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
                  <p className="pt-hub-meta-text mt-2 text-[0.95rem] leading-6">
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
          description="Lead movement, client activity, and workspace changes will surface here once the business starts moving."
          icon={<Sparkles className="h-5 w-5 [stroke-width:1.7]" />}
          action={
            <Button asChild variant="secondary">
              <Link to="/pt-hub/workspaces">Open coaching spaces</Link>
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
  title = "Launch checklist",
  description,
}: {
  items: PtHubOverviewChecklistItem[];
  completionPercent: number;
  title?: string;
  description?: string;
}) {
  return (
    <PtHubSectionCard title={title} description={description}>
      <div className="space-y-4">
        <div className="rounded-[20px] border border-border/55 bg-background/24 px-4 py-4 backdrop-blur-xl">
          <div className="flex items-center justify-between gap-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            <span>Completion</span>
            <span>{completionPercent}%</span>
          </div>
          <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-muted/70">
            <div
              className="h-full rounded-full bg-[linear-gradient(90deg,oklch(var(--accent)),oklch(var(--chart-3)),oklch(var(--primary)/0.78))] transition-[width]"
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
                <CheckCircle2
                  className={cn(
                    "mt-0.5 h-5 w-5 shrink-0 [stroke-width:1.7]",
                    item.complete ? "text-success" : "text-primary opacity-55",
                  )}
                />
                <div className="min-w-0">
                  <p className="text-sm font-medium uppercase tracking-[0.04em] text-foreground">
                    {item.label}
                  </p>
                  <p className="pt-hub-meta-text mt-2 text-[0.95rem] leading-6">
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
  title = "Quick actions",
  description,
}: {
  actions: PtHubOverviewQuickAction[];
  title?: string;
  description?: string;
}) {
  return (
    <PtHubSectionCard title={title} description={description}>
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
              <p className="pt-hub-meta-text mt-1 text-[0.95rem] leading-6">
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
          {items.map((item) =>
            (() => {
              const toneStyles = getSummaryToneStyles(item.tone);

              return (
                <div
                  key={item.id}
                  className="pt-hub-interactive rounded-[22px] border border-transparent bg-transparent px-4 py-4 hover:bg-background/18"
                >
                  <div className="min-w-0 space-y-2">
                    <p
                      className={cn(
                        "inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.2em]",
                        toneStyles.label,
                      )}
                    >
                      {item.label}
                    </p>
                    <p
                      className={cn(
                        "text-[1.1rem] font-medium uppercase tracking-[0.03em]",
                        toneStyles.value,
                      )}
                    >
                      {item.value}
                    </p>
                    {item.detail ? (
                      <p
                        className={cn(
                          "text-[0.92rem] leading-6",
                          toneStyles.detail,
                        )}
                      >
                        {item.detail}
                      </p>
                    ) : null}
                  </div>
                </div>
              );
            })(),
          )}
        </div>
      )}
    </PtHubSectionCard>
  );
}

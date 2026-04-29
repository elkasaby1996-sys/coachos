import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Sparkles,
} from "lucide-react";
import type { ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { EmptyState } from "../../../components/ui/coachos/empty-state";
import { Skeleton } from "../../../components/ui/coachos/skeleton";
import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import { NotificationItem } from "../../notifications/components/notification-item";
import type { NotificationRecord } from "../../notifications/lib/types";
import type { ModuleTone } from "../../../lib/module-tone";
import {
  getSemanticBadgeVariant,
  getSemanticToneClasses,
  type SemanticTone,
} from "../../../lib/semantic-status";
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
  tone: SemanticTone;
}

function PtHubActionCenterRow({
  item,
  onClick,
}: {
  item: PtHubOverviewActionItem;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="pt-hub-interactive group relative grid gap-4 rounded-[24px] border border-border/55 bg-background/18 px-4 py-4 text-left shadow-[inset_0_1px_0_oklch(1_0_0/0.03)] transition-[background-color,border-color,box-shadow,transform] duration-200 hover:border-border/75 hover:bg-background/28 hover:shadow-[0_18px_40px_-32px_oklch(0_0_0/0.65)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:px-5 md:grid-cols-[minmax(0,1fr)_auto] md:items-start md:gap-x-6"
    >
      <span
        aria-hidden
        className={cn(
          "absolute bottom-4 left-1.5 top-4 w-[2px] rounded-full",
          getSemanticToneClasses(item.tone).marker,
        )}
      />
      <div className="min-w-0 space-y-2 pl-2">
        <p className="text-[0.96rem] font-medium uppercase tracking-[0.04em] text-foreground">
          {item.label}
        </p>
        <p className="pt-hub-meta-text max-w-4xl text-[0.93rem] leading-6 text-muted-foreground">
          {item.description}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-3 pl-2 md:min-w-[11.5rem] md:flex-col md:items-end md:justify-center md:pl-0">
        <Badge
          variant={getSemanticBadgeVariant(item.tone)}
          className="h-7 px-2.5 py-0 text-[10px] tracking-[0.18em]"
        >
          {item.badge}
        </Badge>
        <span className="inline-flex items-center gap-2 text-sm font-medium text-primary transition-colors group-hover:text-foreground group-focus-visible:text-foreground">
          {item.ctaLabel}
          <ArrowRight className="h-4 w-4 [stroke-width:1.7]" />
        </span>
      </div>
    </button>
  );
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
      <div className="pt-hub-action-center-overlay pointer-events-none absolute inset-0" />
      <div className="pointer-events-none absolute inset-x-6 top-0 h-px bg-[linear-gradient(90deg,transparent,oklch(var(--border-strong)/0.34),transparent)]" />

      <div className="relative space-y-5">
        <div className="space-y-2.5">
          <p className="pt-hub-kicker">Action center</p>
          <h2 className="max-w-3xl text-balance text-[1.55rem] font-semibold uppercase tracking-[0.055em] text-foreground sm:text-[1.9rem]">
            Everything that needs attention.
          </h2>
          <p className="pt-hub-meta-text max-w-3xl text-[0.95rem] leading-6 text-muted-foreground">
            {helperText}
          </p>
        </div>

        {items.length > 0 ? (
          <div
            className="space-y-3"
            role="list"
            aria-label="Action center items"
          >
            {items.map((item) => (
              <PtHubActionCenterRow
                key={item.id}
                item={item}
                onClick={() => handleActionClick(item)}
              />
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
  notifications,
  unreadCount,
  isLoading = false,
  errorMessage,
  onOpenNotification,
  module,
}: {
  notifications: NotificationRecord[];
  unreadCount: number;
  isLoading?: boolean;
  errorMessage?: string | null;
  onOpenNotification: (notification: NotificationRecord) => void;
  module?: ModuleTone;
}) {
  return (
    <PtHubSectionCard
      title="Recent activity"
      module={module}
      className="h-full"
    >
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton
              key={`overview-notification-skeleton-${index}`}
              className="h-24 rounded-[22px] border border-border/60"
            />
          ))}
        </div>
      ) : notifications.length > 0 ? (
        <div className="-mx-1 divide-y divide-border/60">
          {notifications.map((notification) => (
            <NotificationItem
              key={notification.id}
              notification={notification}
              audience="pt"
              compact
              className="rounded-[22px] border-transparent bg-transparent px-4 py-4 shadow-none hover:border-transparent hover:bg-background/18"
              onClick={() => onOpenNotification(notification)}
            />
          ))}
        </div>
      ) : errorMessage ? (
        <EmptyState
          title="Notifications are unavailable"
          description={errorMessage}
          icon={<Sparkles className="h-5 w-5 [stroke-width:1.7]" />}
          className="rounded-[26px] border-border/70 bg-background/34"
        />
      ) : (
        <EmptyState
          title="No notifications yet"
          description="Client, check-in, message, and workspace updates from every coaching space will appear here."
          icon={<Sparkles className="h-5 w-5 [stroke-width:1.7]" />}
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
  actions,
  collapsed = false,
  module,
}: {
  items: PtHubOverviewChecklistItem[];
  completionPercent: number;
  title?: string;
  description?: string;
  actions?: ReactNode;
  collapsed?: boolean;
  module?: ModuleTone;
}) {
  return (
    <PtHubSectionCard
      title={title}
      description={description}
      actions={actions}
      module={module}
      className="h-full"
      contentClassName={collapsed ? "hidden" : undefined}
    >
      {!collapsed ? (
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
                      item.complete
                        ? "text-success"
                        : "text-primary opacity-55",
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
      ) : null}
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
  actions,
  collapsed = false,
  module,
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
  actions?: ReactNode;
  collapsed?: boolean;
  module?: ModuleTone;
}) {
  const navigate = useNavigate();
  const { switchWorkspace } = useWorkspace();

  const handleItemClick = (item: PtHubOverviewSummaryItem) => {
    if (!item.href) return;
    if (item.workspaceId) {
      switchWorkspace(item.workspaceId);
    }
    navigate(item.href);
  };

  return (
    <PtHubSectionCard
      title={title}
      description={description}
      actions={actions}
      module={module}
      className="h-full"
      contentClassName={collapsed ? "hidden" : undefined}
    >
      {!collapsed ? (
        emptyState && isEmpty ? (
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
                const toneStyles = getSemanticToneClasses(item.tone);
                const isInteractive = Boolean(item.href);

                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleItemClick(item)}
                    disabled={!isInteractive}
                    className={cn(
                      "pt-hub-interactive group w-full rounded-[22px] border border-transparent bg-transparent px-4 py-4 text-left",
                      isInteractive
                        ? "hover:bg-background/18"
                        : "cursor-default hover:bg-transparent",
                    )}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <span
                        aria-hidden
                        className={cn(
                          "mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full",
                          toneStyles.marker,
                        )}
                      />
                      <div className="min-w-0 flex-1 space-y-2">
                        <Badge
                          variant={getSemanticBadgeVariant(item.tone)}
                          className="px-2.5 py-1 text-[10px] tracking-[0.2em]"
                        >
                          {item.label}
                        </Badge>
                        <p className="text-[1.1rem] font-medium uppercase tracking-[0.03em] text-foreground">
                          {item.value}
                        </p>
                        {item.detail ? (
                          <p className="pt-hub-meta-text text-[0.92rem] leading-6">
                            {item.detail}
                          </p>
                        ) : null}
                      </div>
                      {isInteractive ? (
                        <span className="inline-flex shrink-0 items-center gap-2 text-sm font-medium text-primary transition-colors group-hover:text-foreground">
                          {item.ctaLabel ?? "Open"}
                          <ArrowRight className="h-4 w-4 [stroke-width:1.7]" />
                        </span>
                      ) : null}
                    </div>
                  </button>
                );
              })(),
            )}
          </div>
        )
      ) : null}
    </PtHubSectionCard>
  );
}

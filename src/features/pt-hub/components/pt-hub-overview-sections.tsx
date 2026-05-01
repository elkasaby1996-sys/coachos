import {
  AlertTriangle,
  ArrowRight,
  Bell,
  CheckCircle2,
  CircleAlert,
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
  PtHubOverviewMode,
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

function getToneIcon(tone: SemanticTone | null | undefined) {
  if (tone === "danger" || tone === "warning") return CircleAlert;
  if (tone === "success") return CheckCircle2;
  return Sparkles;
}

export function PtHubModeStatusStrip({
  mode,
  label,
  description,
  setupCompletionPercent,
  clientsNeedingAttentionCount,
}: {
  mode: PtHubOverviewMode;
  label: string;
  description: string;
  setupCompletionPercent: number;
  clientsNeedingAttentionCount: number;
}) {
  const isActivation = mode === "activation";

  return (
    <div className="surface-panel pt-hub-status-strip relative overflow-hidden rounded-[28px] border border-border/70 px-5 py-4 shadow-[var(--surface-shadow)] sm:px-6">
      <div className="relative flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2.5">
            <Badge
              variant={isActivation ? "warning" : "success"}
              className="h-7 px-2.5 text-[11px] normal-case tracking-[0.01em]"
            >
              {label}
            </Badge>
            <span className="pt-hub-meta-text text-sm font-medium">
              {isActivation
                ? `${setupCompletionPercent}% setup complete`
                : `${clientsNeedingAttentionCount} client${clientsNeedingAttentionCount === 1 ? "" : "s"} need attention`}
            </span>
          </div>
          <p className="max-w-4xl text-[0.96rem] leading-6 text-foreground">
            {description}
          </p>
        </div>
        <div className="grid min-w-[min(100%,24rem)] grid-cols-2 gap-2 sm:min-w-[25rem]">
          <div className="pt-hub-status-metric rounded-[18px] border border-border/60 bg-background/38 px-3.5 py-3">
            <p className="text-[0.76rem] font-semibold text-muted-foreground">
              Setup progress
            </p>
            <p className="mt-1 text-lg font-semibold tabular-nums text-foreground">
              {setupCompletionPercent}%
            </p>
          </div>
          <div className="pt-hub-status-metric rounded-[18px] border border-border/60 bg-background/38 px-3.5 py-3">
            <p className="text-[0.76rem] font-semibold text-muted-foreground">
              Client attention
            </p>
            <p className="mt-1 text-lg font-semibold tabular-nums text-foreground">
              {clientsNeedingAttentionCount}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function PtHubActionCenterRow({
  item,
  onClick,
}: {
  item: PtHubOverviewActionItem;
  onClick: () => void;
}) {
  const toneStyles = getSemanticToneClasses(item.tone);
  const StatusIcon = getToneIcon(item.tone);

  return (
    <button
      type="button"
      onClick={onClick}
      className="pt-hub-interactive pt-hub-priority-row group relative grid gap-4 rounded-[24px] border border-border/60 bg-background/34 px-4 py-4 text-left shadow-[inset_0_1px_0_oklch(1_0_0/0.035)] transition-[background-color,border-color,box-shadow] duration-200 hover:border-border/80 hover:bg-background/52 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:px-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start lg:gap-x-6"
    >
      <div className="min-w-0 flex gap-3">
        <span
          className={cn(
            "pt-hub-priority-icon mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border",
            toneStyles.surface,
          )}
          aria-hidden
        >
          <StatusIcon className="h-4 w-4 [stroke-width:1.8]" />
        </span>
        <div className="min-w-0 space-y-2">
          <p className="text-[0.98rem] font-semibold leading-5 text-foreground">
            {item.label}
          </p>
          <p className="pt-hub-meta-text max-w-4xl text-[0.93rem] leading-6">
            {item.description}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3 pl-12 lg:min-w-[11.5rem] lg:flex-col lg:items-end lg:justify-center lg:pl-0">
        <Badge
          variant={getSemanticBadgeVariant(item.tone)}
          className="h-7 px-2.5 py-0 text-[11px] normal-case tracking-[0.01em]"
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
    <section
      className="pt-hub-page-stack"
      data-density="roomy"
      aria-label="Loading overview dashboard"
    >
      <div className="pt-hub-kpi-grid" data-columns="5">
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

      <div className="pt-hub-secondary-grid grid xl:grid-cols-3">
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

      <div className="pt-hub-work-grid">
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
    <section className="pt-hub-page-stack">
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
      ? "Setup blockers, lead flow, and workspace readiness in one list."
      : "Lead, client, and delivery decisions that need the next coach action.";

  const handleActionClick = (item: PtHubOverviewActionItem) => {
    if (item.workspaceId) {
      switchWorkspace(item.workspaceId);
    }
    navigate(item.href);
  };

  return (
    <div className="surface-panel-strong pt-hub-priority-panel relative overflow-hidden rounded-[34px] border border-border/70 px-5 py-5 shadow-[var(--surface-strong-shadow)] backdrop-blur-xl sm:px-6 sm:py-6">
      <div className="pt-hub-action-center-overlay pointer-events-none absolute inset-0" />
      <div className="pointer-events-none absolute inset-x-6 top-0 h-px bg-[linear-gradient(90deg,transparent,oklch(var(--border-strong)/0.34),transparent)]" />

      <div className="relative space-y-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-2.5">
            <p className="pt-hub-kicker">Action center</p>
            <h2 className="max-w-3xl text-balance text-[1.55rem] font-semibold tracking-[0.005em] text-foreground sm:text-[1.85rem]">
              Priorities
            </h2>
            <p className="pt-hub-meta-text max-w-3xl text-[0.95rem] leading-6 text-muted-foreground">
              {helperText}
            </p>
          </div>
          <Badge
            variant={items.length > 0 ? "warning" : "success"}
            className="h-8 w-fit px-3 text-[11px] normal-case tracking-[0.01em]"
          >
            {items.length > 0
              ? `${items.length} open ${items.length === 1 ? "item" : "items"}`
              : "Clear"}
          </Badge>
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
                <p className="text-[1rem] font-semibold text-foreground">
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
      className="pt-hub-activity-rail h-full"
      actions={
        <>
          {unreadCount > 0 ? (
            <Badge
              variant="info"
              className="h-8 px-3 text-[11px] normal-case tracking-[0.01em]"
            >
              <Bell className="h-3.5 w-3.5 [stroke-width:1.8]" />
              {unreadCount} unread
            </Badge>
          ) : null}
          <Button asChild variant="ghost" size="sm">
            <Link to="/pt/notifications">View all</Link>
          </Button>
        </>
      }
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
            <div className="flex items-center justify-between gap-3 text-[12px] font-semibold text-muted-foreground">
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
                    <p className="text-sm font-semibold text-foreground">
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
    <PtHubSectionCard
      title={title}
      description={description}
      className="pt-hub-command-launcher"
    >
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {actions.map((action) => (
          <Link
            key={action.id}
            to={action.href}
            className="pt-hub-command-link pt-hub-interactive group flex min-h-[5.9rem] items-start gap-3 rounded-[20px] border border-border/55 bg-background/24 px-4 py-4 hover:bg-background/42 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-foreground">
                {action.label}
              </p>
              <p className="pt-hub-meta-text mt-1 text-[0.95rem] leading-6">
                {action.description}
              </p>
            </div>
            <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 group-hover:translate-x-1 group-hover:text-primary" />
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
                const content = (
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                    <span
                      aria-hidden
                      className={cn(
                        "hidden h-2.5 w-2.5 shrink-0 rounded-full sm:mt-1.5 sm:block",
                        toneStyles.marker,
                      )}
                    />
                    <div className="min-w-0 flex-1 space-y-2">
                      <Badge
                        variant={getSemanticBadgeVariant(item.tone)}
                        className="px-2.5 py-1 text-[11px] normal-case tracking-[0.01em]"
                      >
                        {item.label}
                      </Badge>
                      <p className="text-[1.05rem] font-semibold leading-6 text-foreground">
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
                );

                if (!isInteractive) {
                  return (
                    <div
                      key={item.id}
                      className="w-full rounded-[22px] border border-transparent bg-transparent px-4 py-4 text-left"
                    >
                      {content}
                    </div>
                  );
                }

                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleItemClick(item)}
                    className="pt-hub-interactive group w-full rounded-[22px] border border-transparent bg-transparent px-4 py-4 text-left hover:bg-background/18 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    {content}
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

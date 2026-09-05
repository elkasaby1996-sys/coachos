import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  CircleAlert,
  CircleDashed,
  Globe2,
  Sparkles,
  UserPlus,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { EmptyState } from "../../../components/ui/coachos/empty-state";
import { Skeleton } from "../../../components/ui/coachos/skeleton";
import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import { InviteClientDialog } from "../../../components/pt/invite-client-dialog";
import { NotificationItem } from "../../notifications/components/notification-item";
import type { NotificationRecord } from "../../notifications/lib/types";
import type { ModuleTone } from "../../../lib/module-tone";
import { formatRelativeTime } from "../../../lib/relative-time";
import {
  getSemanticBadgeVariant,
  getSemanticToneClasses,
  type SemanticTone,
} from "../../../lib/semantic-status";
import { cn } from "../../../lib/utils";
import { useWorkspace } from "../../../lib/use-workspace";
import { shouldShowPtHubActivationChecklist } from "../lib/overview-dashboard";
import type {
  PtHubOverviewMode,
  PtHubOverviewActionItem,
  PtHubActivationChecklistModel,
  PtHubActivationChecklistItem,
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

function getActivationStatusLabel(item: PtHubActivationChecklistItem) {
  if (item.status === "complete") return "Complete";
  if (item.status === "next") return "Next recommended";
  if (item.optional) return "Optional";
  return "Incomplete";
}

function getActivationStatusTone(item: PtHubActivationChecklistItem) {
  if (item.status === "complete") return "success" as const;
  if (item.status === "next") return "warning" as const;
  if (item.optional) return "info" as const;
  return "muted" as const;
}

function ActivationChecklistIcon({
  item,
}: {
  item: PtHubActivationChecklistItem;
}) {
  if (item.status === "complete") {
    return <CheckCircle2 className="h-4 w-4 text-success [stroke-width:1.8]" />;
  }
  if (item.status === "next") {
    return <CircleAlert className="h-4 w-4 text-warning [stroke-width:1.8]" />;
  }
  return (
    <CircleDashed className="h-4 w-4 text-muted-foreground [stroke-width:1.8]" />
  );
}

export function PtHubActivationChecklist({
  checklist,
  profileItems = [],
  isLoading = false,
  hasError = false,
}: {
  checklist: PtHubActivationChecklistModel | null;
  profileItems?: PtHubOverviewChecklistItem[];
  isLoading?: boolean;
  hasError?: boolean;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showAllProfileItems, setShowAllProfileItems] = useState(false);
  const checklistRowsId = "pt-hub-activation-checklist-rows";
  const missingProfileItems = profileItems.filter((item) => !item.complete);
  const activeChecklist = shouldShowPtHubActivationChecklist(checklist)
    ? checklist
    : null;

  if (isLoading && !checklist && missingProfileItems.length === 0) {
    return (
      <div className="ui-panel pt-hub-setup-panel border border-border/55 px-4 py-4 sm:px-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-2">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-5 w-56 rounded-xl" />
          </div>
          <Skeleton className="h-8 w-32 rounded-full" />
        </div>
        <div className="mt-4 grid gap-2 lg:grid-cols-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-16 rounded-[18px]" />
          ))}
        </div>
      </div>
    );
  }

  if (hasError && !checklist && missingProfileItems.length === 0) {
    return (
      <div className="pt-hub-setup-panel rounded-[20px] border border-warning/24 bg-warning/10 px-4 py-3">
        <p className="text-sm font-semibold text-foreground">
          Coach setup unavailable
        </p>
        <p className="pt-hub-meta-text mt-1 text-[0.88rem] leading-5">
          The Action Center is still available. Refresh if you want to reload
          setup progress.
        </p>
      </div>
    );
  }

  if (!activeChecklist && missingProfileItems.length === 0) return null;

  const visibleItems = activeChecklist?.items ?? [];
  const summary = activeChecklist
    ? `${activeChecklist.coreCompletedCount} of ${activeChecklist.coreTotalCount} setup steps complete`
    : isLoading
      ? "Checking setup progress…"
      : hasError
        ? "Setup progress unavailable. You can still update your profile."
        : `${missingProfileItems.length} profile items remaining`;
  const progressPercent =
    activeChecklist && activeChecklist.coreTotalCount > 0
      ? Math.round(
          (activeChecklist.coreCompletedCount /
            activeChecklist.coreTotalCount) *
            100,
        )
      : 0;
  const firstClientGuidance =
    activeChecklist?.nextItem?.id === "first-client"
      ? activeChecklist.firstClientGuidance
      : null;
  const nextItem = activeChecklist?.nextItem ?? {
    id: "profile",
    title: "Complete marketplace profile",
    description:
      "Add the profile essentials clients need to understand your coaching.",
    href: "/pt-hub/profile",
    ctaLabel: "Complete profile",
  };

  return (
    <section
      className="pt-hub-setup-panel pt-hub-activation-panel surface-panel rounded-[20px] border border-border/60 p-5"
      aria-label="Coach setup"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-lg font-semibold text-foreground">Coach setup</h3>
          <p className="pt-hub-meta-text mt-1 text-sm">{summary}</p>
        </div>
        {activeChecklist ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-expanded={isExpanded}
            aria-controls={checklistRowsId}
            onClick={() => setIsExpanded((current) => !current)}
            className="w-fit"
          >
            {isExpanded ? "Collapse checklist" : "View full checklist"}
            {isExpanded ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </Button>
        ) : null}
      </div>

      {activeChecklist ? (
        <div
          className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted/55"
          role="progressbar"
          aria-label="Coach setup completion"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progressPercent}
        >
          <div
            className="h-full rounded-full bg-primary/70 transition-[width]"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      ) : null}

      <div className="pt-hub-setup-content">
        <div>
          {nextItem && !firstClientGuidance ? (
            <div className="mt-4 border-t border-border/55 pt-4">
              <div className="grid gap-3">
                <div className="min-w-0">
                  <p className="pt-hub-minor-label text-warning">
                    Next recommended
                  </p>
                  <p className="mt-1 text-sm font-semibold text-foreground">
                    {nextItem.title}
                  </p>
                  <p className="pt-hub-meta-text mt-1 text-[0.84rem] leading-5">
                    {nextItem.description}
                  </p>
                </div>
                <Button asChild size="sm" className="w-fit">
                  <Link to={nextItem.href}>
                    {nextItem.ctaLabel}
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
              </div>
            </div>
          ) : null}

          {firstClientGuidance ? (
            <div className="mt-4 rounded-[var(--ui-radius-card)] border border-primary/20 bg-primary/8 px-4 py-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="pt-hub-minor-label text-primary">
                    Next recommended
                  </p>
                  <p className="text-sm font-semibold text-foreground">
                    Choose how to add your first client
                  </p>
                  <p className="pt-hub-meta-text mt-1 max-w-2xl text-[0.88rem] leading-5">
                    Direct invite is the fastest path if you already coach
                    someone. Public applications stay available when you want
                    inbound leads.
                  </p>
                </div>
              </div>

              <div className="mt-3 grid gap-2 lg:grid-cols-2">
                <div className="ui-panel border border-border/55 px-3.5 py-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-success/22 bg-success/10 text-success">
                      <UserPlus className="h-4 w-4 [stroke-width:1.8]" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground">
                        {firstClientGuidance.invite.title}
                      </p>
                      <p className="pt-hub-meta-text mt-1 text-[0.82rem] leading-5">
                        {firstClientGuidance.invite.description}
                      </p>
                      <InviteClientDialog
                        trigger={
                          <Button type="button" size="sm" className="mt-3">
                            {firstClientGuidance.invite.ctaLabel}
                          </Button>
                        }
                      />
                    </div>
                  </div>
                </div>

                <div className="ui-panel border border-border/55 px-3.5 py-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-primary/22 bg-primary/10 text-primary">
                      <Globe2 className="h-4 w-4 [stroke-width:1.8]" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground">
                        {firstClientGuidance.applications.title}
                      </p>
                      <p className="pt-hub-meta-text mt-1 text-[0.82rem] leading-5">
                        {firstClientGuidance.applications.description}
                      </p>
                      <Button
                        asChild
                        variant="secondary"
                        size="sm"
                        className="mt-3"
                      >
                        <Link to={firstClientGuidance.applications.href}>
                          {firstClientGuidance.applications.ctaLabel}
                        </Link>
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </div>
        {missingProfileItems.length > 0 ? (
          <section
            className="mt-4 border-t border-border/55 pt-4"
            aria-label="Profile essentials"
          >
            <div className="flex items-center justify-between gap-3">
              <h4 className="text-sm font-semibold text-foreground">
                Profile essentials
              </h4>
              <span className="pt-hub-meta-text text-xs">
                {missingProfileItems.length} remaining
              </span>
            </div>
            <ul
              id="pt-hub-profile-essentials"
              className="mt-2 divide-y divide-border/55"
            >
              {(showAllProfileItems
                ? missingProfileItems
                : missingProfileItems.slice(0, 3)
              ).map((item) => (
                <li key={item.id}>
                  <Link
                    to={item.href}
                    className="group flex min-h-11 items-center gap-3 rounded-sm py-2 text-sm transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <CircleDashed
                      className="h-4 w-4 shrink-0 text-muted-foreground"
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1 font-medium">
                      {item.label}
                    </span>
                    <ArrowRight
                      className="h-3.5 w-3.5 shrink-0 text-primary"
                      aria-hidden
                    />
                  </Link>
                </li>
              ))}
            </ul>
            {missingProfileItems.length > 3 ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="mt-2"
                aria-expanded={showAllProfileItems}
                aria-controls="pt-hub-profile-essentials"
                onClick={() => setShowAllProfileItems((current) => !current)}
              >
                {showAllProfileItems
                  ? "Show fewer profile items"
                  : `Show all ${missingProfileItems.length} profile items`}
                {showAllProfileItems ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </Button>
            ) : null}
          </section>
        ) : null}
      </div>

      {isExpanded && activeChecklist ? (
        <div
          id={checklistRowsId}
          className="mt-4 grid gap-2 lg:grid-cols-2"
          aria-label="Full activation checklist"
        >
          {visibleItems.map((item) => (
            <Link
              key={item.id}
              to={item.href}
              className={cn(
                "pt-hub-interactive group flex min-w-0 items-start gap-3 rounded-[16px] border px-3 py-2.5 transition-[background-color,border-color] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                item.status === "next"
                  ? "border-warning/35 bg-warning/10"
                  : "border-border/50 bg-background/22 hover:border-border/80 hover:bg-background/38",
              )}
            >
              <span className="mt-0.5 shrink-0">
                <ActivationChecklistIcon item={item} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-foreground">
                    {item.title}
                  </span>
                  <Badge
                    variant={getActivationStatusTone(item)}
                    className="h-5 px-2 text-[10px] normal-case tracking-normal"
                  >
                    {getActivationStatusLabel(item)}
                  </Badge>
                </span>
                <span className="pt-hub-meta-text mt-0.5 block text-[0.78rem] leading-5">
                  {item.description}
                </span>
              </span>
            </Link>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function PtHubActionCenterRow({
  item,
  onClick,
  variant = "default",
}: {
  item: PtHubOverviewActionItem;
  onClick: () => void;
  variant?: "default" | "primary" | "compact";
}) {
  const toneStyles = getSemanticToneClasses(item.tone);
  const StatusIcon = getToneIcon(item.tone);
  const isPrimary = variant === "primary";

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "pt-hub-interactive group flex w-full items-start gap-3 px-0 text-left transition-colors duration-200 hover:bg-background/28 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:px-1",
        isPrimary ? "py-4" : "py-3.5",
      )}
    >
      <span
        className={cn(
          "pt-hub-priority-icon mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border",
          toneStyles.surface,
          isPrimary && "h-9 w-9",
        )}
        aria-hidden
      >
        <StatusIcon
          className={cn(
            "h-3.5 w-3.5 [stroke-width:1.8]",
            isPrimary && "h-4 w-4",
          )}
        />
      </span>
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            "block font-semibold text-foreground",
            isPrimary ? "text-[1.08rem] leading-6" : "text-[0.98rem] leading-5",
          )}
        >
          {item.label}
        </span>
        {isPrimary ? (
          <span className="pt-hub-meta-text mt-1 block max-w-3xl text-[0.9rem] leading-5">
            {item.description}
          </span>
        ) : null}
      </span>
      <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-primary transition-colors [stroke-width:1.7] group-hover:text-foreground group-focus-visible:text-foreground" />
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
            className="surface-panel relative overflow-hidden rounded-[var(--ui-radius-card)] border border-border/70 px-5 py-5 shadow-[var(--surface-shadow)] backdrop-blur-xl sm:px-6"
          >
            <Skeleton className="h-3 w-28" />
            <Skeleton className="mt-6 h-10 w-24 rounded-xl" />
            <Skeleton className="mt-3 h-4 w-36" />
          </div>
        ))}
      </div>

      <div className="surface-panel-strong rounded-[var(--ui-radius-card)] border border-border/70 px-5 py-5 shadow-[var(--surface-strong-shadow)] backdrop-blur-xl sm:px-6 sm:py-6">
        <div className="space-y-4">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-10 w-72 rounded-2xl" />
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton
                key={`action-skeleton-${index}`}
                className="h-24 w-full rounded-[var(--ui-radius-card)]"
              />
            ))}
          </div>
        </div>
      </div>

      <div className="pt-hub-secondary-grid grid xl:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <div
            key={`panel-skeleton-${index}`}
            className="surface-panel rounded-[var(--ui-radius-card)] border border-border/70 px-5 py-5 shadow-[var(--surface-shadow)] backdrop-blur-xl sm:px-6"
          >
            <Skeleton className="h-4 w-32" />
            <div className="mt-5 space-y-3">
              {Array.from({ length: 4 }).map((_, rowIndex) => (
                <Skeleton
                  key={`panel-skeleton-${index}-${rowIndex}`}
                  className="h-16 w-full rounded-[var(--ui-radius-card)]"
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="pt-hub-work-grid">
        <div className="surface-panel rounded-[var(--ui-radius-card)] border border-border/70 px-5 py-5 shadow-[var(--surface-shadow)] backdrop-blur-xl sm:px-6">
          <div className="space-y-4">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-8 w-44 rounded-xl" />
            {Array.from({ length: 3 }).map((_, index) => (
              <Skeleton
                key={`bottom-skeleton-${index}`}
                className="h-20 w-full rounded-[var(--ui-radius-card)]"
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
          className="rounded-[var(--ui-radius-card)] border-border/70 bg-background/34"
        />
      </PtHubSectionCard>
    </section>
  );
}

export function PtHubActionCenter({
  items,
}: {
  items: PtHubOverviewActionItem[];
}) {
  const navigate = useNavigate();
  const { switchWorkspace } = useWorkspace();
  const [primaryItem, ...secondaryItems] = items;

  const handleActionClick = (item: PtHubOverviewActionItem) => {
    if (item.workspaceId) {
      switchWorkspace(item.workspaceId);
    }
    navigate(item.href);
  };

  return (
    <div className="surface-panel-strong pt-hub-priority-panel pt-hub-surface-hero relative overflow-hidden rounded-[20px] border border-border/70 p-5 backdrop-blur-xl sm:p-6">
      <div className="pointer-events-none absolute inset-x-6 top-0 h-px bg-[linear-gradient(90deg,transparent,oklch(var(--border-strong)/0.34),transparent)]" />

      <div className="relative space-y-4">
        <h2 className="max-w-3xl text-balance text-[1.55rem] font-semibold tracking-[0.005em] text-foreground">
          Command center
        </h2>

        {primaryItem ? (
          <div
            className="divide-y divide-border/60 border-y border-border/60"
            role="list"
            aria-label="Command center items"
          >
            <div role="listitem">
              <PtHubActionCenterRow
                item={primaryItem}
                onClick={() => handleActionClick(primaryItem)}
                variant="primary"
              />
            </div>

            {secondaryItems.map((item) => (
              <div key={item.id} role="listitem">
                <PtHubActionCenterRow
                  item={item}
                  onClick={() => handleActionClick(item)}
                  variant="compact"
                />
              </div>
            ))}
          </div>
        ) : (
          <div className="pt-hub-command-clear-state rounded-[var(--ui-radius-card)] border border-primary/18 bg-primary/8 px-5 py-6">
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-primary/24 bg-primary/10 text-primary">
                  <CheckCircle2 className="h-5 w-5 [stroke-width:1.7]" />
                </span>
                <div>
                  <p className="text-[1.05rem] font-semibold text-foreground">
                    Pipeline is clear
                  </p>
                  <p className="pt-hub-meta-text mt-2 max-w-3xl text-[0.95rem] leading-6">
                    No urgent coach decisions are waiting. Use the calm moment
                    to review lead flow or tighten the public storefront.
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 lg:justify-end">
                <Button asChild variant="secondary" size="sm">
                  <Link to="/pt-hub/leads">Review leads</Link>
                </Button>
                <Button asChild variant="ghost" size="sm">
                  <Link to="/pt-hub/profile">Polish profile</Link>
                </Button>
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
  const latestNotification = notifications[0] ?? null;
  const latestLabel = latestNotification
    ? formatRelativeTime(latestNotification.created_at)
    : null;
  const unreadNotifications = notifications.filter(
    (notification) => !notification.is_read,
  );
  const readNotifications = notifications.filter(
    (notification) => notification.is_read,
  );
  const headerSummary = isLoading
    ? "Checking for new activity."
    : errorMessage
      ? "Activity status unavailable."
      : unreadCount > 0
        ? `${unreadCount} unread${latestLabel ? `, latest ${latestLabel}` : ""}`
        : latestLabel
          ? `All clear, latest ${latestLabel}`
          : "All clear, no recent updates.";

  const renderNotification = (notification: NotificationRecord) => (
    <NotificationItem
      key={notification.id}
      notification={notification}
      audience="pt"
      compact
      className="pt-hub-overview-notification rounded-xl border-transparent bg-transparent px-0 py-3 shadow-none hover:border-transparent hover:bg-background/18"
      onClick={() => onOpenNotification(notification)}
    />
  );

  return (
    <PtHubSectionCard
      title="Recent activity"
      description={headerSummary}
      module={module}
      className="pt-hub-activity-rail pt-hub-surface-quiet h-full"
      headerClassName="pt-hub-overview-activity-header"
      actions={
        <Button asChild variant="ghost" size="sm">
          <Link to="/pt/notifications">View all</Link>
        </Button>
      }
    >
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton
              key={`overview-notification-skeleton-${index}`}
              className="h-24 rounded-[var(--ui-radius-card)] border border-border/60"
            />
          ))}
        </div>
      ) : notifications.length > 0 ? (
        <div className="-mx-1 space-y-4">
          {unreadNotifications.length > 0 ? (
            <div className="space-y-1">
              <div className="flex items-center justify-between gap-3 px-4">
                <p className="pt-hub-minor-label pt-hub-minor-label-strong">
                  Unread
                </p>
                <span className="pt-hub-meta-text text-xs">
                  {unreadNotifications.length} new
                </span>
              </div>
              <div className="divide-y divide-border/60">
                {unreadNotifications.map(renderNotification)}
              </div>
            </div>
          ) : null}
          {readNotifications.length > 0 ? (
            <div className="space-y-1">
              <div className="flex items-center justify-between gap-3 px-4">
                <p className="pt-hub-minor-label">
                  {unreadNotifications.length > 0 ? "Earlier" : "Latest"}
                </p>
                {latestLabel ? (
                  <span className="pt-hub-meta-text text-xs">
                    Latest {latestLabel}
                  </span>
                ) : null}
              </div>
              <div className="divide-y divide-border/60">
                {readNotifications.map(renderNotification)}
              </div>
            </div>
          ) : null}
        </div>
      ) : errorMessage ? (
        <EmptyState
          title="Notifications are unavailable"
          description={errorMessage}
          icon={<Sparkles className="h-5 w-5 [stroke-width:1.7]" />}
          className="rounded-[var(--ui-radius-card)] border-border/70 bg-background/34"
        />
      ) : (
        <div className="ui-inset pt-hub-activity-clear border border-border/55 px-4 py-5">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-primary/20 bg-primary/8 text-primary">
              <CheckCircle2 className="h-[1.125rem] w-[1.125rem] [stroke-width:1.7]" />
            </span>
            <div>
              <p className="text-sm font-semibold text-foreground">
                Activity rail is quiet
              </p>
              <p className="pt-hub-meta-text mt-1.5 text-[0.9rem] leading-6">
                Client, check-in, message, and workspace updates will appear
                here when something needs a look.
              </p>
            </div>
          </div>
        </div>
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
  const blockers = items.filter((item) => !item.complete);
  const completedItems = items.filter((item) => item.complete);
  const visibleItems =
    blockers.length > 0 ? blockers.slice(0, 3) : completedItems.slice(0, 3);

  return (
    <PtHubSectionCard
      title={title}
      description={description}
      actions={actions}
      module={module}
      className="pt-hub-launch-checklist h-full"
      contentClassName={collapsed ? "hidden" : undefined}
    >
      {!collapsed ? (
        <div className="space-y-3">
          <div
            className="h-1.5 overflow-hidden rounded-full bg-muted/55"
            role="progressbar"
            aria-label={`${title} completion`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={completionPercent}
          >
            <div
              className="h-full rounded-full bg-primary/70 transition-[width]"
              style={{ width: `${completionPercent}%` }}
            />
          </div>

          <div className="divide-y divide-border/55">
            {visibleItems.map((item) => (
              <div
                key={item.id}
                className="pt-hub-inline-row pt-hub-interactive flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 flex items-center gap-3">
                  <CheckCircle2
                    className={cn(
                      "h-4 w-4 shrink-0 [stroke-width:1.8]",
                      item.complete
                        ? "text-success opacity-75"
                        : "text-muted-foreground",
                    )}
                  />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-foreground">
                      {item.label}
                    </p>
                  </div>
                </div>
                <Button
                  asChild
                  variant={item.complete ? "ghost" : "secondary"}
                  size="sm"
                  className="shrink-0"
                >
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
            className="rounded-[var(--ui-radius-card)] border-border/70 bg-background/34"
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
                        className="px-2.5 py-1 text-[11px] normal-case tracking-normal"
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
                      className="w-full rounded-[var(--ui-radius-card)] border border-transparent bg-transparent px-4 py-4 text-left"
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
                    className="pt-hub-interactive group w-full rounded-[var(--ui-radius-card)] border border-transparent bg-transparent px-4 py-4 text-left hover:bg-background/18 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
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

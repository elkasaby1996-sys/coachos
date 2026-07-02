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

function getActionPriorityLabel(tone: SemanticTone) {
  if (tone === "danger") return "High priority";
  if (tone === "warning") return "Needs review";
  if (tone === "success") return "Clear";
  return "Next step";
}

function getActionOwnerLabel(item: PtHubOverviewActionItem) {
  return item.workspaceId ? "Workspace" : "Coach";
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

function PtHubActivationChecklist({
  checklist,
  isLoading = false,
  hasError = false,
}: {
  checklist: PtHubActivationChecklistModel | null;
  isLoading?: boolean;
  hasError?: boolean;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const checklistRowsId = "pt-hub-activation-checklist-rows";

  if (isLoading && !checklist) {
    return (
      <div className="rounded-[28px] border border-border/55 bg-background/28 px-4 py-4 sm:px-5">
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

  if (hasError && !checklist) {
    return (
      <div className="rounded-[24px] border border-warning/24 bg-warning/10 px-4 py-3">
        <p className="text-sm font-semibold text-foreground">
          Activation checklist unavailable
        </p>
        <p className="pt-hub-meta-text mt-1 text-[0.88rem] leading-5">
          The Action Center is still available. Refresh if you want to reload
          setup progress.
        </p>
      </div>
    );
  }

  if (!shouldShowPtHubActivationChecklist(checklist)) return null;

  const visibleItems = checklist.items;
  const summary = `${checklist.coreCompletedCount} of ${checklist.coreTotalCount} setup steps complete`;
  const progressPercent =
    checklist.coreTotalCount > 0
      ? Math.round(
          (checklist.coreCompletedCount / checklist.coreTotalCount) * 100,
        )
      : 0;
  const firstClientGuidance =
    checklist.nextItem?.id === "first-client"
      ? checklist.firstClientGuidance
      : null;
  const nextItem = checklist.nextItem;

  return (
    <div className="rounded-[26px] border border-border/60 bg-background/28 px-4 py-4 shadow-[inset_0_1px_0_oklch(1_0_0/0.025)] sm:px-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="pt-hub-minor-label pt-hub-minor-label-strong">
            Coach activation
          </p>
          <p className="mt-1 text-[1rem] font-semibold text-foreground">
            {summary}
          </p>
        </div>
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
      </div>

      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted/55">
        <div
          className="h-full rounded-full bg-primary/70 transition-[width]"
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      {nextItem && !firstClientGuidance ? (
        <div className="mt-4 rounded-[20px] border border-warning/30 bg-warning/10 px-4 py-3">
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
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
            <Button asChild size="sm" className="w-full sm:w-auto">
              <Link to={nextItem.href}>
                {nextItem.ctaLabel}
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      ) : null}

      {firstClientGuidance ? (
        <div className="mt-4 rounded-[22px] border border-primary/20 bg-primary/8 px-4 py-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <p className="pt-hub-minor-label text-primary">
                Next recommended
              </p>
              <p className="text-sm font-semibold text-foreground">
                Choose how to add your first client
              </p>
              <p className="pt-hub-meta-text mt-1 max-w-2xl text-[0.88rem] leading-5">
                Direct invite is the fastest path if you already coach someone.
                Public applications stay available when you want inbound leads.
              </p>
            </div>
          </div>

          <div className="mt-3 grid gap-2 lg:grid-cols-2">
            <div className="rounded-[18px] border border-border/55 bg-background/34 px-3.5 py-3">
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

            <div className="rounded-[18px] border border-border/55 bg-background/34 px-3.5 py-3">
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

      {isExpanded ? (
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
    </div>
  );
}

export function PtHubSetupNoticeStrip({
  completionPercent,
}: {
  completionPercent: number;
}) {
  return (
    <div className="surface-panel pt-hub-setup-notice pt-hub-surface-quiet relative overflow-hidden rounded-[22px] border border-border/60 px-4 py-3 shadow-[0_12px_34px_-30px_oklch(var(--accent)/0.3)] sm:px-5">
      <div className="relative flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-wrap items-center gap-2.5">
          <Badge
            variant="warning"
            className="h-7 px-2.5 text-[11px] normal-case tracking-normal"
          >
            Setup not finished
          </Badge>
          <p className="pt-hub-meta-text text-sm leading-6">
            {completionPercent}% ready. Finish the launch checklist below before
            publishing your coach page.
          </p>
        </div>
      </div>
    </div>
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
  const priorityLabel = getActionPriorityLabel(item.tone);
  const ownerLabel = getActionOwnerLabel(item);

  if (variant === "compact") {
    return (
      <button
        type="button"
        onClick={onClick}
        className="pt-hub-interactive pt-hub-priority-row pt-hub-priority-row-compact group flex min-w-0 items-center justify-between gap-4 rounded-[20px] border border-border/55 bg-background/22 px-4 py-3 text-left transition-[background-color,border-color,box-shadow] duration-200 hover:border-border/80 hover:bg-background/38 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        <div className="min-w-0 flex items-center gap-3">
          <span
            className={cn(
              "pt-hub-priority-icon inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border",
              toneStyles.surface,
            )}
            aria-hidden
          >
            <StatusIcon className="h-3.5 w-3.5 [stroke-width:1.8]" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-[0.95rem] font-semibold leading-5 text-foreground">
              {item.label}
            </p>
            <p className="pt-hub-meta-text mt-0.5 truncate text-[0.78rem] font-medium">
              {ownerLabel} - {item.badge}
            </p>
          </div>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1.5 text-sm font-medium text-primary transition-colors group-hover:text-foreground group-focus-visible:text-foreground">
          {item.ctaLabel}
          <ArrowRight className="h-3.5 w-3.5 [stroke-width:1.7]" />
        </span>
      </button>
    );
  }

  const isPrimary = variant === "primary";

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "pt-hub-interactive pt-hub-priority-row group relative grid gap-4 border border-border/60 text-left shadow-[inset_0_1px_0_oklch(1_0_0/0.035)] transition-[background-color,border-color,box-shadow] duration-200 hover:border-border/80 hover:bg-background/52 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start lg:gap-x-6",
        isPrimary
          ? "pt-hub-priority-row-primary rounded-[28px] bg-background/42 px-4 py-4 sm:px-5 sm:py-5"
          : "rounded-[24px] bg-background/34 px-4 py-4 sm:px-5",
      )}
    >
      <div className="min-w-0 flex gap-3">
        <span
          className={cn(
            "pt-hub-priority-icon mt-0.5 inline-flex shrink-0 items-center justify-center rounded-full border",
            isPrimary ? "h-10 w-10" : "h-9 w-9",
            toneStyles.surface,
          )}
          aria-hidden
        >
          <StatusIcon
            className={cn("h-4 w-4 [stroke-width:1.8]", isPrimary && "h-5 w-5")}
          />
        </span>
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              variant={getSemanticBadgeVariant(item.tone)}
              className="h-6 px-2 text-[0.72rem] normal-case tracking-normal"
            >
              {priorityLabel}
            </Badge>
            <span className="pt-hub-owner-chip">{ownerLabel}</span>
          </div>
          <p
            className={cn(
              "font-semibold text-foreground",
              isPrimary
                ? "text-[1.12rem] leading-6 sm:text-[1.22rem]"
                : "text-[1.02rem] leading-5",
            )}
          >
            {item.label}
          </p>
          <p
            className={cn(
              "pt-hub-meta-text max-w-4xl",
              isPrimary
                ? "text-[0.95rem] leading-6"
                : "text-[0.9rem] leading-5",
            )}
          >
            {item.description}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3 pl-12 lg:min-w-[11.5rem] lg:flex-col lg:items-end lg:justify-center lg:pl-0">
        <Badge
          variant={getSemanticBadgeVariant(item.tone)}
          className="h-7 px-2.5 py-0 text-[11px] normal-case tracking-normal"
        >
          {item.badge}
        </Badge>
        <span className="inline-flex items-center gap-2 text-sm font-medium text-primary transition-colors group-hover:text-foreground group-focus-visible:text-foreground">
          <span className="pt-hub-action-prefix hidden lg:inline">
            Next action
          </span>
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
  activationChecklist,
  activationChecklistLoading,
  activationChecklistError,
}: {
  items: PtHubOverviewActionItem[];
  mode: "activation" | "operating";
  activationChecklist?: PtHubActivationChecklistModel | null;
  activationChecklistLoading?: boolean;
  activationChecklistError?: boolean;
}) {
  const navigate = useNavigate();
  const { switchWorkspace } = useWorkspace();
  const helperText =
    mode === "activation"
      ? "Start with the blocker most likely to delay launch."
      : "Start with the decision most likely to protect client delivery.";
  const [primaryItem, ...secondaryItems] = items;
  const visibleSecondaryItems = secondaryItems.slice(0, 3);
  const hiddenSecondaryCount =
    secondaryItems.length - visibleSecondaryItems.length;

  const handleActionClick = (item: PtHubOverviewActionItem) => {
    if (item.workspaceId) {
      switchWorkspace(item.workspaceId);
    }
    navigate(item.href);
  };

  return (
    <div className="surface-panel-strong pt-hub-priority-panel pt-hub-surface-hero relative overflow-hidden rounded-[34px] border border-border/70 px-5 py-5 shadow-[var(--surface-strong-shadow)] backdrop-blur-xl sm:px-6 sm:py-6">
      <div className="pt-hub-action-center-overlay pointer-events-none absolute inset-0" />
      <div className="pointer-events-none absolute inset-x-6 top-0 h-px bg-[linear-gradient(90deg,transparent,oklch(var(--border-strong)/0.34),transparent)]" />

      <div className="relative space-y-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-2.5">
            <p className="pt-hub-kicker">Action center</p>
            <h2 className="max-w-3xl text-balance text-[1.55rem] font-semibold tracking-[0.005em] text-foreground sm:text-[1.85rem]">
              Command center
            </h2>
            <p className="pt-hub-meta-text max-w-3xl text-[0.95rem] leading-6 text-muted-foreground">
              {helperText}
            </p>
          </div>
          <Badge
            variant={items.length > 0 ? "warning" : "success"}
            className="h-8 w-fit px-3 text-[11px] normal-case tracking-normal"
          >
            {items.length > 0
              ? `${items.length} open ${items.length === 1 ? "item" : "items"}`
              : "Clear"}
          </Badge>
        </div>

        <PtHubActivationChecklist
          checklist={activationChecklist ?? null}
          isLoading={activationChecklistLoading}
          hasError={activationChecklistError}
        />

        {primaryItem ? (
          <div
            className="space-y-4"
            role="list"
            aria-label="Action center items"
          >
            <div className="space-y-2">
              <p className="pt-hub-minor-label pt-hub-minor-label-strong">
                Focus first
              </p>
              <PtHubActionCenterRow
                item={primaryItem}
                onClick={() => handleActionClick(primaryItem)}
                variant="primary"
              />
            </div>

            {visibleSecondaryItems.length > 0 ? (
              <div className="space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="pt-hub-minor-label">Next in queue</p>
                  {hiddenSecondaryCount > 0 ? (
                    <span className="pt-hub-meta-text text-xs font-medium">
                      +{hiddenSecondaryCount} more held back
                    </span>
                  ) : null}
                </div>
                <div className="grid gap-2 lg:grid-cols-3">
                  {visibleSecondaryItems.map((item) => (
                    <PtHubActionCenterRow
                      key={item.id}
                      item={item}
                      onClick={() => handleActionClick(item)}
                      variant="compact"
                    />
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="pt-hub-command-clear-state rounded-[28px] border border-primary/18 bg-primary/8 px-5 py-6">
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
      className="rounded-[22px] border-transparent bg-transparent px-4 py-4 shadow-none hover:border-transparent hover:bg-background/18"
      onClick={() => onOpenNotification(notification)}
    />
  );

  return (
    <PtHubSectionCard
      title="Recent activity"
      description={headerSummary}
      module={module}
      className="pt-hub-activity-rail pt-hub-surface-quiet h-full"
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
              className="h-24 rounded-[22px] border border-border/60"
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
          className="rounded-[26px] border-border/70 bg-background/34"
        />
      ) : (
        <div className="pt-hub-activity-clear rounded-[24px] border border-border/55 bg-background/20 px-4 py-5">
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
  const hiddenBlockerCount = Math.max(blockers.length - visibleItems.length, 0);
  const checklistSummary =
    blockers.length > 0
      ? `${Math.min(blockers.length, 3)} blocker${Math.min(blockers.length, 3) === 1 ? "" : "s"} shown`
      : "Launch basics complete";

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
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3 text-[0.78rem] font-semibold text-muted-foreground">
              <span>{checklistSummary}</span>
              <span className="tabular-nums">{completionPercent}% ready</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-muted/55">
              <div
                className="h-full rounded-full bg-primary/70 transition-[width]"
                style={{ width: `${completionPercent}%` }}
              />
            </div>
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
          {hiddenBlockerCount > 0 ? (
            <p className="pt-hub-meta-text text-xs">
              {hiddenBlockerCount} more blocker
              {hiddenBlockerCount === 1 ? "" : "s"} in the profile editor.
            </p>
          ) : null}
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

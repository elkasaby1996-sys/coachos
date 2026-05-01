import {
  ChevronDown,
  ChevronUp,
  ClipboardList,
  MessageSquarePlus,
  Sparkles,
  UsersRound,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { StatCard } from "../../components/ui/coachos/stat-card";
import {
  PtHubActionCenter,
  PtHubModeStatusStrip,
  PtHubLaunchChecklistCard,
  PtHubOverviewErrorState,
  PtHubOverviewLoadingState,
  PtHubRecentActivityCard,
  PtHubQuickActionsCard,
  PtHubSummaryCard,
} from "../../features/pt-hub/components/pt-hub-overview-sections";
import {
  useMarkNotificationRead,
  useNotificationsList,
  useUnreadNotificationCount,
} from "../../features/notifications/hooks/use-notifications";
import type { NotificationRecord } from "../../features/notifications/lib/types";
import { getPtHubOverviewDashboardModel } from "../../features/pt-hub/lib/overview-dashboard";
import {
  usePtHubAnalytics,
  usePtHubClients,
  usePtHubLeads,
  usePtHubOverview,
  usePtHubPayments,
  usePtHubProfile,
  usePtHubProfileReadiness,
  usePtHubPublicationState,
  usePtHubWorkspaces,
} from "../../features/pt-hub/lib/pt-hub";
import { useSessionAuth } from "../../lib/auth";
import { getModuleToneForPath } from "../../lib/module-tone";
import { cn } from "../../lib/utils";
import { useWorkspace } from "../../lib/use-workspace";

const metricIconMap = {
  "active-clients": UsersRound,
  "new-leads-month": MessageSquarePlus,
  "checkins-due": Sparkles,
  "onboarding-in-progress": ClipboardList,
} as const satisfies Record<string, LucideIcon>;

function getMetricGridClassName(metricCount: number) {
  if (metricCount <= 2) return "pt-hub-kpi-grid-wide";
  return "";
}

function getNotificationWorkspaceId(notification: NotificationRecord) {
  const metadata = notification.metadata;
  if (!metadata || typeof metadata !== "object") return null;

  if (typeof metadata.workspace_id === "string") {
    return metadata.workspace_id;
  }

  if (typeof metadata.workspaceId === "string") {
    return metadata.workspaceId;
  }

  return null;
}

export function PtHubOverviewPage() {
  const navigate = useNavigate();
  const { user } = useSessionAuth();
  const { switchWorkspace } = useWorkspace();
  const [businessSetupCollapsed, setBusinessSetupCollapsed] = useState(false);
  const [billingCollapsed, setBillingCollapsed] = useState(false);
  const [supportExpanded, setSupportExpanded] = useState(false);
  const overviewQuery = usePtHubOverview();
  const workspacesQuery = usePtHubWorkspaces();
  const profileQuery = usePtHubProfile();
  const readinessQuery = usePtHubProfileReadiness();
  const paymentsQuery = usePtHubPayments();
  const analyticsQuery = usePtHubAnalytics();
  const leadsQuery = usePtHubLeads();
  const clientsQuery = usePtHubClients();
  const publicationQuery = usePtHubPublicationState();
  const notificationsQuery = useNotificationsList({
    userId: user?.id ?? null,
    limit: 4,
    filter: "all",
  });
  const unreadNotificationCountQuery = useUnreadNotificationCount(
    user?.id ?? null,
  );
  const markNotificationReadMutation = useMarkNotificationRead(
    user?.id ?? null,
  );

  const queries = [
    overviewQuery,
    workspacesQuery,
    profileQuery,
    readinessQuery,
    paymentsQuery,
    analyticsQuery,
    leadsQuery,
    clientsQuery,
    publicationQuery,
  ] as const;

  const hasRequiredData = Boolean(
    overviewQuery.data &&
    workspacesQuery.data &&
    profileQuery.data &&
    readinessQuery.data &&
    paymentsQuery.data &&
    analyticsQuery.data &&
    leadsQuery.data &&
    clientsQuery.data &&
    publicationQuery.data,
  );
  const isInitialLoading = queries.some((query) => query.isLoading);
  const hasError = queries.some((query) => query.error);

  const retryAll = () => {
    void Promise.all(queries.map((query) => query.refetch()));
  };

  if (!hasRequiredData && isInitialLoading) {
    return <PtHubOverviewLoadingState />;
  }

  if (!hasRequiredData && hasError) {
    return <PtHubOverviewErrorState onRetry={retryAll} />;
  }

  const stats = overviewQuery.data;
  const workspaces = workspacesQuery.data ?? [];
  const profile = profileQuery.data;
  const readiness = readinessQuery.data;
  const payments = paymentsQuery.data;
  const analytics = analyticsQuery.data;
  const leads = leadsQuery.data ?? [];
  const clients = clientsQuery.data ?? [];
  const publicationState = publicationQuery.data;
  const notifications = notificationsQuery.data ?? [];
  const unreadNotificationCount = unreadNotificationCountQuery.data ?? 0;

  const dashboardModel = getPtHubOverviewDashboardModel({
    stats,
    analytics,
    readiness,
    profile,
    publicationState,
    workspaces,
    leads,
    clients,
    subscription: payments?.subscription,
    revenue: payments?.revenue,
  });

  const showBusinessSetup = dashboardModel.setupCompletionPercent < 100;
  const metricGridClassName = getMetricGridClassName(
    dashboardModel.metrics.length,
  );
  const businessSetupToggleId = "pt-hub-business-setup-panel";
  const billingToggleId = "pt-hub-revenue-billing-panel";

  const handleOpenNotification = async (notification: NotificationRecord) => {
    const workspaceId = getNotificationWorkspaceId(notification);
    if (workspaceId) {
      switchWorkspace(workspaceId);
    }

    if (!notification.is_read) {
      await markNotificationReadMutation.mutateAsync(notification.id);
    }

    if (notification.action_url) {
      navigate(notification.action_url);
    }
  };

  return (
    <section
      className="pt-hub-page-stack"
      data-density="roomy"
      data-testid="pt-hub-page"
    >
      <PtHubModeStatusStrip
        mode={dashboardModel.mode}
        label={dashboardModel.modeLabel}
        description={dashboardModel.modeDescription}
        setupCompletionPercent={dashboardModel.setupCompletionPercent}
        clientsNeedingAttentionCount={
          dashboardModel.clientsNeedingAttentionCount
        }
      />

      <div
        className={cn("page-kpi-block pt-hub-kpi-grid", metricGridClassName)}
        data-columns={dashboardModel.metrics.length === 4 ? "4" : undefined}
      >
        {dashboardModel.metrics.map((metric) => {
          const Icon = metricIconMap[metric.id as keyof typeof metricIconMap];
          const card = (
            <StatCard
              key={metric.id}
              surface="pt-hub"
              label={metric.label}
              value={metric.value}
              helper={metric.helper}
              icon={Icon}
              accent={metric.accent}
              delta={metric.delta}
              module={
                metric.href ? getModuleToneForPath(metric.href) : "overview"
              }
              className="h-full"
            />
          );

          if (!metric.href) return card;

          return (
            <Link key={metric.id} to={metric.href} className="block h-full">
              {card}
            </Link>
          );
        })}
      </div>

      <div className="pt-hub-work-grid-main">
        <PtHubActionCenter
          items={dashboardModel.actionItems}
          mode={dashboardModel.mode}
        />
        <PtHubRecentActivityCard
          notifications={notifications}
          unreadCount={unreadNotificationCount}
          isLoading={notificationsQuery.isLoading}
          errorMessage={
            notificationsQuery.error instanceof Error
              ? notificationsQuery.error.message
              : notificationsQuery.error
                ? "Notifications could not be loaded right now."
                : null
          }
          onOpenNotification={(notification) => {
            void handleOpenNotification(notification);
          }}
          module="overview"
        />
      </div>

      {showBusinessSetup ? (
        <div className="pt-hub-work-grid">
          <div id={businessSetupToggleId}>
            <PtHubLaunchChecklistCard
              module="profile"
              title="Business setup"
              description="Finish the foundation across workspace, coach page, and first-demand readiness."
              items={dashboardModel.launchChecklist}
              completionPercent={dashboardModel.setupCompletionPercent}
              collapsed={businessSetupCollapsed}
              actions={
                <button
                  type="button"
                  aria-expanded={!businessSetupCollapsed}
                  aria-controls={businessSetupToggleId}
                  className="pt-hub-collapse-action inline-flex min-h-10 items-center justify-center gap-2 rounded-2xl border border-border/65 bg-background/35 px-3.5 text-sm font-semibold text-muted-foreground transition-[background-color,border-color,color,box-shadow,transform] duration-200 hover:border-border/85 hover:bg-background/58 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  onClick={() =>
                    setBusinessSetupCollapsed((current) => !current)
                  }
                >
                  <span className="sr-only">
                    {businessSetupCollapsed
                      ? "Expand business setup"
                      : "Collapse business setup"}
                  </span>
                  <span aria-hidden>
                    {businessSetupCollapsed ? "Show" : "Hide"}
                  </span>
                  {businessSetupCollapsed ? (
                    <ChevronDown className="h-3.5 w-3.5 [stroke-width:1.8]" />
                  ) : (
                    <ChevronUp className="h-3.5 w-3.5 [stroke-width:1.8]" />
                  )}
                </button>
              }
            />
          </div>
        </div>
      ) : null}

      <div className="surface-panel relative overflow-hidden rounded-[28px] border border-border/70 px-4 py-4 shadow-[var(--surface-shadow)] sm:px-5">
        <div className="relative flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="pt-hub-kicker">Supporting details</p>
            <p className="pt-hub-meta-text mt-1 max-w-3xl text-[0.94rem] leading-6">
              Business snapshots, pipeline summaries, shortcuts, and billing
              stay tucked away until you need a wider read.
            </p>
          </div>
          <button
            type="button"
            aria-expanded={supportExpanded}
            className="pt-hub-collapse-action inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-2xl border border-border/65 bg-background/35 px-3.5 text-sm font-semibold text-muted-foreground transition-[background-color,border-color,color,box-shadow,transform] duration-200 hover:border-border/85 hover:bg-background/58 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            onClick={() => setSupportExpanded((current) => !current)}
          >
            <span>{supportExpanded ? "Hide details" : "Show details"}</span>
            {supportExpanded ? (
              <ChevronUp className="h-3.5 w-3.5 [stroke-width:1.8]" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5 [stroke-width:1.8]" />
            )}
          </button>
        </div>
      </div>

      {supportExpanded ? (
        <>
          <div className="pt-hub-secondary-grid grid xl:grid-cols-3">
            <PtHubSummaryCard
              module="overview"
              title="Business snapshot"
              items={dashboardModel.businessSummary}
            />
            <PtHubSummaryCard
              module="leads"
              title="Lead pipeline"
              items={dashboardModel.pipelineSummary}
              isEmpty={leads.length === 0}
              emptyState={{
                title: "No leads in the pipeline yet",
                description:
                  "A clear coach page and a shareable public presence are the fastest way to create the first real lead flow.",
                href: "/pt-hub/profile/preview",
                ctaLabel: "Open public preview",
              }}
            />
            <PtHubSummaryCard
              module="checkins"
              title="Client delivery"
              items={dashboardModel.clientHealthSummary}
              isEmpty={clients.length === 0}
              emptyState={{
                title: "No clients to review yet",
                description:
                  "Once clients join, this section will surface onboarding gaps, overdue check-ins, and risk signals.",
                href: "/pt-hub/workspaces",
                ctaLabel: "Open coaching spaces",
              }}
            />
          </div>

          <PtHubQuickActionsCard
            title="Route shortcuts"
            description="Use these when you need a direct jump outside the priority queue."
            actions={dashboardModel.quickActions}
          />

          {dashboardModel.mode !== "activation" ? (
            <div className="pt-hub-work-grid">
              <div id={billingToggleId}>
                <PtHubSummaryCard
                  module="billing"
                  title="Revenue and billing"
                  description="Commercial health for the coaching business."
                  items={dashboardModel.billingSummary}
                  collapsed={billingCollapsed}
                  actions={
                    <button
                      type="button"
                      aria-expanded={!billingCollapsed}
                      aria-controls={billingToggleId}
                      className="pt-hub-collapse-action inline-flex min-h-10 items-center justify-center gap-2 rounded-2xl border border-border/65 bg-background/35 px-3.5 text-sm font-semibold text-muted-foreground transition-[background-color,border-color,color,box-shadow,transform] duration-200 hover:border-border/85 hover:bg-background/58 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      onClick={() => setBillingCollapsed((current) => !current)}
                    >
                      <span className="sr-only">
                        {billingCollapsed
                          ? "Expand revenue and billing"
                          : "Collapse revenue and billing"}
                      </span>
                      <span aria-hidden>
                        {billingCollapsed ? "Show" : "Hide"}
                      </span>
                      {billingCollapsed ? (
                        <ChevronDown className="h-3.5 w-3.5 [stroke-width:1.8]" />
                      ) : (
                        <ChevronUp className="h-3.5 w-3.5 [stroke-width:1.8]" />
                      )}
                    </button>
                  }
                />
              </div>
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  );
}

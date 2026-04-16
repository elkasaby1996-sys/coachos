import {
  ChevronDown,
  ChevronUp,
  ClipboardList,
  MessageSquarePlus,
  Sparkles,
  UsersRound,
  Wallet,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { StatCard } from "../../components/ui/coachos/stat-card";
import {
  PtHubActionCenter,
  PtHubLaunchChecklistCard,
  PtHubOverviewErrorState,
  PtHubOverviewLoadingState,
  PtHubRecentActivityCard,
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
  "monthly-revenue": Wallet,
  "monthly-earnings": Wallet,
} as const satisfies Record<string, LucideIcon>;

function getMetricGridClassName(metricCount: number) {
  if (metricCount >= 5) return "xl:grid-cols-5";
  if (metricCount === 4) return "xl:grid-cols-4";
  if (metricCount === 3) return "lg:grid-cols-3";
  if (metricCount === 2) return "sm:grid-cols-2";
  return "grid-cols-1";
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
    <section className="space-y-7" data-testid="pt-hub-page">
      <div className={cn("page-kpi-block grid gap-4", metricGridClassName)}>
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

      <PtHubActionCenter
        items={dashboardModel.actionItems}
        mode={dashboardModel.mode}
      />

      <div className="grid gap-6 xl:grid-cols-3">
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
        <div className="grid gap-6">
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
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-transparent text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  onClick={() =>
                    setBusinessSetupCollapsed((current) => !current)
                  }
                >
                  <span className="sr-only">
                    {businessSetupCollapsed
                      ? "Expand business setup"
                      : "Collapse business setup"}
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

      {dashboardModel.mode !== "activation" ? (
        <div className="grid gap-6">
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
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-transparent text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  onClick={() => setBillingCollapsed((current) => !current)}
                >
                  <span className="sr-only">
                    {billingCollapsed
                      ? "Expand revenue and billing"
                      : "Collapse revenue and billing"}
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
    </section>
  );
}

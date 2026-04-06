import {
  ClipboardList,
  MessageSquarePlus,
  Sparkles,
  UsersRound,
  Wallet,
} from "lucide-react";
import { Link } from "react-router-dom";
import { StatCard } from "../../components/ui/coachos/stat-card";
import {
  PtHubActionCenter,
  PtHubLaunchChecklistCard,
  PtHubOverviewErrorState,
  PtHubOverviewLoadingState,
  PtHubRecentActivityCard,
  PtHubSummaryCard,
  type PtHubOverviewActivityItem,
} from "../../features/pt-hub/components/pt-hub-overview-sections";
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
import type {
  PTClientSummary,
  PTLead,
  PTProfileReadiness,
  PTWorkspaceSummary,
} from "../../features/pt-hub/types";
import { formatRelativeTime } from "../../lib/relative-time";
import { cn } from "../../lib/utils";

const metricIconMap = {
  "active-clients": UsersRound,
  "new-leads-month": MessageSquarePlus,
  "checkins-due": Sparkles,
  "onboarding-in-progress": ClipboardList,
  "monthly-revenue": Wallet,
  "monthly-earnings": Wallet,
} as const;

function getMetricGridClassName(metricCount: number) {
  if (metricCount >= 5) return "xl:grid-cols-5";
  if (metricCount === 4) return "xl:grid-cols-4";
  if (metricCount === 3) return "lg:grid-cols-3";
  if (metricCount === 2) return "sm:grid-cols-2";
  return "grid-cols-1";
}

function formatActivityDayStamp(value: Date | string | null | undefined) {
  if (!value) return "Today";

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "Today";

  const now = new Date();
  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  );
  const startOfDate = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
  );
  const diffDays = Math.round(
    (startOfToday.getTime() - startOfDate.getTime()) / (1000 * 60 * 60 * 24),
  );

  if (diffDays <= 0) return "Today";
  if (diffDays === 1) return "Yesterday";

  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

export function PtHubOverviewPage() {
  const overviewQuery = usePtHubOverview();
  const workspacesQuery = usePtHubWorkspaces();
  const profileQuery = usePtHubProfile();
  const readinessQuery = usePtHubProfileReadiness();
  const paymentsQuery = usePtHubPayments();
  const analyticsQuery = usePtHubAnalytics();
  const leadsQuery = usePtHubLeads();
  const clientsQuery = usePtHubClients();
  const publicationQuery = usePtHubPublicationState();

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

  const recentActivityItems = buildRecentActivityItems({
    leads,
    clients,
    workspaces,
    readiness,
    profilePublished: publicationState?.isPublished ?? false,
  });
  const showBusinessSetup = dashboardModel.setupCompletionPercent < 100;
  const metricGridClassName = getMetricGridClassName(
    dashboardModel.metrics.length,
  );

  return (
    <section className="space-y-7">
      <div className={cn("grid gap-4", metricGridClassName)}>
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
          title="Lead pipeline"
          description="What is coming into the business and where follow-up is needed."
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
          title="Client delivery"
          description="A quick read on who needs support, follow-up, or onboarding help."
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
        <PtHubRecentActivityCard items={recentActivityItems} />
      </div>

      {showBusinessSetup ? (
        <div className="grid gap-6">
          <PtHubLaunchChecklistCard
            title="Business setup"
            description="Finish the foundation across workspace, coach page, and first-demand readiness."
            items={dashboardModel.launchChecklist}
            completionPercent={dashboardModel.setupCompletionPercent}
          />
        </div>
      ) : null}

      {dashboardModel.mode !== "activation" ? (
        <div className="grid gap-6">
          <PtHubSummaryCard
            title="Revenue and billing"
            description="Commercial health for the coaching business."
            items={dashboardModel.billingSummary}
          />
        </div>
      ) : null}
    </section>
  );
}

function buildRecentActivityItems(params: {
  leads: PTLead[] | null | undefined;
  clients: PTClientSummary[] | null | undefined;
  workspaces: PTWorkspaceSummary[] | null | undefined;
  readiness: PTProfileReadiness | null | undefined;
  profilePublished: boolean;
}): PtHubOverviewActivityItem[] {
  const leads = params.leads ?? [];
  const clients = params.clients ?? [];
  const workspaces = params.workspaces ?? [];
  const readiness = params.readiness;
  const latestLead = leads[0] ?? null;
  const latestClientAttention = [...clients]
    .filter(
      (client) =>
        client.hasOverdueCheckin ||
        client.onboardingIncomplete ||
        client.lifecycleState === "at_risk" ||
        client.riskFlags.length > 0,
    )
    .sort((left, right) => {
      const leftTime = new Date(
        left.lastActivityAt ?? left.updatedAt ?? 0,
      ).getTime();
      const rightTime = new Date(
        right.lastActivityAt ?? right.updatedAt ?? 0,
      ).getTime();
      return rightTime - leftTime;
    })[0];
  const latestCoachingSpace = workspaces[0] ?? null;

  const items = [
    latestLead
      ? {
          id: "recent-lead",
          title: `${latestLead.fullName} submitted an inquiry`,
          description: formatActivityDayStamp(latestLead.submittedAt),
          href: "/pt-hub/leads",
          ctaLabel: "Open lead",
        }
      : null,
    latestClientAttention
      ? {
          id: "recent-client",
          title: `${latestClientAttention.displayName} needs coach attention`,
          description: latestClientAttention.lastActivityAt
            ? formatActivityDayStamp(latestClientAttention.lastActivityAt)
            : "Today",
          href: "/pt-hub/clients",
          ctaLabel: "Open clients",
        }
      : null,
    latestCoachingSpace?.lastUpdated
      ? {
          id: "recent-space",
          title: `${latestCoachingSpace.name} was updated`,
          description: formatActivityDayStamp(latestCoachingSpace.lastUpdated),
          href: "/pt-hub/workspaces",
          ctaLabel: "Open coaching spaces",
        }
      : null,
    readiness
      ? {
          id: "recent-profile",
          title: params.profilePublished
            ? "Your public profile is live"
            : `Your public profile is ${readiness.completionPercent}% complete`,
          description: "Today",
          href: "/pt-hub/profile",
          ctaLabel: "Open profile",
        }
      : null,
  ].filter(Boolean) as PtHubOverviewActivityItem[];

  return items.slice(0, 3);
}

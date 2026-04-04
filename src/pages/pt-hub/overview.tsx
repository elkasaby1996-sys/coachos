import {
  Building,
  MessageSquarePlus,
  Sparkles,
  UserRound,
  UsersRound,
  Wallet,
} from "lucide-react";
import { StatCard } from "../../components/ui/coachos/stat-card";
import {
  PtHubActionCenter,
  PtHubLaunchChecklistCard,
  PtHubOverviewErrorState,
  PtHubOverviewLoadingState,
  PtHubQuickActionsCard,
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

const metricIconMap = {
  "profile-readiness": UserRound,
  "launch-blockers": Sparkles,
  "coaching-spaces": Building,
  "new-leads-month": MessageSquarePlus,
  "awaiting-response": MessageSquarePlus,
  "clients-needing-attention": UsersRound,
  "checkins-overdue": UsersRound,
  "monthly-revenue": Wallet,
} as const;

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

  return (
    <section className="space-y-7">
      <div className="grid gap-4 xl:grid-cols-4">
        {dashboardModel.metrics.map((metric) => {
          const Icon = metricIconMap[metric.id as keyof typeof metricIconMap];

          return (
            <StatCard
              key={metric.id}
              surface="pt-hub"
              label={metric.label}
              value={metric.value}
              helper={metric.helper}
              icon={Icon}
              accent={metric.accent}
              delta={metric.delta}
            />
          );
        })}
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_380px]">
        <PtHubActionCenter
          items={dashboardModel.actionItems}
          mode={dashboardModel.mode}
        />
        <PtHubRecentActivityCard items={recentActivityItems} />
      </div>

      {dashboardModel.mode === "activation" ? (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,0.95fr)]">
          <PtHubLaunchChecklistCard
            items={dashboardModel.launchChecklist}
            completionPercent={readiness?.completionPercent ?? 0}
          />
          <PtHubQuickActionsCard actions={dashboardModel.quickActions} />
        </div>
      ) : (
        <div className="grid gap-6 xl:grid-cols-3">
          <PtHubSummaryCard
            title="Lead pipeline"
            items={dashboardModel.pipelineSummary}
            isEmpty={leads.length === 0}
            emptyState={{
              title: "No leads in the pipeline yet",
              description:
                "A live public profile and a shareable coach page are the fastest way to create the first real lead flow.",
              href: "/pt-hub/profile/preview",
              ctaLabel: "Open public preview",
            }}
          />
          <PtHubSummaryCard
            title="Client health"
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
          <PtHubSummaryCard
            title="Billing snapshot"
            items={dashboardModel.billingSummary}
          />
        </div>
      )}
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
          description: `${formatRelativeTime(latestLead.submittedAt)}. ${latestLead.goalSummary}`,
          href: "/pt-hub/leads",
          ctaLabel: "Open lead",
        }
      : null,
    latestClientAttention
      ? {
          id: "recent-client",
          title: `${latestClientAttention.displayName} needs coach attention`,
          description: `${latestClientAttention.recentActivityLabel}. Review check-ins, onboarding, or risk signals for this client.`,
          href: "/pt-hub/clients",
          ctaLabel: "Open clients",
        }
      : null,
    latestCoachingSpace?.lastUpdated
      ? {
          id: "recent-space",
          title: `${latestCoachingSpace.name} was updated`,
          description: `${formatRelativeTime(latestCoachingSpace.lastUpdated)}. Keep this coaching space ready for new and active clients.`,
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
          description: params.profilePublished
            ? "The public page is already published, so profile improvements now support better lead conversion."
            : `${readiness.missingItems.length} setup item(s) are still blocking a stronger launch.`,
          href: "/pt-hub/profile",
          ctaLabel: "Open profile",
        }
      : null,
  ].filter(Boolean) as PtHubOverviewActivityItem[];

  return items.slice(0, 3);
}

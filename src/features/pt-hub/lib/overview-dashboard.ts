import { getPtClientBaseStats } from "./pt-hub";
import type {
  PTAnalyticsSnapshot,
  PTClientSummary,
  PTLead,
  PTOverviewStats,
  PTProfile,
  PTProfileReadiness,
  PTPublicationState,
  PTRevenueSnapshot,
  PTSubscriptionSummary,
  PTWorkspaceSummary,
} from "../types";

type MetricTone = "positive" | "negative" | "neutral";
type ActionTone = "danger" | "warning" | "neutral" | "success";
type SummaryTone = "danger" | "warning" | "neutral" | "success" | "info";

export type PtHubOverviewMode = "activation" | "operating";

export interface PtHubOverviewMetric {
  id: string;
  label: string;
  value: string | number;
  helper: string;
  href?: string;
  delta?: {
    value: string;
    tone: MetricTone;
  } | null;
  accent?: boolean;
}

export interface PtHubOverviewActionItem {
  id: string;
  label: string;
  badge: string;
  description: string;
  href: string;
  ctaLabel: string;
  tone: ActionTone;
  workspaceId?: string | null;
}

export interface PtHubOverviewChecklistItem {
  id: string;
  label: string;
  description: string;
  href: string;
  ctaLabel: string;
  complete: boolean;
}

export interface PtHubOverviewSummaryItem {
  id: string;
  label: string;
  value: string;
  detail?: string;
  tone?: SummaryTone;
}

export interface PtHubOverviewQuickAction {
  id: string;
  label: string;
  description: string;
  href: string;
}

export interface PtHubOverviewDashboardModel {
  mode: PtHubOverviewMode;
  modeLabel: string;
  modeDescription: string;
  setupCompletionPercent: number;
  metrics: PtHubOverviewMetric[];
  actionItems: PtHubOverviewActionItem[];
  launchChecklist: PtHubOverviewChecklistItem[];
  quickActions: PtHubOverviewQuickAction[];
  pipelineSummary: PtHubOverviewSummaryItem[];
  clientHealthSummary: PtHubOverviewSummaryItem[];
  businessSummary: PtHubOverviewSummaryItem[];
  billingSummary: PtHubOverviewSummaryItem[];
  clientsNeedingAttentionCount: number;
  latestCoachingSpace: PTWorkspaceSummary | null;
}

type OverviewDashboardParams = {
  stats: PTOverviewStats | null | undefined;
  analytics: PTAnalyticsSnapshot | null | undefined;
  readiness: PTProfileReadiness | null | undefined;
  profile: PTProfile | null | undefined;
  publicationState: PTPublicationState | null | undefined;
  workspaces: PTWorkspaceSummary[] | null | undefined;
  leads: PTLead[] | null | undefined;
  clients: PTClientSummary[] | null | undefined;
  subscription: PTSubscriptionSummary | null | undefined;
  revenue: PTRevenueSnapshot | null | undefined;
};

function buildMetricDelta(
  delta: number | null | undefined,
  suffix = "",
): PtHubOverviewMetric["delta"] {
  if (typeof delta !== "number" || Number.isNaN(delta)) return null;
  const rounded = Math.round(delta);
  return {
    value: `${rounded > 0 ? "+" : rounded < 0 ? "-" : ""}${Math.abs(rounded)}${suffix}`,
    tone: rounded === 0 ? "neutral" : rounded > 0 ? "positive" : "negative",
  };
}

function buildEarningsMetric(
  revenue: PTRevenueSnapshot | null | undefined,
): PtHubOverviewMetric {
  const revenueConnected = revenue?.revenueConnected === true;
  const monthlyEarningsValue =
    revenueConnected && revenue?.monthlyRevenueLabel
      ? revenue.monthlyRevenueLabel
      : "TBW";

  return {
    id: "monthly-earnings",
    label: "Monthly earnings",
    value: monthlyEarningsValue,
    helper: "This month",
    href: "/pt-hub/payments",
    delta: {
      value: revenueConnected ? "Live" : "Pending",
      tone: revenueConnected ? "positive" : "neutral",
    },
  };
}

function formatCount(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function sortChecklist(
  items: PtHubOverviewChecklistItem[],
): PtHubOverviewChecklistItem[] {
  return [...items].sort((left, right) => {
    if (left.complete === right.complete) return 0;
    return left.complete ? 1 : -1;
  });
}

function getProfileCompletion(
  readiness: PTProfileReadiness | null | undefined,
  profile: PTProfile | null | undefined,
  stats: PTOverviewStats | null | undefined,
) {
  return (
    readiness?.completionPercent ??
    profile?.completionPercent ??
    stats?.profileCompletionPercent ??
    0
  );
}

function getBusinessSetupCompletionPercent(params: {
  readiness: PTProfileReadiness | null | undefined;
  workspaces: PTWorkspaceSummary[];
}) {
  const readinessPercent = params.readiness?.completionPercent ?? 0;
  const workspacePercent = params.workspaces.length > 0 ? 100 : 0;

  return Math.round((readinessPercent + workspacePercent) / 2);
}

function getUnrepliedLeadCount(leads: PTLead[]) {
  return leads.filter((lead) => ["new", "reviewed"].includes(lead.status))
    .length;
}

function getPipelineLeadCount(leads: PTLead[]) {
  return leads.filter((lead) =>
    ["contacted", "consultation_booked"].includes(lead.status),
  ).length;
}

function getAcceptedLeadCount(leads: PTLead[]) {
  return leads.filter((lead) => lead.status === "accepted").length;
}

function getClientsNeedingAttention(clients: PTClientSummary[]) {
  const ids = new Set<string>();

  for (const client of clients) {
    if (
      client.hasOverdueCheckin ||
      client.onboardingIncomplete ||
      client.lifecycleState === "at_risk" ||
      client.riskFlags.length > 0
    ) {
      ids.add(client.id);
    }
  }

  return ids.size;
}

function getMostUrgentClient(
  clients: PTClientSummary[],
  predicate: (client: PTClientSummary) => boolean,
) {
  return [...clients].filter(predicate).sort((left, right) => {
    const overdueDelta =
      (right.overdueCheckinsCount ?? 0) - (left.overdueCheckinsCount ?? 0);
    if (overdueDelta !== 0) return overdueDelta;

    const rightTime = new Date(
      right.lastActivityAt ??
        right.lastClientReplyAt ??
        right.updatedAt ??
        right.createdAt ??
        0,
    ).getTime();
    const leftTime = new Date(
      left.lastActivityAt ??
        left.lastClientReplyAt ??
        left.updatedAt ??
        left.createdAt ??
        0,
    ).getTime();

    return leftTime - rightTime;
  })[0];
}

function getOverviewMode(params: {
  leads: PTLead[];
  workspaces: PTWorkspaceSummary[];
  clients: PTClientSummary[];
  profileCompletionPercent: number;
  isPublished: boolean;
}) {
  const activeCoachingSpaces = params.workspaces.filter(
    (workspace) => (workspace.clientCount ?? 0) > 0,
  ).length;
  const noBusinessActivity =
    params.clients.length === 0 && params.leads.length === 0;
  const lowProfileReadiness =
    params.profileCompletionPercent < 80 || !params.isPublished;
  const minimalWorkspaceActivity = activeCoachingSpaces === 0;

  return noBusinessActivity && (lowProfileReadiness || minimalWorkspaceActivity)
    ? "activation"
    : "operating";
}

function buildMetrics(params: {
  stats: PTOverviewStats | null | undefined;
  clientStats: ReturnType<typeof getPtClientBaseStats>;
  revenue: PTRevenueSnapshot | null | undefined;
}) {
  const leadDelta = buildMetricDelta(
    (params.stats?.applicationsThisMonth ?? 0) -
      (params.stats?.applicationsPreviousWindow ?? 0),
  );
  const overdueCheckinCount = params.clientStats.overdueCheckinClients;
  const onboardingInProgressCount =
    params.clientStats.onboardingIncompleteClients;

  return [
    buildEarningsMetric(params.revenue),
    {
      id: "active-clients",
      label: "Active clients",
      value: params.clientStats.activeClients,
      helper: "Across all workspaces",
      href: "/pt-hub/clients",
    },
    {
      id: "new-leads-month",
      label: "New leads",
      value: params.stats?.applicationsThisMonth ?? 0,
      helper: "This month",
      href: "/pt-hub/leads",
      delta: leadDelta,
    },
    {
      id: "checkins-due",
      label: "Check-ins due",
      value: overdueCheckinCount,
      helper: "Due or overdue",
      href: "/pt/checkins",
      delta:
        overdueCheckinCount > 0
          ? {
              value: `${overdueCheckinCount} overdue`,
              tone: "negative",
            }
          : {
              value: "All clear",
              tone: "positive",
            },
    },
    {
      id: "onboarding-in-progress",
      label: "Onboarding in progress",
      value: onboardingInProgressCount,
      helper: "Still onboarding",
      href: "/pt-hub/clients",
      delta:
        onboardingInProgressCount > 0
          ? {
              value: `${onboardingInProgressCount} waiting review`,
              tone: "neutral",
            }
          : {
              value: "No blockers",
              tone: "positive",
            },
    },
  ] satisfies PtHubOverviewMetric[];
}

function buildActionItems(params: {
  readiness: PTProfileReadiness | null | undefined;
  publicationState: PTPublicationState | null | undefined;
  workspaces: PTWorkspaceSummary[];
  leads: PTLead[];
  clients: PTClientSummary[];
  clientStats: ReturnType<typeof getPtClientBaseStats>;
  clientsNeedingAttentionCount: number;
  subscription: PTSubscriptionSummary | null | undefined;
}): PtHubOverviewActionItem[] {
  const actionItems = new Map<
    string,
    PtHubOverviewActionItem & { priority: number }
  >();
  const incompleteChecklist =
    params.readiness?.checklist.filter((item) => !item.complete) ?? [];
  const unrepliedLeadCount = getUnrepliedLeadCount(params.leads);
  const mostUrgentOverdueClient = getMostUrgentClient(
    params.clients,
    (client) => client.hasOverdueCheckin,
  );
  const mostUrgentAtRiskClient = getMostUrgentClient(
    params.clients,
    (client) =>
      client.lifecycleState === "at_risk" || client.riskFlags.length > 0,
  );
  const mostUrgentOnboardingClient = getMostUrgentClient(
    params.clients,
    (client) => client.onboardingIncomplete,
  );
  const mostUrgentAttentionClient =
    mostUrgentOverdueClient ??
    mostUrgentAtRiskClient ??
    mostUrgentOnboardingClient ??
    null;

  const upsertAction = (
    item: PtHubOverviewActionItem & { priority: number },
  ) => {
    const existing = actionItems.get(item.id);
    if (!existing || existing.priority < item.priority) {
      actionItems.set(item.id, item);
    }
  };

  if (unrepliedLeadCount > 0) {
    upsertAction({
      id: "unreplied-leads",
      label: "Reply to new leads",
      badge: formatCount(unrepliedLeadCount, "lead"),
      description:
        "These leads have not reached the contacted stage yet, so they are most likely to cool off first.",
      href: "/pt-hub/leads",
      ctaLabel: "Open lead inbox",
      tone: "danger",
      priority: 100,
    });
  }

  if (params.clientStats.overdueCheckinClients > 0) {
    upsertAction({
      id: "overdue-checkins",
      label: mostUrgentOverdueClient
        ? `${mostUrgentOverdueClient.displayName} is overdue for review`
        : "Review overdue check-ins",
      badge: formatCount(params.clientStats.overdueCheckinClients, "client"),
      description: mostUrgentOverdueClient
        ? `${params.clientStats.overdueCheckinClients} client(s) are overdue across your coaching spaces. Start in ${mostUrgentOverdueClient.workspaceName}.`
        : "Some clients are overdue for a check-in review or follow-up across your workspaces and need attention today.",
      href: mostUrgentOverdueClient
        ? `/pt/clients/${mostUrgentOverdueClient.id}`
        : "/pt-hub/clients",
      ctaLabel: mostUrgentOverdueClient
        ? `Open ${mostUrgentOverdueClient.workspaceName}`
        : "Review clients",
      tone: "danger",
      priority: 96,
      workspaceId: mostUrgentOverdueClient?.workspaceId ?? null,
    });
  }

  if (params.clientStats.atRiskClients > 0) {
    upsertAction({
      id: "at-risk-clients",
      label: mostUrgentAtRiskClient
        ? `${mostUrgentAtRiskClient.displayName} is showing risk signals`
        : "Check at-risk clients",
      badge: formatCount(params.clientStats.atRiskClients, "client"),
      description: mostUrgentAtRiskClient
        ? `${params.clientStats.atRiskClients} client(s) are carrying risk signals across the business. Start in ${mostUrgentAtRiskClient.workspaceName}.`
        : "These clients are carrying risk signals such as missed check-ins, low responsiveness, or inactivity across the business.",
      href: mostUrgentAtRiskClient
        ? `/pt/clients/${mostUrgentAtRiskClient.id}`
        : "/pt-hub/clients",
      ctaLabel: mostUrgentAtRiskClient
        ? `Open ${mostUrgentAtRiskClient.workspaceName}`
        : "View client health",
      tone: "warning",
      priority: 92,
      workspaceId: mostUrgentAtRiskClient?.workspaceId ?? null,
    });
  }

  if (params.clientStats.onboardingIncompleteClients > 0) {
    upsertAction({
      id: "incomplete-onboarding",
      label: mostUrgentOnboardingClient
        ? `${mostUrgentOnboardingClient.displayName} still needs onboarding`
        : "Finish client onboarding",
      badge: formatCount(
        params.clientStats.onboardingIncompleteClients,
        "client",
      ),
      description: mostUrgentOnboardingClient
        ? `${params.clientStats.onboardingIncompleteClients} client(s) are still missing onboarding steps. Start in ${mostUrgentOnboardingClient.workspaceName}.`
        : "Some clients are still missing onboarding steps, which makes delivery and accountability harder to manage.",
      href: mostUrgentOnboardingClient
        ? `/pt/clients/${mostUrgentOnboardingClient.id}`
        : "/pt-hub/clients",
      ctaLabel: mostUrgentOnboardingClient
        ? `Open ${mostUrgentOnboardingClient.workspaceName}`
        : "Open clients",
      tone: "warning",
      priority: 84,
      workspaceId: mostUrgentOnboardingClient?.workspaceId ?? null,
    });
  }

  if (incompleteChecklist.length > 0) {
    upsertAction({
      id: "profile-blockers",
      label: "Finish profile setup",
      badge: formatCount(incompleteChecklist.length, "blocker"),
      description:
        "Finish the missing coach-page basics so your public presence supports the business instead of holding it back.",
      href: "/pt-hub/profile",
      ctaLabel: "Open profile setup",
      tone: "danger",
      priority: 88,
    });
  }

  if (!params.publicationState?.isPublished) {
    upsertAction({
      id: "publish-profile",
      label: "Publish your public profile",
      badge: params.publicationState?.canPublish ? "Ready to publish" : "Draft",
      description: params.publicationState?.canPublish
        ? "Your coach page is ready to go live so the business can start collecting real inquiries."
        : "Finish the key setup blockers first, then publish the coach page so people can discover you.",
      href: "/pt-hub/profile",
      ctaLabel: params.publicationState?.canPublish
        ? "Publish coach page"
        : "Review setup",
      tone: params.publicationState?.canPublish ? "warning" : "danger",
      priority: 82,
    });
  }

  if (params.workspaces.length === 0) {
    upsertAction({
      id: "create-coaching-space",
      label: "Create your first coaching space",
      badge: "Not created",
      description:
        "Set up the first coaching space so the business has a delivery home for new and active clients.",
      href: "/pt-hub/workspaces",
      ctaLabel: "Create coaching space",
      tone: "warning",
      priority: 80,
    });
  }

  if (params.leads.length === 0) {
    upsertAction({
      id: "start-lead-flow",
      label: "Start lead flow",
      badge: "No leads yet",
      description:
        "Review the coach page, make sure the positioning is clear, and start sharing it to bring in the first inquiry.",
      href: "/pt-hub/profile/preview",
      ctaLabel: "Review coach page",
      tone: "neutral",
      priority: 64,
    });
  }

  if (
    params.clientStats.activeClients > 0 &&
    params.subscription?.billingConnected === false
  ) {
    upsertAction({
      id: "billing-manual",
      label: "Billing is still manual",
      badge: params.subscription.billingStatus || "Manual",
      description:
        "Client billing is not connected yet, so revenue tracking and invoice history are still limited on this account.",
      href: "/pt-hub/payments",
      ctaLabel: "Open billing",
      tone: "neutral",
      priority: 68,
    });
  }

  if (actionItems.size === 0 && params.clientsNeedingAttentionCount > 0) {
    upsertAction({
      id: "client-attention",
      label: mostUrgentAttentionClient
        ? `${mostUrgentAttentionClient.displayName} needs coach attention`
        : "Review client health",
      badge: formatCount(params.clientsNeedingAttentionCount, "client"),
      description: mostUrgentAttentionClient
        ? `${params.clientsNeedingAttentionCount} client(s) still need a coach check. Start in ${mostUrgentAttentionClient.workspaceName}.`
        : "There are no urgent lead or billing blockers, but some clients still deserve a quick operational check.",
      href: mostUrgentAttentionClient
        ? `/pt/clients/${mostUrgentAttentionClient.id}`
        : "/pt-hub/clients",
      ctaLabel: mostUrgentAttentionClient
        ? `Open ${mostUrgentAttentionClient.workspaceName}`
        : "Open clients",
      tone: "neutral",
      priority: 60,
      workspaceId: mostUrgentAttentionClient?.workspaceId ?? null,
    });
  }

  return Array.from(actionItems.values())
    .sort((left, right) => right.priority - left.priority)
    .map(({ priority, ...item }) => item);
}

function buildLaunchChecklist(params: {
  readiness: PTProfileReadiness | null | undefined;
  publicationState: PTPublicationState | null | undefined;
  workspaces: PTWorkspaceSummary[];
  leads: PTLead[];
  clients: PTClientSummary[];
}): PtHubOverviewChecklistItem[] {
  const readinessChecklist =
    params.readiness?.checklist.map((item) => ({
      id: item.key,
      label: item.label,
      description: item.guidance,
      href: item.href,
      ctaLabel: item.complete ? "Review" : "Fix now",
      complete: item.complete,
    })) ?? [];

  const customItems: PtHubOverviewChecklistItem[] = [
    {
      id: "publish-profile",
      label: "Publish your public profile",
      description:
        "Make the profile live so the coach page can start collecting real inquiries.",
      href: "/pt-hub/profile",
      ctaLabel: params.publicationState?.isPublished
        ? "View profile"
        : params.publicationState?.canPublish
          ? "Publish"
          : "Finish setup",
      complete: Boolean(params.publicationState?.isPublished),
    },
    {
      id: "create-coaching-space",
      label: "Create your first coaching space",
      description:
        "Set up the first coaching space where clients, plans, and coaching operations will live.",
      href: "/pt-hub/workspaces",
      ctaLabel:
        params.workspaces.length > 0
          ? "Open coaching spaces"
          : "Create coaching space",
      complete: params.workspaces.length > 0,
    },
    {
      id: "acquire-first-lead",
      label: "Bring in your first lead",
      description:
        "Share the public profile once it looks right so the first inquiry has somewhere to come from.",
      href: "/pt-hub/profile/preview",
      ctaLabel: "Open preview",
      complete: params.leads.length > 0,
    },
    {
      id: "convert-first-client",
      label: "Land your first client",
      description:
        "Once leads are coming in, keep one coaching space ready so the first client can move straight into service.",
      href: "/pt-hub/clients",
      ctaLabel: "Open clients",
      complete: params.clients.length > 0,
    },
  ];

  return sortChecklist([...readinessChecklist, ...customItems]).slice(0, 8);
}

function buildQuickActions(): PtHubOverviewQuickAction[] {
  return [
    {
      id: "coaching-spaces",
      label: "Coaching spaces",
      description: "Create or open the spaces where coaching delivery happens.",
      href: "/pt-hub/workspaces",
    },
    {
      id: "lead-inbox",
      label: "Lead inbox",
      description: "Review inquiries and move them into the pipeline.",
      href: "/pt-hub/leads",
    },
    {
      id: "clients",
      label: "Clients",
      description: "Check onboarding, risk, and delivery follow-up.",
      href: "/pt-hub/clients",
    },
    {
      id: "coach-profile",
      label: "Coach profile",
      description: "Refine positioning, visuals, and public trust signals.",
      href: "/pt-hub/profile",
    },
  ];
}

function buildPipelineSummary(params: {
  leads: PTLead[];
  stats: PTOverviewStats | null | undefined;
}) {
  return [
    {
      id: "awaiting-response",
      label: "Awaiting response",
      value: formatCount(getUnrepliedLeadCount(params.leads), "lead"),
      tone: "danger",
    },
    {
      id: "pipeline-moving",
      label: "In progress",
      value: formatCount(getPipelineLeadCount(params.leads), "lead"),
      tone: "info",
    },
    {
      id: "accepted",
      label: "Accepted",
      value: formatCount(getAcceptedLeadCount(params.leads), "lead"),
      tone: "success",
    },
    {
      id: "new-this-month",
      label: "New this month",
      value: formatCount(params.stats?.applicationsThisMonth ?? 0, "lead"),
      tone: "info",
    },
  ] satisfies PtHubOverviewSummaryItem[];
}

function buildClientHealthSummary(params: {
  clientStats: ReturnType<typeof getPtClientBaseStats>;
  clientsNeedingAttentionCount: number;
}) {
  return [
    {
      id: "needs-attention",
      label: "Needs attention",
      value: formatCount(params.clientsNeedingAttentionCount, "client"),
      tone: "warning",
    },
    {
      id: "at-risk",
      label: "At risk",
      value: formatCount(params.clientStats.atRiskClients, "client"),
      tone: "danger",
    },
    {
      id: "checkin-overdue",
      label: "Check-ins overdue",
      value: formatCount(params.clientStats.overdueCheckinClients, "client"),
      tone: "warning",
    },
    {
      id: "onboarding-incomplete",
      label: "Onboarding incomplete",
      value: formatCount(
        params.clientStats.onboardingIncompleteClients,
        "client",
      ),
      tone: "info",
    },
  ] satisfies PtHubOverviewSummaryItem[];
}

function buildBusinessSummary(params: {
  stats: PTOverviewStats | null | undefined;
  workspaces: PTWorkspaceSummary[];
  readiness: PTProfileReadiness | null | undefined;
  publicationState: PTPublicationState | null | undefined;
  leads: PTLead[];
}) {
  const latestWorkspace = params.workspaces[0] ?? null;
  const unpublishedBlockers =
    params.readiness?.checklist.filter((item) => !item.complete).length ?? 0;

  return [
    {
      id: "business-state",
      label: "Business state",
      value: params.stats?.businessHealthLabel ?? "Setup in progress",
      detail:
        "A quick read on whether the business is still being set up or already building momentum.",
      tone: "info",
    },
    {
      id: "workspace-system",
      label: "Workspace system",
      value: formatCount(params.workspaces.length, "space"),
      detail: latestWorkspace
        ? `Latest workspace: ${latestWorkspace.name}`
        : "Create the first coaching space so clients have a real delivery home.",
      tone: "neutral",
    },
    {
      id: "coach-page",
      label: "Coach page",
      value: params.publicationState?.isPublished ? "Live" : "Draft",
      detail: params.publicationState?.isPublished
        ? "Your public-facing page is live and can support inbound lead flow."
        : "The public-facing page is not live yet, so discovery and lead capture are still limited.",
      tone: params.publicationState?.isPublished ? "success" : "warning",
    },
    {
      id: "profile-readiness",
      label: "Profile readiness",
      value: `${params.readiness?.completionPercent ?? 0}%`,
      detail:
        unpublishedBlockers > 0
          ? `${unpublishedBlockers} profile item(s) still need attention.`
          : params.leads.length > 0
            ? "The coach page is ready to support real demand."
            : "The coach page is in a healthy place and ready to support lead generation.",
      tone: unpublishedBlockers > 0 ? "warning" : "success",
    },
  ] satisfies PtHubOverviewSummaryItem[];
}

function buildBillingSummary(params: {
  subscription: PTSubscriptionSummary | null | undefined;
  revenue: PTRevenueSnapshot | null | undefined;
}) {
  return [
    {
      id: "plan",
      label: "Platform plan",
      value: params.subscription?.planName ?? "Repsync Pro",
      detail: "The current subscription backing this PT Hub account",
      tone: "info",
    },
    {
      id: "billing-status",
      label: "Billing state",
      value: params.subscription?.billingStatus ?? "Billing placeholder",
      detail:
        params.subscription?.billingConnected === true
          ? "Billing is connected"
          : "Billing is still manual or placeholder-only",
      tone:
        params.subscription?.billingConnected === true ? "success" : "warning",
    },
    {
      id: "monthly-revenue",
      label: "Monthly revenue",
      value: params.revenue?.monthlyRevenueLabel ?? "Not connected",
      detail: "Live revenue will surface here once billing is connected",
      tone: params.revenue?.revenueConnected === true ? "success" : "info",
    },
    {
      id: "active-paying-clients",
      label: "Active paying clients",
      value:
        params.revenue?.activePayingClientsLabel ??
        formatCount(params.revenue?.potentialActiveClients ?? 0, "client"),
      detail:
        params.revenue?.revenueConnected === true
          ? "Connected billing metric"
          : "Closest current proxy based on active clients",
      tone: params.revenue?.revenueConnected === true ? "success" : "info",
    },
  ] satisfies PtHubOverviewSummaryItem[];
}

export function getPtHubOverviewDashboardModel(
  params: OverviewDashboardParams,
): PtHubOverviewDashboardModel {
  const workspaces = params.workspaces ?? [];
  const leads = params.leads ?? [];
  const clients = params.clients ?? [];
  const clientStats = getPtClientBaseStats(clients);
  const profileCompletionPercent = getProfileCompletion(
    params.readiness,
    params.profile,
    params.stats,
  );
  const setupCompletionPercent = getBusinessSetupCompletionPercent({
    readiness: params.readiness,
    workspaces,
  });
  const isPublished = Boolean(params.publicationState?.isPublished);
  const mode = getOverviewMode({
    leads,
    workspaces,
    clients,
    profileCompletionPercent,
    isPublished,
  });
  const clientsNeedingAttentionCount = getClientsNeedingAttention(clients);

  return {
    mode,
    modeLabel:
      mode === "activation" ? "Business foundations" : "Operating dashboard",
    modeDescription:
      mode === "activation"
        ? "Build the business foundation across workspace setup, coach-page trust, and lead readiness."
        : "Focus on the next decisions that keep leads moving, clients healthy, and delivery on track.",
    setupCompletionPercent,
    metrics: buildMetrics({
      stats: params.stats,
      clientStats,
      revenue: params.revenue,
    }),
    actionItems: buildActionItems({
      readiness: params.readiness,
      publicationState: params.publicationState,
      workspaces,
      leads,
      clients,
      clientStats,
      clientsNeedingAttentionCount,
      subscription: params.subscription,
    }),
    launchChecklist: buildLaunchChecklist({
      readiness: params.readiness,
      publicationState: params.publicationState,
      workspaces,
      leads,
      clients,
    }),
    quickActions: buildQuickActions(),
    pipelineSummary: buildPipelineSummary({
      leads,
      stats: params.stats,
    }),
    clientHealthSummary: buildClientHealthSummary({
      clientStats,
      clientsNeedingAttentionCount,
    }),
    businessSummary: buildBusinessSummary({
      stats: params.stats,
      workspaces,
      readiness: params.readiness,
      publicationState: params.publicationState,
      leads,
    }),
    billingSummary: buildBillingSummary({
      subscription: params.subscription,
      revenue: params.revenue,
    }),
    clientsNeedingAttentionCount,
    latestCoachingSpace: workspaces[0] ?? null,
  };
}

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

export type PtHubOverviewMode = "activation" | "operating";

export interface PtHubOverviewMetric {
  id: string;
  label: string;
  value: string | number;
  helper: string;
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
  metrics: PtHubOverviewMetric[];
  actionItems: PtHubOverviewActionItem[];
  launchChecklist: PtHubOverviewChecklistItem[];
  quickActions: PtHubOverviewQuickAction[];
  pipelineSummary: PtHubOverviewSummaryItem[];
  clientHealthSummary: PtHubOverviewSummaryItem[];
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
  mode: PtHubOverviewMode;
  workspaces: PTWorkspaceSummary[];
  leads: PTLead[];
  stats: PTOverviewStats | null | undefined;
  clientsNeedingAttentionCount: number;
  clientStats: ReturnType<typeof getPtClientBaseStats>;
  profileCompletionPercent: number;
  readiness: PTProfileReadiness | null | undefined;
  publicationState: PTPublicationState | null | undefined;
  revenue: PTRevenueSnapshot | null | undefined;
}) {
  const applicationsDelta = buildMetricDelta(
    (params.stats?.applicationsThisMonth ?? 0) -
      (params.stats?.applicationsPreviousWindow ?? 0),
  );

  if (params.mode === "activation") {
    const publishBlockerCount =
      (params.readiness?.checklist.filter((item) => !item.complete).length ??
        0) + (params.publicationState?.isPublished ? 0 : 1);

    return [
      {
        id: "profile-readiness",
        label: "Profile readiness",
        value: `${params.profileCompletionPercent}%`,
        helper: "How close the public profile is to launch-ready",
        accent: true,
      },
      {
        id: "launch-blockers",
        label: "Launch blockers",
        value: publishBlockerCount,
        helper: "Remaining items before the profile is fully live",
      },
      {
        id: "coaching-spaces",
        label: "Coaching spaces",
        value: params.workspaces.length,
        helper: "Create the first coaching space before you start coaching clients",
      },
      {
        id: "new-leads-month",
        label: "New leads this month",
        value: params.stats?.applicationsThisMonth ?? 0,
        helper: "Early demand signal from your public profile",
        delta: applicationsDelta,
      },
    ] satisfies PtHubOverviewMetric[];
  }

  return [
    {
      id: "awaiting-response",
      label: "Awaiting response",
      value: getUnrepliedLeadCount(params.leads),
      helper: "Leads still waiting to hear from you",
      accent: true,
    },
    {
      id: "clients-needing-attention",
      label: "Clients needing attention",
      value: params.clientsNeedingAttentionCount,
      helper: "At risk, overdue, or stuck onboarding",
    },
    {
      id: "checkins-overdue",
      label: "Check-ins overdue",
      value: params.clientStats.overdueCheckinClients,
      helper: "Clients waiting on a check-in follow-up",
    },
    params.revenue?.revenueConnected
      ? {
          id: "monthly-revenue",
          label: "Monthly revenue",
          value: params.revenue.monthlyRevenueLabel,
          helper: "Live billing revenue for this month",
        }
      : {
          id: "new-leads-month",
          label: "New leads this month",
          value: params.stats?.applicationsThisMonth ?? 0,
          helper: "30-day lead flow into your business",
          delta: applicationsDelta,
        },
  ] satisfies PtHubOverviewMetric[];
}

function buildActivationActions(params: {
  readiness: PTProfileReadiness | null | undefined;
  publicationState: PTPublicationState | null | undefined;
  workspaces: PTWorkspaceSummary[];
  leads: PTLead[];
}): PtHubOverviewActionItem[] {
  const actionItems: Array<PtHubOverviewActionItem & { priority: number }> = [];
  const incompleteChecklist =
    params.readiness?.checklist.filter((item) => !item.complete) ?? [];

  if (incompleteChecklist.length > 0) {
    actionItems.push({
      id: "profile-blockers",
      label: "Finish profile setup",
      badge: formatCount(incompleteChecklist.length, "blocker"),
      description:
        "Complete the missing profile basics so prospects can trust the page and take action.",
      href: "/pt-hub/profile",
      ctaLabel: "Complete profile",
      tone: "danger",
      priority: 100,
    });
  }

  if (!params.publicationState?.isPublished) {
    actionItems.push({
      id: "publish-profile",
      label: "Publish your public profile",
      badge: params.publicationState?.canPublish ? "Ready to publish" : "Draft",
      description: params.publicationState?.canPublish
        ? "Your page has the key details needed to go live and start attracting leads."
        : "Finish the setup blockers first, then publish the profile so people can find you.",
      href: "/pt-hub/profile",
      ctaLabel: params.publicationState?.canPublish
        ? "Publish profile"
        : "Review blockers",
      tone: params.publicationState?.canPublish ? "warning" : "danger",
      priority: 90,
    });
  }

  if (params.workspaces.length === 0) {
    actionItems.push({
      id: "create-coaching-space",
      label: "Create your first coaching space",
      badge: "Not created",
      description:
        "Set up the first coaching space so clients have somewhere to land once they convert.",
      href: "/pt-hub/workspaces",
      ctaLabel: "Create coaching space",
      tone: "warning",
      priority: 80,
    });
  }

  if (params.leads.length === 0) {
    actionItems.push({
      id: "start-lead-flow",
      label: "Start lead flow",
      badge: "No leads yet",
      description:
        "Open the public profile preview, sanity-check the page, and start sharing it to bring in the first inquiry.",
      href: "/pt-hub/profile/preview",
      ctaLabel: "Open preview",
      tone: "neutral",
      priority: 70,
    });
  }

  return actionItems
    .sort((left, right) => right.priority - left.priority)
    .map(({ priority, ...item }) => item);
}

function buildOperatingActions(params: {
  leads: PTLead[];
  clientStats: ReturnType<typeof getPtClientBaseStats>;
  clientsNeedingAttentionCount: number;
  readiness: PTProfileReadiness | null | undefined;
  publicationState: PTPublicationState | null | undefined;
  subscription: PTSubscriptionSummary | null | undefined;
}): PtHubOverviewActionItem[] {
  const actionItems: Array<PtHubOverviewActionItem & { priority: number }> = [];
  const unrepliedLeadCount = getUnrepliedLeadCount(params.leads);

  if (unrepliedLeadCount > 0) {
    actionItems.push({
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
    actionItems.push({
      id: "overdue-checkins",
      label: "Review overdue check-ins",
      badge: formatCount(params.clientStats.overdueCheckinClients, "client"),
      description:
        "Some clients are overdue for a check-in review or follow-up and need attention today.",
      href: "/pt-hub/clients",
      ctaLabel: "Review clients",
      tone: "danger",
      priority: 95,
    });
  }

  if (params.clientStats.atRiskClients > 0) {
    actionItems.push({
      id: "at-risk-clients",
      label: "Check at-risk clients",
      badge: formatCount(params.clientStats.atRiskClients, "client"),
      description:
        "These clients are carrying risk signals such as missed check-ins, low responsiveness, or inactivity.",
      href: "/pt-hub/clients",
      ctaLabel: "View client health",
      tone: "warning",
      priority: 90,
    });
  }

  if (params.clientStats.onboardingIncompleteClients > 0) {
    actionItems.push({
      id: "incomplete-onboarding",
      label: "Finish client onboarding",
      badge: formatCount(
        params.clientStats.onboardingIncompleteClients,
        "client",
      ),
      description:
        "A few clients are still missing setup steps, which makes delivery and accountability harder to manage.",
      href: "/pt-hub/clients",
      ctaLabel: "Open clients",
      tone: "warning",
      priority: 82,
    });
  }

  if (!params.publicationState?.isPublished) {
    const blockerCount =
      params.readiness?.checklist.filter((item) => !item.complete).length ?? 0;
    actionItems.push({
      id: "publish-profile",
      label: "Finish publishing your profile",
      badge:
        blockerCount > 0 ? formatCount(blockerCount, "blocker") : "Unpublished",
      description:
        "The public profile is still not fully live, which limits how new leads can discover and contact you.",
      href: "/pt-hub/profile",
      ctaLabel: "Finish profile",
      tone: blockerCount > 0 ? "warning" : "neutral",
      priority: 74,
    });
  }

  if (
    params.clientStats.activeClients > 0 &&
    params.subscription?.billingConnected === false
  ) {
    actionItems.push({
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

  if (actionItems.length === 0 && params.clientsNeedingAttentionCount > 0) {
    actionItems.push({
      id: "client-attention",
      label: "Review client health",
      badge: formatCount(params.clientsNeedingAttentionCount, "client"),
      description:
        "There are no urgent lead or billing blockers, but some clients still deserve a quick operational check.",
      href: "/pt-hub/clients",
      ctaLabel: "Open clients",
      tone: "neutral",
      priority: 60,
    });
  }

  return actionItems
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
      id: "coach-profile",
      label: "Coach profile",
      description: "Edit your positioning, visuals, and profile details.",
      href: "/pt-hub/profile",
    },
    {
      id: "profile-preview",
      label: "Public preview",
      description: "See the exact page prospects will visit.",
      href: "/pt-hub/profile/preview",
    },
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
      detail: "New or reviewed leads that still need a reply",
    },
    {
      id: "pipeline-moving",
      label: "In progress",
      value: formatCount(getPipelineLeadCount(params.leads), "lead"),
      detail: "Contacted leads and booked consultations",
    },
    {
      id: "accepted",
      label: "Accepted",
      value: formatCount(getAcceptedLeadCount(params.leads), "lead"),
      detail: "Leads that have already converted or been accepted",
    },
    {
      id: "new-this-month",
      label: "New this month",
      value: formatCount(params.stats?.applicationsThisMonth ?? 0, "lead"),
      detail: "30-day inbound volume across the business",
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
      detail: "Unique clients with at-risk, overdue, or onboarding issues",
    },
    {
      id: "at-risk",
      label: "At risk",
      value: formatCount(params.clientStats.atRiskClients, "client"),
      detail: "Clients showing risk signals or marked at risk",
    },
    {
      id: "checkin-overdue",
      label: "Check-ins overdue",
      value: formatCount(params.clientStats.overdueCheckinClients, "client"),
      detail: "Clients currently behind on check-ins",
    },
    {
      id: "onboarding-incomplete",
      label: "Onboarding incomplete",
      value: formatCount(
        params.clientStats.onboardingIncompleteClients,
        "client",
      ),
      detail: "Clients still missing setup progress",
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
    },
    {
      id: "billing-status",
      label: "Billing state",
      value: params.subscription?.billingStatus ?? "Billing placeholder",
      detail:
        params.subscription?.billingConnected === true
          ? "Billing is connected"
          : "Billing is still manual or placeholder-only",
    },
    {
      id: "monthly-revenue",
      label: "Monthly revenue",
      value: params.revenue?.monthlyRevenueLabel ?? "Not connected",
      detail: "Live revenue will surface here once billing is connected",
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
      mode === "activation" ? "Launch checklist" : "Operating dashboard",
    modeDescription:
      mode === "activation"
        ? "Focus on the few setup moves that get the business ready to take its first real leads and clients."
        : "Focus on the next decisions that keep leads moving, clients healthy, and delivery on track.",
    metrics: buildMetrics({
      mode,
      workspaces,
      leads,
      stats: params.stats,
      clientsNeedingAttentionCount,
      clientStats,
      profileCompletionPercent,
      readiness: params.readiness,
      publicationState: params.publicationState,
      revenue: params.revenue,
    }),
    actionItems:
      mode === "activation"
        ? buildActivationActions({
            readiness: params.readiness,
            publicationState: params.publicationState,
            workspaces,
            leads,
          })
        : buildOperatingActions({
            leads,
            clientStats,
            clientsNeedingAttentionCount,
            readiness: params.readiness,
            publicationState: params.publicationState,
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
    billingSummary: buildBillingSummary({
      subscription: params.subscription,
      revenue: params.revenue,
    }),
    clientsNeedingAttentionCount,
    latestCoachingSpace: workspaces[0] ?? null,
  };
}

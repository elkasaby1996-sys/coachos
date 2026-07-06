import { getPtClientBaseStats } from "./pt-hub";
import { isClientAtRisk } from "../../../lib/client-lifecycle";
import {
  getSemanticToneForStatus,
  type SemanticTone,
} from "../../../lib/semantic-status";
import { routes } from "../../../lib/routes";
import type {
  PTActivationSummary,
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

type MetricTone = SemanticTone;
type ActionTone = SemanticTone;
type SummaryTone = SemanticTone;

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

export type PtHubActivationChecklistStatus =
  | "complete"
  | "next"
  | "incomplete"
  | "optional";

export interface PtHubActivationChecklistItem {
  id: string;
  title: string;
  description: string;
  status: PtHubActivationChecklistStatus;
  optional: boolean;
  href: string;
  ctaLabel: string;
}

export interface PtHubFirstClientApplicationPath {
  title: string;
  description: string;
  href: string;
  ctaLabel: string;
}

export interface PtHubFirstClientGuidance {
  invite: {
    title: string;
    description: string;
    ctaLabel: string;
  };
  applications: PtHubFirstClientApplicationPath;
}

export interface PtHubActivationChecklistModel {
  items: PtHubActivationChecklistItem[];
  nextItem: PtHubActivationChecklistItem | null;
  coreCompletedCount: number;
  coreTotalCount: number;
  coreComplete: boolean;
  optionalItem: PtHubActivationChecklistItem;
  firstClientGuidance: PtHubFirstClientGuidance | null;
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
  href?: string;
  ctaLabel?: string;
  workspaceId?: string | null;
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
  activationChecklist: PtHubActivationChecklistModel | null;
  activationChecklistLoading?: boolean;
  activationChecklistError?: boolean;
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
  activationSummary?: PTActivationSummary | null | undefined;
  activationSummaryLoading?: boolean;
  activationSummaryError?: boolean;
};

function buildMetricDelta(
  delta: number | null | undefined,
  suffix = "",
): PtHubOverviewMetric["delta"] {
  if (typeof delta !== "number" || Number.isNaN(delta)) return null;
  const rounded = Math.round(delta);
  return {
    value: `${rounded > 0 ? "+" : rounded < 0 ? "-" : ""}${Math.abs(rounded)}${suffix}`,
    tone: rounded === 0 ? "neutral" : rounded > 0 ? "info" : "danger",
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

function getClientActivationHref(
  firstClientId: string | null | undefined,
  fallbackHref: string,
) {
  return firstClientId ? `/pt/clients/${firstClientId}` : fallbackHref;
}

function getWorkspaceTeamHref(summary: PTActivationSummary) {
  return summary.activationWorkspaceSlug
    ? routes.workspaceSettings(summary.activationWorkspaceSlug, "team")
    : "/pt-hub/workspaces";
}

export function getPtHubFirstClientApplicationPath(params: {
  profileComplete: boolean;
  profilePublished: boolean;
}): PtHubFirstClientApplicationPath {
  if (!params.profileComplete) {
    return {
      title: "Get new applications",
      description:
        "Use your public profile so new clients can apply to work with you.",
      href: "/pt-hub/profile",
      ctaLabel: "Complete profile",
    };
  }

  if (!params.profilePublished) {
    return {
      title: "Get new applications",
      description:
        "Use your public profile so new clients can apply to work with you.",
      href: "/pt-hub/profile",
      ctaLabel: "Publish profile",
    };
  }

  return {
    title: "Get new applications",
    description:
      "Use your public profile so new clients can apply to work with you.",
    href: "/pt-hub/leads",
    ctaLabel: "Review leads",
  };
}

export function getPtHubActivationChecklistModel(
  summary: PTActivationSummary | null | undefined,
): PtHubActivationChecklistModel | null {
  if (!summary) return null;

  const coreDefinitions = [
    {
      id: "workspace",
      title: "Create first workspace",
      description:
        "Set up the coaching space where clients, plans, and check-ins will live.",
      complete: summary.workspaceExists,
      href: summary.workspaceExists
        ? "/pt-hub/workspaces"
        : "/pt/onboarding/workspace",
      ctaLabel: summary.workspaceExists
        ? "Open workspaces"
        : "Create workspace",
    },
    {
      id: "profile",
      title: "Complete marketplace profile",
      description:
        "Add the profile basics clients need before they trust your offer.",
      complete: summary.profileComplete,
      href: "/pt-hub/profile",
      ctaLabel: summary.profileComplete ? "Review profile" : "Complete profile",
    },
    {
      id: "publish",
      title: "Publish profile",
      description:
        "Make your coach page live so clients can find or validate you.",
      complete: summary.profilePublished,
      href: "/pt-hub/profile",
      ctaLabel: summary.profilePublished ? "View profile" : "Publish profile",
    },
    {
      id: "first-client",
      title: "Add/get first client",
      description:
        "Choose whether to invite someone you already coach or collect new applications.",
      complete: summary.hasFirstClient,
      href: "/pt-hub/clients",
      ctaLabel: summary.hasFirstClient ? "Open client" : "Choose client path",
    },
    {
      id: "workout",
      title: "Assign first workout",
      description: "Give the client their first training action in RepSync.",
      complete: summary.hasWorkoutAssigned,
      href: getClientActivationHref(
        summary.firstClientId,
        "/pt/templates/workouts",
      ),
      ctaLabel: summary.hasWorkoutAssigned
        ? "Review workouts"
        : "Assign workout",
    },
    {
      id: "nutrition",
      title: "Assign first nutrition plan",
      description: "Add the first nutrition guidance once the client is ready.",
      complete: summary.hasNutritionAssigned,
      href: getClientActivationHref(
        summary.firstClientId,
        "/pt/nutrition-programs",
      ),
      ctaLabel: summary.hasNutritionAssigned
        ? "Review nutrition"
        : "Assign nutrition",
    },
    {
      id: "check-in",
      title: "Assign first check-in",
      description:
        "Create the first feedback loop so progress does not go quiet.",
      complete: summary.hasCheckInAssigned,
      href: getClientActivationHref(
        summary.firstClientId,
        "/pt/checkins/templates",
      ),
      ctaLabel: summary.hasCheckInAssigned
        ? "Review check-ins"
        : "Assign check-in",
    },
  ];

  const nextCoreId = coreDefinitions.find((item) => !item.complete)?.id ?? null;
  const coreItems = coreDefinitions.map((item) => ({
    id: item.id,
    title: item.title,
    description: item.description,
    href: item.href,
    ctaLabel: item.ctaLabel,
    optional: false,
    status: item.complete
      ? "complete"
      : item.id === nextCoreId
        ? "next"
        : "incomplete",
  })) satisfies PtHubActivationChecklistItem[];
  const optionalItem = {
    id: "co-coach",
    title: "Invite assistant/co-coach",
    description:
      "Optional: bring in help once the first coaching flow is moving.",
    href: getWorkspaceTeamHref(summary),
    ctaLabel: summary.hasCoCoachInvitedOrActive
      ? "Review team"
      : "Invite co-coach",
    optional: true,
    status: summary.hasCoCoachInvitedOrActive ? "complete" : "optional",
  } satisfies PtHubActivationChecklistItem;

  return {
    items: [...coreItems, optionalItem],
    nextItem: coreItems.find((item) => item.status === "next") ?? null,
    coreCompletedCount: summary.coreCompletedCount,
    coreTotalCount: summary.coreTotalCount,
    coreComplete: summary.coreCompletedCount >= summary.coreTotalCount,
    optionalItem,
    firstClientGuidance: summary.hasFirstClient
      ? null
      : {
          invite: {
            title: "Invite an existing client",
            description:
              "Already coach someone? Send them an invite and bring them into this workspace.",
            ctaLabel: "Invite client",
          },
          applications: getPtHubFirstClientApplicationPath({
            profileComplete: summary.profileComplete,
            profilePublished: summary.profilePublished,
          }),
        },
  };
}

export function shouldShowPtHubActivationChecklist(
  checklist: PtHubActivationChecklistModel | null | undefined,
): checklist is PtHubActivationChecklistModel {
  return Boolean(checklist && !checklist.coreComplete);
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
  return leads.filter((lead) => lead.status === "new").length;
}

function getPipelineLeadCount(leads: PTLead[]) {
  return leads.filter((lead) =>
    ["contacted", "approved_pending_workspace"].includes(lead.status),
  ).length;
}

function getAcceptedLeadCount(leads: PTLead[]) {
  return leads.filter((lead) => lead.status === "converted").length;
}

function getClientsNeedingAttention(clients: PTClientSummary[]) {
  const ids = new Set<string>();

  for (const client of clients) {
    if (
      client.hasOverdueCheckin ||
      client.onboardingIncomplete ||
      isClientAtRisk(client)
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
    {
      id: "monthly-earnings",
      label: "Monthly earnings",
      value: params.revenue?.monthlyRevenueLabel ?? "Not connected",
      helper:
        params.revenue?.revenueConnected === true
          ? "Current month revenue"
          : "Billing not connected yet",
      href: "/pt-hub/payments",
    },
    {
      id: "active-clients",
      label: "Active clients",
      value: params.clientStats.activeClients,
      helper:
        params.clientStats.activeClients > 0
          ? "Clients in service"
          : "No active clients yet",
      href: "/pt-hub/clients",
    },
    {
      id: "new-leads-month",
      label: "New leads",
      value: params.stats?.applicationsThisMonth ?? 0,
      helper:
        (params.stats?.applicationsThisMonth ?? 0) > 0
          ? "Leads this month"
          : "No new leads this month",
      href: "/pt-hub/leads",
      delta: leadDelta,
    },
    {
      id: "checkins-due",
      label: "Check-ins due",
      value: overdueCheckinCount,
      helper:
        overdueCheckinCount > 0 ? "Needs review today" : "No reviews waiting",
      href: "/pt/checkins",
      delta:
        overdueCheckinCount > 0
          ? {
              value: `${overdueCheckinCount} overdue`,
              tone: getSemanticToneForStatus("Overdue"),
            }
          : {
              value: "All clear",
              tone: getSemanticToneForStatus("All clear"),
            },
    },
    {
      id: "onboarding-in-progress",
      label: "Onboarding in progress",
      value: onboardingInProgressCount,
      helper:
        onboardingInProgressCount > 0
          ? "Clients still entering service"
          : "No setup blockers",
      href: "/pt-hub/clients",
      delta:
        onboardingInProgressCount > 0
          ? {
              value: `${onboardingInProgressCount} waiting review`,
              tone: getSemanticToneForStatus("Waiting review"),
            }
          : {
              value: "No blockers",
              tone: getSemanticToneForStatus("No blockers"),
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
  activationChecklist: PtHubActivationChecklistModel | null;
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
  const mostUrgentAtRiskClient = getMostUrgentClient(params.clients, (client) =>
    isClientAtRisk(client),
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
      tone: getSemanticToneForStatus("Awaiting response"),
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
        ? "Review the check-in and follow up before the next client touchpoint."
        : "Some clients are overdue for a check-in review or follow-up across your workspaces and need attention today.",
      href: mostUrgentOverdueClient
        ? `/pt/clients/${mostUrgentOverdueClient.id}`
        : "/pt-hub/clients",
      ctaLabel: mostUrgentOverdueClient
        ? `Open ${mostUrgentOverdueClient.workspaceName}`
        : "Review clients",
      tone: getSemanticToneForStatus("Overdue"),
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
        ? "Review recent check-ins, replies, and activity before the risk spreads."
        : "These clients have missed check-ins, low replies, or recent inactivity.",
      href: mostUrgentAtRiskClient
        ? `/pt/clients/${mostUrgentAtRiskClient.id}`
        : "/pt-hub/clients",
      ctaLabel: mostUrgentAtRiskClient
        ? `Open ${mostUrgentAtRiskClient.workspaceName}`
        : "View client health",
      tone: getSemanticToneForStatus("At risk"),
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
        ? "Finish the missing onboarding steps so plans and check-ins stay easy to manage."
        : "Some clients are still missing onboarding steps, which makes plans and check-ins harder to manage.",
      href: mostUrgentOnboardingClient
        ? `/pt/clients/${mostUrgentOnboardingClient.id}`
        : "/pt-hub/clients",
      ctaLabel: mostUrgentOnboardingClient
        ? `Open ${mostUrgentOnboardingClient.workspaceName}`
        : "Open clients",
      tone: getSemanticToneForStatus("Onboarding incomplete"),
      priority: 84,
      workspaceId: mostUrgentOnboardingClient?.workspaceId ?? null,
    });
  }

  if (!params.activationChecklist && incompleteChecklist.length > 0) {
    upsertAction({
      id: "profile-blockers",
      label: "Finish profile setup",
      badge: formatCount(incompleteChecklist.length, "blocker"),
      description:
        "Finish the missing coach-page basics so people can understand your offer and contact you.",
      href: "/pt-hub/profile",
      ctaLabel: "Open profile setup",
      tone: getSemanticToneForStatus("Setup in progress"),
      priority: 88,
    });
  }

  if (!params.activationChecklist && !params.publicationState?.isPublished) {
    upsertAction({
      id: "publish-profile",
      label: "Publish your public profile",
      badge: params.publicationState?.canPublish ? "Ready to publish" : "Draft",
      description: params.publicationState?.canPublish
        ? "Your coach page is ready to go live and collect leads."
        : "Finish the key setup blockers first, then publish the coach page so people can discover you.",
      href: "/pt-hub/profile",
      ctaLabel: params.publicationState?.canPublish
        ? "Publish coach page"
        : "Review setup",
      tone: getSemanticToneForStatus(
        params.publicationState?.canPublish ? "Ready to publish" : "Draft",
      ),
      priority: 82,
    });
  }

  if (!params.activationChecklist && params.workspaces.length === 0) {
    upsertAction({
      id: "create-coaching-space",
      label: "Create your first coaching space",
      badge: "Not created",
      description:
        "Set up the first coaching space so clients have a place for plans, check-ins, and messages.",
      href: "/pt-hub/workspaces",
      ctaLabel: "Create coaching space",
      tone: getSemanticToneForStatus("Not created"),
      priority: 80,
    });
  }

  if (!params.activationChecklist && params.leads.length === 0) {
    upsertAction({
      id: "start-lead-flow",
      label: "Get your first lead",
      badge: "No leads yet",
      description:
        "Review your coach page, then share it so a potential client can contact you.",
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
      tone: getSemanticToneForStatus("Billing is still manual"),
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
        ? "Run a quick operational check before it becomes urgent."
        : "There are no urgent lead or billing blockers, but some clients still deserve a quick operational check.",
      href: mostUrgentAttentionClient
        ? `/pt/clients/${mostUrgentAttentionClient.id}`
        : "/pt-hub/clients",
      ctaLabel: mostUrgentAttentionClient
        ? `Open ${mostUrgentAttentionClient.workspaceName}`
        : "Open clients",
      tone: getSemanticToneForStatus("Needs attention"),
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
        "Share your coach page once it looks right so potential clients can contact you.",
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
      description: "Create or open client workspaces.",
      href: "/pt-hub/workspaces",
    },
    {
      id: "lead-inbox",
      label: "Lead inbox",
      description: "Reply to new leads and update their status.",
      href: "/pt-hub/leads",
    },
    {
      id: "clients",
      label: "Clients",
      description: "Check onboarding, risk, and follow-ups.",
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
      tone: getSemanticToneForStatus("Awaiting response"),
      href: "/pt-hub/leads",
      ctaLabel: "Open leads",
    },
    {
      id: "pipeline-moving",
      label: "In progress",
      value: formatCount(getPipelineLeadCount(params.leads), "lead"),
      tone: getSemanticToneForStatus("In progress"),
      href: "/pt-hub/leads",
      ctaLabel: "Open leads",
    },
    {
      id: "converted",
      label: "Converted",
      value: formatCount(getAcceptedLeadCount(params.leads), "lead"),
      tone: getSemanticToneForStatus("Converted"),
      href: "/pt-hub/leads",
      ctaLabel: "View conversions",
    },
    {
      id: "new-this-month",
      label: "New this month",
      value: formatCount(params.stats?.applicationsThisMonth ?? 0, "lead"),
      tone: getSemanticToneForStatus("New this month"),
      href: "/pt-hub/leads",
      ctaLabel: "Open leads",
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
      tone: getSemanticToneForStatus("Needs attention"),
      href: "/pt-hub/clients",
      ctaLabel: "Open clients",
    },
    {
      id: "at-risk",
      label: "At risk",
      value: formatCount(params.clientStats.atRiskClients, "client"),
      tone: getSemanticToneForStatus("At risk"),
      href: "/pt-hub/clients",
      ctaLabel: "Review risk",
    },
    {
      id: "checkin-overdue",
      label: "Check-ins overdue",
      value: formatCount(params.clientStats.overdueCheckinClients, "client"),
      tone: getSemanticToneForStatus("Overdue"),
      href: "/pt/checkins",
      ctaLabel: "Open check-ins",
    },
    {
      id: "onboarding-incomplete",
      label: "Onboarding incomplete",
      value: formatCount(
        params.clientStats.onboardingIncompleteClients,
        "client",
      ),
      tone: getSemanticToneForStatus("Onboarding incomplete"),
      href: "/pt-hub/clients",
      ctaLabel: "Review onboarding",
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
      label: "Setup status",
      value: params.stats?.businessHealthLabel ?? "Setup in progress",
      detail:
        "Shows whether you still need setup work or can focus on clients and leads.",
      tone: "info",
    },
    {
      id: "workspace-system",
      label: "Coaching spaces",
      value: formatCount(params.workspaces.length, "space"),
      detail: latestWorkspace
        ? `Latest workspace: ${latestWorkspace.name}`
        : "Create the first coaching space so clients have a place for plans and check-ins.",
      tone: "neutral",
    },
    {
      id: "coach-page",
      label: "Coach page",
      value: params.publicationState?.isPublished ? "Live" : "Draft",
      detail: params.publicationState?.isPublished
        ? "Your coach page is live and can collect leads."
        : "Publish your coach page so people can find you and contact you.",
      tone: getSemanticToneForStatus(
        params.publicationState?.isPublished ? "Published" : "Draft",
      ),
    },
    {
      id: "profile-readiness",
      label: "Profile readiness",
      value: `${params.readiness?.completionPercent ?? 0}%`,
      detail:
        unpublishedBlockers > 0
          ? `${unpublishedBlockers} profile item(s) still need attention.`
          : params.leads.length > 0
            ? "Your coach page is ready for new leads."
            : "Your coach page is ready to share.",
      tone: getSemanticToneForStatus(
        unpublishedBlockers > 0 ? "Onboarding incomplete" : "Healthy",
      ),
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
      value: params.subscription?.billingStatus ?? "Manual billing",
      detail:
        params.subscription?.billingConnected === true
          ? "Billing is connected"
          : "Billing is still manual or placeholder-only",
      tone: getSemanticToneForStatus(
        params.subscription?.billingConnected === true
          ? "Billing is connected"
          : "Billing is still manual",
      ),
    },
    {
      id: "monthly-revenue",
      label: "Monthly revenue",
      value: params.revenue?.monthlyRevenueLabel ?? "Not connected",
      detail: "Live revenue will surface here once billing is connected",
      tone: getSemanticToneForStatus(
        params.revenue?.revenueConnected === true
          ? "Billing is connected"
          : "Not connected",
      ),
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
      tone: getSemanticToneForStatus(
        params.revenue?.revenueConnected === true
          ? "Connected"
          : "Not connected",
      ),
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
  const activationChecklist = getPtHubActivationChecklistModel(
    params.activationSummary,
  );
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
    modeLabel: mode === "activation" ? "Setup mode" : "Operating mode",
    modeDescription:
      mode === "activation"
        ? "Publish your coach page, create a coaching space, and get your first lead."
        : "Reply to leads, check clients, and keep coaching work moving.",
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
      activationChecklist,
    }),
    launchChecklist: buildLaunchChecklist({
      readiness: params.readiness,
      publicationState: params.publicationState,
      workspaces,
      leads,
      clients,
    }),
    activationChecklist,
    activationChecklistLoading: params.activationSummaryLoading,
    activationChecklistError: params.activationSummaryError,
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

import {
  isClientAtRisk,
  normalizeClientLifecycleState,
} from "../../../lib/client-lifecycle";
import type {
  PTClientSummary,
  PTLead,
  PTPackage,
  PTWorkspaceSummary,
} from "../types";

export type PtHubAnalyticsRangeKey = "7d" | "30d" | "90d" | "12m";
export type PtHubAnalyticsQualityGroup = "source" | "package";

export type PtHubAnalyticsFilters = {
  rangeKey: PtHubAnalyticsRangeKey;
  workspaceId: string;
  packageKey: string;
  sourceKey: string;
};

export type PtHubAnalyticsOption = {
  value: string;
  label: string;
};

export type PtHubAnalyticsRangeOption = {
  value: PtHubAnalyticsRangeKey;
  label: string;
};

export type PtHubAnalyticsKpi = {
  value: string;
  helper: string;
  delta: number | null;
  unavailable?: boolean;
};

export type PtHubAnalyticsStage = {
  id: "submitted" | "approved" | "converted";
  label: string;
  count: number;
  conversionFromPrevious: number | null;
  href: string;
};

export type PtHubAnalyticsTrendPoint = {
  label: string;
  leadsCreated: number;
  approvedLeads: number;
  convertedClients: number;
};

export type PtHubAnalyticsQualityRow = {
  key: string;
  label: string;
  leads: number;
  approvalRate: number | null;
  conversionRate: number | null;
  lowSample: boolean;
};

export type PtHubAnalyticsWorkspaceRow = {
  workspaceId: string;
  workspaceName: string;
  leads: number;
  conversions: number;
  activeClients: number;
  atRiskRate: number | null;
};

export type PtHubAnalyticsSetupItem = {
  id: string;
  label: string;
  detail: string;
};

export type PtHubAnalyticsSnapshot = {
  rangeLabel: string;
  previousRangeLabel: string;
  bucketLabel: string;
  topKpis: {
    newLeads: PtHubAnalyticsKpi;
    conversion: PtHubAnalyticsKpi;
    medianFirstResponse: PtHubAnalyticsKpi;
    activeClients: PtHubAnalyticsKpi;
  };
  funnel: PtHubAnalyticsStage[];
  trend: PtHubAnalyticsTrendPoint[];
  quality: {
    bySource: PtHubAnalyticsQualityRow[];
    byPackage: PtHubAnalyticsQualityRow[];
  };
  speed: {
    medianFirstResponseMinutes: number | null;
    leadsWaitingMoreThan24h: number;
    averageDaysNewToApproved: number | null;
    averageDaysApprovedToConverted: number | null;
  };
  clientHealth: {
    atRiskClients: number;
    atRiskActiveClients: number;
    overdueCheckinClients: number;
    overdueCheckinRateProxy: number | null;
    inactiveFlaggedClients: number;
    pausedInPeriod: number;
    churnedInPeriod: number;
  };
  workspacePerformance: PtHubAnalyticsWorkspaceRow[];
  setupItems: PtHubAnalyticsSetupItem[];
  emptyStates: {
    hasAnyLeads: boolean;
    hasAnyClients: boolean;
    hasAnyRangeLeads: boolean;
    hasAnyWorkspacePerformance: boolean;
  };
  filterNotes: string[];
};

const DAY_MS = 1000 * 60 * 60 * 24;
const HOUR_MS = 1000 * 60 * 60;

export const PT_HUB_ANALYTICS_RANGE_OPTIONS: PtHubAnalyticsRangeOption[] = [
  { value: "7d", label: "7D" },
  { value: "30d", label: "30D" },
  { value: "90d", label: "90D" },
  { value: "12m", label: "12M" },
];

export function getPtHubAnalyticsWorkspaceOptions(
  workspaces: PTWorkspaceSummary[],
): PtHubAnalyticsOption[] {
  return [
    { value: "all", label: "All workspaces" },
    ...workspaces.map((workspace) => ({
      value: workspace.id,
      label: workspace.name,
    })),
  ];
}

export function getPtHubAnalyticsSourceOptions(
  leads: PTLead[],
): PtHubAnalyticsOption[] {
  const seen = new Map<string, string>();
  for (const lead of leads) {
    const key = getLeadSourceKey(lead);
    if (key === "all" || seen.has(key)) continue;
    seen.set(key, lead.sourceLabel || "Manual");
  }

  return [
    { value: "all", label: "All sources" },
    ...Array.from(seen.entries())
      .sort((left, right) => left[1].localeCompare(right[1]))
      .map(([value, label]) => ({ value, label })),
  ];
}

export function getPtHubAnalyticsPackageOptions(params: {
  leads: PTLead[];
  packages: PTPackage[];
}): PtHubAnalyticsOption[] {
  const packageLabelById = new Map(
    params.packages.map((pkg) => [pkg.id, pkg.title] as const),
  );
  const seen = new Map<string, string>();

  for (const lead of params.leads) {
    const key = getLeadPackageKey(lead);
    if (key === "all" || seen.has(key)) continue;
    seen.set(key, getLeadPackageLabel(lead, packageLabelById));
  }

  return [
    { value: "all", label: "All packages" },
    ...Array.from(seen.entries())
      .sort((left, right) => left[1].localeCompare(right[1]))
      .map(([value, label]) => ({ value, label })),
  ];
}

type DateRangeWindow = {
  start: Date;
  end: Date;
  previousStart: Date;
  previousEnd: Date;
  bucket: "day" | "week" | "month";
  rangeLabel: string;
  previousRangeLabel: string;
  bucketLabel: string;
};

type BucketState = {
  label: string;
  leadsCreated: number;
  approvedLeads: number;
  convertedClients: number;
};

function getDateRangeWindow(
  rangeKey: PtHubAnalyticsRangeKey,
  now = new Date(),
): DateRangeWindow {
  const end = new Date(now);
  const dayCount =
    rangeKey === "7d" ? 7 : rangeKey === "30d" ? 30 : rangeKey === "90d" ? 90 : 365;
  const start = new Date(end.getTime() - dayCount * DAY_MS);
  const previousEnd = new Date(start);
  const previousStart = new Date(previousEnd.getTime() - dayCount * DAY_MS);

  return {
    start,
    end,
    previousStart,
    previousEnd,
    bucket:
      rangeKey === "12m" ? "month" : rangeKey === "90d" ? "week" : "day",
    rangeLabel:
      rangeKey === "12m"
        ? "Last 12 months"
        : rangeKey === "90d"
          ? "Last 90 days"
          : rangeKey === "30d"
            ? "Last 30 days"
            : "Last 7 days",
    previousRangeLabel:
      rangeKey === "12m"
        ? "Previous 12 months"
        : rangeKey === "90d"
          ? "Previous 90 days"
          : rangeKey === "30d"
            ? "Previous 30 days"
            : "Previous 7 days",
    bucketLabel:
      rangeKey === "12m"
        ? "Monthly"
        : rangeKey === "90d"
          ? "Weekly"
          : "Daily",
  };
}

function getLeadSourceKey(lead: PTLead) {
  return (
    lead.sourceSlug?.trim().toLowerCase() ||
    lead.source?.trim().toLowerCase() ||
    "manual"
  );
}

function normalizeTextKey(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, "-");
}

function getLeadPackageKey(lead: PTLead) {
  if (lead.packageInterestId?.trim()) {
    return `pkg:${lead.packageInterestId.trim()}`;
  }
  const fallbackLabel =
    lead.packageInterestLabelSnapshot?.trim() || lead.packageInterest?.trim();
  if (!fallbackLabel) return "all";
  return `label:${normalizeTextKey(fallbackLabel)}`;
}

function getLeadPackageLabel(
  lead: PTLead,
  packageLabelById: Map<string, string>,
): string {
  if (lead.packageInterestId?.trim()) {
    return (
      packageLabelById.get(lead.packageInterestId.trim()) ||
      lead.packageInterestLabelSnapshot?.trim() ||
      lead.packageInterest?.trim() ||
      "Package interest"
    );
  }

  return (
    lead.packageInterestLabelSnapshot?.trim() ||
    lead.packageInterest?.trim() ||
    "Package interest"
  );
}

function parseDate(value: string | null | undefined) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function isWithinWindow(date: Date | null, start: Date, end: Date) {
  if (!date) return false;
  return date >= start && date < end;
}

function isLeadApproved(lead: PTLead) {
  return (
    lead.status === "approved_pending_workspace" || lead.status === "converted"
  );
}

function isLeadConverted(lead: PTLead) {
  return lead.status === "converted" || Boolean(lead.convertedAt);
}

function formatPercent(value: number | null) {
  if (value === null || Number.isNaN(value)) return "Unavailable";
  return `${Math.round(value)}%`;
}

function formatDeltaPercent(current: number | null, previous: number | null) {
  if (current === null || previous === null) return null;
  return current - previous;
}

function formatCountDelta(current: number, previous: number) {
  return current - previous;
}

function formatDurationMinutes(value: number | null) {
  if (value === null || Number.isNaN(value)) return "Unavailable";
  if (value < 60) return `${Math.round(value)} min`;
  if (value < 24 * 60) {
    const hours = value / 60;
    return `${hours.toFixed(hours >= 10 ? 0 : 1)} hr`;
  }
  const days = value / (24 * 60);
  return `${days.toFixed(days >= 10 ? 0 : 1)} days`;
}

function formatDurationDays(value: number | null) {
  if (value === null || Number.isNaN(value)) return "Unavailable";
  if (value < 1) {
    return `${Math.round(value * 24)} hr`;
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} days`;
}

function createBucketKey(date: Date, bucket: DateRangeWindow["bucket"]) {
  if (bucket === "month") {
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
  }

  if (bucket === "week") {
    const startOfWeek = new Date(date);
    const day = startOfWeek.getUTCDay();
    const shift = day === 0 ? 6 : day - 1;
    startOfWeek.setUTCDate(startOfWeek.getUTCDate() - shift);
    return startOfWeek.toISOString().slice(0, 10);
  }

  return date.toISOString().slice(0, 10);
}

function createBucketLabel(bucketKey: string, bucket: DateRangeWindow["bucket"]) {
  if (bucket === "month") {
    const parsed = new Date(`${bucketKey}-01T00:00:00.000Z`);
    return parsed.toLocaleDateString("en-US", {
      month: "short",
      year: "2-digit",
    });
  }

  const parsed = new Date(`${bucketKey}T00:00:00.000Z`);
  return parsed.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function buildTrend(params: {
  leads: PTLead[];
  window: DateRangeWindow;
}): PtHubAnalyticsTrendPoint[] {
  const buckets = new Map<string, BucketState>();

  const ensureBucket = (date: Date) => {
    const key = createBucketKey(date, params.window.bucket);
    if (!buckets.has(key)) {
      buckets.set(key, {
        label: createBucketLabel(key, params.window.bucket),
        leadsCreated: 0,
        approvedLeads: 0,
        convertedClients: 0,
      });
    }
    return buckets.get(key)!;
  };

  for (const lead of params.leads) {
    const submittedAt = parseDate(lead.submittedAt);
    if (!isWithinWindow(submittedAt, params.window.start, params.window.end)) {
      continue;
    }

    const bucket = ensureBucket(submittedAt!);
    bucket.leadsCreated += 1;
    if (isLeadApproved(lead)) bucket.approvedLeads += 1;
    if (isLeadConverted(lead)) bucket.convertedClients += 1;
  }

  return Array.from(buckets.entries())
    .sort((left, right) => left[0].localeCompare(right[0]))
    .map(([, value]) => value);
}

function buildQualityRows(params: {
  leads: PTLead[];
  groupBy: PtHubAnalyticsQualityGroup;
  packageLabelById: Map<string, string>;
}): PtHubAnalyticsQualityRow[] {
  const groups = new Map<
    string,
    {
      label: string;
      leads: number;
      approved: number;
      converted: number;
    }
  >();

  for (const lead of params.leads) {
    const key =
      params.groupBy === "source"
        ? getLeadSourceKey(lead)
        : getLeadPackageKey(lead);
    if (key === "all") continue;

    const label =
      params.groupBy === "source"
        ? lead.sourceLabel || "Manual"
        : getLeadPackageLabel(lead, params.packageLabelById);

    const current = groups.get(key) ?? {
      label,
      leads: 0,
      approved: 0,
      converted: 0,
    };
    current.leads += 1;
    if (isLeadApproved(lead)) current.approved += 1;
    if (isLeadConverted(lead)) current.converted += 1;
    groups.set(key, current);
  }

  return Array.from(groups.entries())
    .map(([key, value]) => ({
      key,
      label: value.label,
      leads: value.leads,
      approvalRate: value.leads > 0 ? (value.approved / value.leads) * 100 : null,
      conversionRate:
        value.leads > 0 ? (value.converted / value.leads) * 100 : null,
      lowSample: value.leads < 3,
    }))
    .sort((left, right) => {
      if (right.leads !== left.leads) return right.leads - left.leads;
      return left.label.localeCompare(right.label);
    });
}

function getMedian(values: number[]) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[middle - 1]! + sorted[middle]!) / 2;
  }
  return sorted[middle]!;
}

function getAverage(values: number[]) {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function buildWorkspacePerformance(params: {
  workspaces: PTWorkspaceSummary[];
  clients: PTClientSummary[];
  leads: PTLead[];
  window: DateRangeWindow;
}): PtHubAnalyticsWorkspaceRow[] {
  return params.workspaces
    .map((workspace) => {
      const workspaceClients = params.clients.filter(
        (client) => client.workspaceId === workspace.id,
      );
      const activeClients = workspaceClients.filter(
        (client) => normalizeClientLifecycleState(client.lifecycleState) === "active",
      );
      const attributedLeads = params.leads.filter(
        (lead) => lead.convertedWorkspaceId === workspace.id,
      );
      const leadsInWindow = attributedLeads.filter((lead) =>
        isWithinWindow(parseDate(lead.submittedAt), params.window.start, params.window.end),
      );
      const conversionsInWindow = attributedLeads.filter((lead) =>
        isWithinWindow(parseDate(lead.convertedAt), params.window.start, params.window.end),
      );
      const atRiskActiveClients = activeClients.filter((client) =>
        isClientAtRisk(client),
      ).length;

      return {
        workspaceId: workspace.id,
        workspaceName: workspace.name,
        leads: leadsInWindow.length,
        conversions: conversionsInWindow.length,
        activeClients: activeClients.length,
        atRiskRate:
          activeClients.length > 0
            ? (atRiskActiveClients / activeClients.length) * 100
            : null,
      } satisfies PtHubAnalyticsWorkspaceRow;
    })
    .sort((left, right) => {
      if (right.conversions !== left.conversions) {
        return right.conversions - left.conversions;
      }
      if (right.activeClients !== left.activeClients) {
        return right.activeClients - left.activeClients;
      }
      return left.workspaceName.localeCompare(right.workspaceName);
    });
}

function filterClientsByWorkspace(
  clients: PTClientSummary[],
  workspaceId: string,
) {
  if (workspaceId === "all") return clients;
  return clients.filter((client) => client.workspaceId === workspaceId);
}

function filterLeadsByFilters(
  leads: PTLead[],
  filters: PtHubAnalyticsFilters,
) {
  return leads.filter((lead) => {
    const matchesPackage =
      filters.packageKey === "all"
        ? true
        : getLeadPackageKey(lead) === filters.packageKey;
    const matchesSource =
      filters.sourceKey === "all"
        ? true
        : getLeadSourceKey(lead) === filters.sourceKey;
    const matchesWorkspace =
      filters.workspaceId === "all"
        ? true
        : lead.convertedWorkspaceId
          ? lead.convertedWorkspaceId === filters.workspaceId
          : true;
    return matchesPackage && matchesSource && matchesWorkspace;
  });
}

export function buildPtHubAnalyticsSnapshot(params: {
  leads: PTLead[];
  clients: PTClientSummary[];
  workspaces: PTWorkspaceSummary[];
  packages: PTPackage[];
  filters: PtHubAnalyticsFilters;
  now?: Date;
}): PtHubAnalyticsSnapshot {
  const now = params.now ?? new Date();
  const window = getDateRangeWindow(params.filters.rangeKey, now);
  const packageLabelById = new Map(
    params.packages.map((pkg) => [pkg.id, pkg.title] as const),
  );

  const filteredLeads = filterLeadsByFilters(params.leads, params.filters);
  const filteredClients = filterClientsByWorkspace(
    params.clients,
    params.filters.workspaceId,
  );
  const rangeLeads = filteredLeads.filter((lead) =>
    isWithinWindow(parseDate(lead.submittedAt), window.start, window.end),
  );
  const previousRangeLeads = filteredLeads.filter((lead) =>
    isWithinWindow(parseDate(lead.submittedAt), window.previousStart, window.previousEnd),
  );

  const convertedLeadsInRange = rangeLeads.filter((lead) => isLeadConverted(lead));
  const convertedLeadsInPreviousRange = previousRangeLeads.filter((lead) =>
    isLeadConverted(lead),
  );
  const approvedLeadsInRange = rangeLeads.filter((lead) => isLeadApproved(lead));

  const conversionRate =
    rangeLeads.length > 0 ? (convertedLeadsInRange.length / rangeLeads.length) * 100 : null;
  const previousConversionRate =
    previousRangeLeads.length > 0
      ? (convertedLeadsInPreviousRange.length / previousRangeLeads.length) * 100
      : null;

  const waitingLeadCount = filteredLeads.filter((lead) => {
    const submittedAt = parseDate(lead.submittedAt);
    if (!submittedAt) return false;
    return lead.status === "new" && now.getTime() - submittedAt.getTime() >= 24 * HOUR_MS;
  }).length;

  const activeClients = filteredClients.filter(
    (client) => normalizeClientLifecycleState(client.lifecycleState) === "active",
  );
  const activeClientsAtRisk = activeClients.filter((client) =>
    isClientAtRisk(client),
  ).length;
  const allAtRiskClients = filteredClients.filter((client) =>
    isClientAtRisk(client),
  ).length;
  const overdueCheckinClients = filteredClients.filter(
    (client) => client.hasOverdueCheckin,
  ).length;
  const inactiveFlaggedClients = filteredClients.filter((client) =>
    client.riskFlags.includes("inactive_client"),
  ).length;
  const pausedInPeriod = filteredClients.filter((client) => {
    return (
      normalizeClientLifecycleState(client.lifecycleState) === "paused" &&
      isWithinWindow(parseDate(client.lifecycleChangedAt), window.start, window.end)
    );
  }).length;
  const churnedInPeriod = filteredClients.filter((client) => {
    return (
      normalizeClientLifecycleState(client.lifecycleState) === "churned" &&
      isWithinWindow(parseDate(client.lifecycleChangedAt), window.start, window.end)
    );
  }).length;

  // Metric definitions:
  // - New Leads = leads created within the selected period.
  // - Lead-to-Client Conversion = converted leads / submitted leads in the selected period.
  // - First response / approval timing remain unavailable until dedicated response
  //   and approval event timestamps exist in the data model.
  // `leadLastMessageAt` is only a last-message summary and does not identify
  // the first PT response reliably, so the timing arrays intentionally stay empty.
  const firstResponseDurationsMinutes: number[] = [];
  const averageDaysNewToApprovedSource: number[] = [];
  const averageDaysApprovedToConvertedSource: number[] = [];

  const medianFirstResponseMinutes = getMedian(firstResponseDurationsMinutes);
  const averageDaysNewToApproved = getAverage(averageDaysNewToApprovedSource);
  const averageDaysApprovedToConverted = getAverage(
    averageDaysApprovedToConvertedSource,
  );

  const setupItems: PtHubAnalyticsSetupItem[] = [
    {
      id: "profile-traffic",
      label: "Public profile traffic tracking is not live yet",
      detail:
        "Top-of-funnel page views are not instrumented in this build, so acquisition starts at submitted applications.",
    },
    {
      id: "apply-starts",
      label: "Apply-start tracking is not connected",
      detail:
        "The page can show submitted demand and downstream outcomes, but it cannot yet report application starts.",
    },
    {
      id: "response-events",
      label: "Response timing is partially instrumented",
      detail:
        "Waiting leads older than 24 hours are live, but first-response and approval event timestamps are not reliable enough to calculate full timing metrics yet.",
    },
  ];

  const filterNotes: string[] = [];
  if (
    params.filters.workspaceId !== "all" &&
    filteredLeads.some((lead) => !lead.convertedWorkspaceId)
  ) {
    filterNotes.push(
      "Unassigned inbound leads remain visible until they are attached to a coaching space.",
    );
  }
  if (params.workspaces.length > 1) {
    filterNotes.push(
      "Workspace comparison uses leads already attributed to a converted coaching space.",
    );
  }
  if (overdueCheckinClients > 0 && activeClients.length > 0) {
    filterNotes.push(
      "Overdue check-in rate is shown as a current client-rate proxy because a due-checkin denominator is not available yet.",
    );
  }

  return {
    rangeLabel: window.rangeLabel,
    previousRangeLabel: window.previousRangeLabel,
    bucketLabel: window.bucketLabel,
    topKpis: {
      newLeads: {
        value: String(rangeLeads.length),
        helper: `${window.rangeLabel.toLowerCase()} vs ${window.previousRangeLabel.toLowerCase()}`,
        delta: formatCountDelta(rangeLeads.length, previousRangeLeads.length),
      },
      conversion: {
        value: formatPercent(conversionRate),
        helper: "Converted leads / submitted leads in the selected range",
        delta: formatDeltaPercent(conversionRate, previousConversionRate),
      },
      medianFirstResponse: {
        value: formatDurationMinutes(medianFirstResponseMinutes),
        helper:
          medianFirstResponseMinutes === null
            ? "Response events are not fully instrumented yet"
            : `${waitingLeadCount} lead(s) waiting more than 24 hours`,
        delta: null,
        unavailable: medianFirstResponseMinutes === null,
      },
      activeClients: {
        value: String(activeClients.length),
        helper:
          activeClientsAtRisk > 0
            ? `${activeClientsAtRisk} active client(s) at risk`
            : "No active clients currently flagged at risk",
        delta: null,
      },
    },
    funnel: [
      {
        id: "submitted",
        label: "Submitted applications",
        count: rangeLeads.length,
        conversionFromPrevious: null,
        href: "/pt-hub/leads",
      },
      {
        id: "approved",
        label: "Approved leads",
        count: approvedLeadsInRange.length,
        conversionFromPrevious:
          rangeLeads.length > 0
            ? (approvedLeadsInRange.length / rangeLeads.length) * 100
            : null,
        href: "/pt-hub/leads?status=approved_group",
      },
      {
        id: "converted",
        label: "Converted clients",
        count: convertedLeadsInRange.length,
        conversionFromPrevious:
          approvedLeadsInRange.length > 0
            ? (convertedLeadsInRange.length / approvedLeadsInRange.length) * 100
            : null,
        href: "/pt-hub/leads?status=converted",
      },
    ],
    trend: buildTrend({ leads: filteredLeads, window }),
    quality: {
      bySource: buildQualityRows({
        leads: rangeLeads,
        groupBy: "source",
        packageLabelById,
      }),
      byPackage: buildQualityRows({
        leads: rangeLeads,
        groupBy: "package",
        packageLabelById,
      }),
    },
    speed: {
      medianFirstResponseMinutes,
      leadsWaitingMoreThan24h: waitingLeadCount,
      averageDaysNewToApproved,
      averageDaysApprovedToConverted,
    },
    clientHealth: {
      atRiskClients: allAtRiskClients,
      atRiskActiveClients: activeClientsAtRisk,
      overdueCheckinClients,
      overdueCheckinRateProxy:
        activeClients.length > 0
          ? (overdueCheckinClients / activeClients.length) * 100
          : null,
      inactiveFlaggedClients,
      pausedInPeriod,
      churnedInPeriod,
    },
    workspacePerformance: buildWorkspacePerformance({
      workspaces:
        params.filters.workspaceId === "all"
          ? params.workspaces
          : params.workspaces.filter(
              (workspace) => workspace.id === params.filters.workspaceId,
            ),
      clients: filteredClients,
      leads: filteredLeads,
      window,
    }),
    setupItems,
    emptyStates: {
      hasAnyLeads: filteredLeads.length > 0,
      hasAnyClients: filteredClients.length > 0,
      hasAnyRangeLeads: rangeLeads.length > 0,
      hasAnyWorkspacePerformance: params.workspaces.length > 1,
    },
    filterNotes,
  };
}

export function formatAnalyticsPercent(value: number | null) {
  if (value === null || Number.isNaN(value)) return "Unavailable";
  return `${Math.round(value)}%`;
}

export function formatAnalyticsDurationDays(value: number | null) {
  return formatDurationDays(value);
}

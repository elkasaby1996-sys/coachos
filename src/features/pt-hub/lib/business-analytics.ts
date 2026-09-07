import type { PTLead } from "../types";
import { isClientAtRisk } from "../../../lib/client-lifecycle";

export type AnalyticsLead = Pick<
  PTLead,
  | "id"
  | "status"
  | "submittedAt"
  | "convertedAt"
  | "convertedWorkspaceId"
  | "packageInterestId"
  | "packageInterest"
  | "packageInterestLabelSnapshot"
  | "source"
  | "sourceLabel"
>;

export type AnalyticsClient = {
  id: string;
  user_id: string | null;
  workspace_id: string;
  display_name: string | null;
  lifecycle_state: string;
  relationship_status: string;
  lifecycle_changed_at: string | null;
  created_at: string | null;
  last_activity_at: string | null;
  manual_risk_flag: boolean;
  risk_flags: string[];
  has_overdue_checkin: boolean;
  churn_reason: string | null;
};
export type AnalyticsWorkout = {
  id: string;
  client_id: string;
  scheduled_date: string;
  status: string;
  day_type: string;
};
export type AnalyticsCheckin = {
  id: string;
  client_id: string;
  week_ending_saturday: string;
  submitted_at: string | null;
  reviewed_at: string | null;
};
export type AnalyticsAssessment = {
  id: string;
  client_id: string;
  submitted_at: string | null;
  status: string;
};
export type AnalyticsRecords = {
  clients: AnalyticsClient[];
  workouts: AnalyticsWorkout[];
  checkins: AnalyticsCheckin[];
  assessments: AnalyticsAssessment[];
};
export const emptyAnalyticsRecords: AnalyticsRecords = {
  clients: [],
  workouts: [],
  checkins: [],
  assessments: [],
};
export type AnalyticsRange = "7d" | "30d" | "90d" | "12m";

// Calendar-day windows in UTC: a due date remains due today, not overdue at midnight.
export function analyticsWindow(range: AnalyticsRange, now = new Date()) {
  const days = { "7d": 7, "30d": 30, "90d": 90, "12m": 365 }[range];
  const end = now.toISOString().slice(0, 10);
  const startDate = new Date(`${end}T00:00:00Z`);
  startDate.setUTCDate(startDate.getUTCDate() - days + 1);
  return { start: startDate.toISOString().slice(0, 10), end, days };
}
export const analyticsRate = (count: number, total: number) =>
  total ? (count / total) * 100 : null;
export const displayRate = (value: number | null) =>
  value === null ? "—" : `${Math.round(value)}%`;
export function withinAnalyticsWindow(
  value: string | null,
  start: string,
  end: string,
) {
  return Boolean(
    value && value.slice(0, 10) >= start && value.slice(0, 10) <= end,
  );
}
export function uniquePeople(clients: AnalyticsClient[]) {
  return new Set(clients.map((c) => c.user_id || c.id)).size;
}

export function buildDeliveryAnalytics(
  records: AnalyticsRecords,
  range: AnalyticsRange,
  workspaceId = "all",
  now = new Date(),
) {
  const { start, end } = analyticsWindow(range, now);
  const clients = records.clients.filter(
    (c) => workspaceId === "all" || c.workspace_id === workspaceId,
  );
  const ids = new Set(clients.map((c) => c.id));
  const current = clients.filter((c) => c.relationship_status === "active");
  const active = current.filter((c) => c.lifecycle_state === "active");
  const firstCreated = new Map<string, string>();
  for (const c of records.clients) {
    const key = c.user_id || c.id;
    if (
      c.created_at &&
      (!firstCreated.has(key) || c.created_at < firstCreated.get(key)!)
    )
      firstCreated.set(key, c.created_at);
  }
  const workouts = records.workouts.filter(
    (w) =>
      ids.has(w.client_id) &&
      w.day_type !== "rest" &&
      withinAnalyticsWindow(w.scheduled_date, start, end),
  );
  const checkins = records.checkins.filter(
    (c) =>
      ids.has(c.client_id) &&
      withinAnalyticsWindow(c.week_ending_saturday, start, end),
  );
  const submitted = checkins.filter((c) => c.submitted_at);
  const completed = workouts.filter((w) => w.status === "completed");
  const reviews = records.checkins.filter(
    (c) =>
      ids.has(c.client_id) &&
      c.submitted_at &&
      c.reviewed_at &&
      withinAnalyticsWindow(c.reviewed_at, start, end),
  );
  const hours = reviews
    .map(
      (c) =>
        (Date.parse(c.reviewed_at!) - Date.parse(c.submitted_at!)) / 3600000,
    )
    .filter((h) => Number.isFinite(h) && h >= 0)
    .sort((a, b) => a - b);
  const middle = Math.floor(hours.length / 2);
  const medianReviewHours = hours.length
    ? hours.length % 2
      ? hours[middle]!
      : (hours[middle - 1]! + hours[middle]!) / 2
    : null;
  const waiting = records.checkins.filter(
    (c) => ids.has(c.client_id) && c.submitted_at && !c.reviewed_at,
  );
  const overdue = checkins.filter(
    (c) => !c.submitted_at && c.week_ending_saturday < end,
  );
  const assessed = records.assessments.filter(
    (a) =>
      ids.has(a.client_id) && withinAnalyticsWindow(a.submitted_at, start, end),
  );
  const lifecycle = [
    "active",
    "invited",
    "onboarding",
    "paused",
    "completed",
    "churned",
    "unknown",
  ]
    .map((key) => ({
      name:
        key === "unknown"
          ? "Other"
          : key.charAt(0).toUpperCase() + key.slice(1),
      value: current.filter((c) =>
        key === "unknown"
          ? ![
              "active",
              "invited",
              "onboarding",
              "paused",
              "completed",
              "churned",
            ].includes(c.lifecycle_state)
          : c.lifecycle_state === key,
      ).length,
    }))
    .filter((s) => s.value > 0);
  return {
    clients,
    current,
    active,
    uniqueClients: uniquePeople(current),
    uniqueActive: uniquePeople(active),
    workouts,
    checkins,
    completed,
    submitted,
    overdue,
    waiting,
    assessed,
    medianReviewHours,
    workoutRate: analyticsRate(completed.length, workouts.length),
    checkinRate: analyticsRate(submitted.length, checkins.length),
    atRisk: active.filter((c) => isClientAtRisk(c)),
    lifecycle,
    newClients: uniquePeople(
      clients.filter((c) =>
        withinAnalyticsWindow(
          firstCreated.get(c.user_id || c.id) || null,
          start,
          end,
        ),
      ),
    ),
    engaged: uniquePeople(
      active.filter((c) =>
        withinAnalyticsWindow(c.last_activity_at, start, end),
      ),
    ),
    ended: clients.filter(
      (c) =>
        c.lifecycle_state === "churned" &&
        withinAnalyticsWindow(c.lifecycle_changed_at, start, end),
    ),
  };
}

export function buildAcquisitionAnalytics(
  leads: AnalyticsLead[],
  range: AnalyticsRange,
  workspaceId = "all",
  packageKey = "all",
  source = "all",
  now = new Date(),
) {
  const { start, end, days } = analyticsWindow(range, now);
  const scoped = leads.filter(
    (l) =>
      (workspaceId === "all" || l.convertedWorkspaceId === workspaceId) &&
      (packageKey === "all" ||
        (l.packageInterestId || l.packageInterest || "none") === packageKey) &&
      (source === "all" || l.source === source),
  );
  const cohort = scoped.filter((l) =>
    withinAnalyticsWindow(l.submittedAt, start, end),
  );
  const converted = cohort.filter((l) => l.status === "converted");
  const approved = cohort.filter((l) =>
    ["approved_pending_workspace", "converted"].includes(l.status),
  );
  const pending = cohort.filter((l) => ["new", "contacted"].includes(l.status));
  const declined = cohort.filter((l) => l.status === "declined");
  const trend: {
    date: string;
    label: string;
    applications: number;
    conversions: number;
  }[] = [];
  const step = days > 90 ? 30 : days > 30 ? 7 : 1;
  for (let offset = 0; offset < days; offset += step) {
    const d = new Date(`${start}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + offset);
    const bucketStart = d.toISOString().slice(0, 10);
    d.setUTCDate(d.getUTCDate() + step - 1);
    const bucketEnd =
      d.toISOString().slice(0, 10) < end ? d.toISOString().slice(0, 10) : end;
    trend.push({
      date: bucketStart,
      label: new Date(`${bucketStart}T00:00:00Z`).toLocaleDateString("en", {
        month: "short",
        day: "numeric",
        timeZone: "UTC",
      }),
      applications: scoped.filter((l) =>
        withinAnalyticsWindow(l.submittedAt, bucketStart, bucketEnd),
      ).length,
      conversions: scoped.filter(
        (l) =>
          l.status === "converted" &&
          withinAnalyticsWindow(l.convertedAt, bucketStart, bucketEnd),
      ).length,
    });
  }
  const breakdown = (group: "source" | "package") => {
    const rows = new Map<
      string,
      { name: string; leads: number; converted: number }
    >();
    for (const l of cohort) {
      const key =
        group === "source"
          ? l.source
          : l.packageInterestId || l.packageInterest || "none";
      const name =
        group === "source"
          ? l.sourceLabel || "Manual"
          : l.packageInterestLabelSnapshot ||
            l.packageInterest ||
            "No package selected";
      const row = rows.get(key) || { name, leads: 0, converted: 0 };
      row.leads++;
      if (l.status === "converted") row.converted++;
      rows.set(key, row);
    }
    return [...rows.values()].sort((a, b) => b.leads - a.leads);
  };
  return {
    cohort,
    converted,
    approved,
    pending,
    declined,
    trend,
    rate: analyticsRate(converted.length, cohort.length),
    sources: breakdown("source"),
    packages: breakdown("package"),
    unassigned: leads.filter((l) => !l.convertedWorkspaceId).length,
  };
}

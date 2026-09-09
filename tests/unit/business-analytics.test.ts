import { describe, expect, it } from "vitest";
import {
  analyticsWindow,
  buildAcquisitionAnalytics,
  buildDeliveryAnalytics,
  emptyAnalyticsRecords,
  type AnalyticsClient,
  type AnalyticsLead,
  type AnalyticsRecords,
} from "../../src/features/pt-hub/lib/business-analytics";
import { readAnalyticsPages } from "../../src/features/pt-hub/lib/analytics-pagination";
const now = new Date("2026-09-07T15:00:00Z");
const client = (id: string, workspace = "a", user = id): AnalyticsClient => ({
  id,
  workspace_id: workspace,
  user_id: user,
  display_name: id,
  lifecycle_state: "active",
  relationship_status: "active",
  lifecycle_changed_at: null,
  created_at: "2026-09-01T00:00:00Z",
  last_activity_at: null,
  manual_risk_flag: false,
  risk_flags: [],
  has_overdue_checkin: false,
  churn_reason: null,
});
const lead = (
  id: string,
  changes: Partial<AnalyticsLead> = {},
): AnalyticsLead => ({
  id,
  status: "new",
  submittedAt: "2026-09-04T00:00:00Z",
  convertedAt: null,
  convertedWorkspaceId: null,
  packageInterestId: null,
  packageInterest: null,
  packageInterestLabelSnapshot: null,
  source: "manual",
  sourceLabel: "Manual",
  ...changes,
});
describe("business analytics", () => {
  it("uses inclusive UTC calendar days across a month boundary", () => {
    expect(analyticsWindow("7d", new Date("2026-09-02T01:00:00Z"))).toEqual({
      start: "2026-08-27",
      end: "2026-09-02",
      days: 7,
    });
  });
  it("deduplicates people, preserves memberships, and does not count workspace moves as new people", () => {
    const records = {
      ...emptyAnalyticsRecords,
      clients: [
        { ...client("c1", "a", "same"), created_at: "2025-01-01" },
        client("c2", "b", "same"),
        client("c3", "b", "new"),
      ],
    };
    const all = buildDeliveryAnalytics(records, "30d", "all", now);
    expect(all.uniqueActive).toBe(2);
    expect(all.active).toHaveLength(3);
    expect(all.newClients).toBe(1);
    const b = buildDeliveryAnalytics(records, "30d", "b", now);
    expect(b.active).toHaveLength(2);
    expect(b.newClients).toBe(1);
  });
  it("weights completion by assignments, excluding rest days, future work, and inaccessible clients", () => {
    const records: AnalyticsRecords = {
      ...emptyAnalyticsRecords,
      clients: [client("a"), client("b", "b")],
      workouts: Array.from({ length: 10 }, (_, i) => ({
        id: String(i),
        client_id: i === 0 ? "a" : "b",
        scheduled_date: "2026-09-04",
        status: i === 0 ? "completed" : "planned",
        day_type: "workout",
      })),
    };
    records.workouts.push(
      {
        id: "rest",
        client_id: "a",
        scheduled_date: "2026-09-04",
        status: "completed",
        day_type: "rest",
      },
      {
        id: "future",
        client_id: "a",
        scheduled_date: "2026-09-08",
        status: "planned",
        day_type: "workout",
      },
      {
        id: "outside",
        client_id: "hidden",
        scheduled_date: "2026-09-04",
        status: "completed",
        day_type: "workout",
      },
    );
    expect(buildDeliveryAnalytics(records, "7d", "all", now).workoutRate).toBe(
      10,
    );
    expect(buildDeliveryAnalytics(records, "7d", "a", now).workoutRate).toBe(
      100,
    );
  });
  it("keeps today's due work out of overdue counts and includes older pending reviews", () => {
    const records: AnalyticsRecords = {
      ...emptyAnalyticsRecords,
      clients: [client("a")],
      checkins: [
        {
          id: "today",
          client_id: "a",
          week_ending_saturday: "2026-09-07",
          submitted_at: null,
          reviewed_at: null,
        },
        {
          id: "missed",
          client_id: "a",
          week_ending_saturday: "2026-09-05",
          submitted_at: null,
          reviewed_at: null,
        },
        {
          id: "old",
          client_id: "a",
          week_ending_saturday: "2026-07-05",
          submitted_at: "2026-07-05T00:00:00Z",
          reviewed_at: null,
        },
        {
          id: "reviewed",
          client_id: "a",
          week_ending_saturday: "2026-08-31",
          submitted_at: "2026-09-01T00:00:00Z",
          reviewed_at: "2026-09-02T12:00:00Z",
        },
      ],
    };
    const result = buildDeliveryAnalytics(records, "7d", "all", now);
    expect(result.overdue).toHaveLength(1);
    expect(result.waiting).toHaveLength(1);
    expect(result.checkins).toHaveLength(2);
    expect(result.medianReviewHours).toBe(36);
  });
  it("returns unknown rates for no denominator, not a manufactured zero", () => {
    const result = buildDeliveryAnalytics(
      emptyAnalyticsRecords,
      "7d",
      "all",
      now,
    );
    expect(result.workoutRate).toBeNull();
    expect(result.checkinRate).toBeNull();
    expect(result.medianReviewHours).toBeNull();
    expect(
      buildAcquisitionAnalytics([], "7d", "all", "all", "all", now).rate,
    ).toBeNull();
  });
  it("keeps pending separate from declined and uses actual conversion dates independently of the submission cohort", () => {
    const leads = [
      lead("pending"),
      lead("declined", { status: "declined" }),
      lead("old", {
        status: "converted",
        submittedAt: "2026-07-01",
        convertedAt: "2026-09-06",
        convertedWorkspaceId: "a",
      }),
    ];
    const result = buildAcquisitionAnalytics(
      leads,
      "7d",
      "all",
      "all",
      "all",
      now,
    );
    expect(result.cohort).toHaveLength(2);
    expect(result.pending).toHaveLength(1);
    expect(result.declined).toHaveLength(1);
    expect(result.converted).toHaveLength(0);
    expect(result.trend).toHaveLength(7);
    expect(result.trend.find((p) => p.date === "2026-09-06")?.conversions).toBe(
      1,
    );
    expect(
      result.trend.find((p) => p.date === "2026-09-02")?.applications,
    ).toBe(0);
  });
  it("scopes attributed leads to the workspace and filters package and source together", () => {
    const leads = [
      lead("unassigned"),
      lead("a", {
        convertedWorkspaceId: "a",
        packageInterestId: "p",
        source: "marketplace",
      }),
      lead("b", {
        convertedWorkspaceId: "b",
        packageInterestId: "p",
        source: "marketplace",
      }),
    ];
    const result = buildAcquisitionAnalytics(
      leads,
      "7d",
      "a",
      "p",
      "marketplace",
      now,
    );
    expect(result.cohort.map((l) => l.id)).toEqual(["a"]);
    expect(result.unassigned).toBe(1);
  });
  it("retains archived historical delivery but excludes archived memberships from current totals", () => {
    const records = {
      ...emptyAnalyticsRecords,
      clients: [{ ...client("a"), relationship_status: "removed" }],
      workouts: [
        {
          id: "w",
          client_id: "a",
          scheduled_date: "2026-09-02",
          status: "completed",
          day_type: "workout",
        },
      ],
    };
    const result = buildDeliveryAnalytics(records, "7d", "all", now);
    expect(result.uniqueActive).toBe(0);
    expect(result.workoutRate).toBe(100);
  });
  it("reads every page instead of truncating aggregate data", async () => {
    const offsets: number[] = [];
    const values = await readAnalyticsPages(async (offset) => {
      offsets.push(offset);
      return { data: [1, 2, 3, 4, 5].slice(offset, offset + 2), error: null };
    }, 2);
    expect(values).toEqual([1, 2, 3, 4, 5]);
    expect(offsets).toEqual([0, 2, 4]);
  });
  it("fails the aggregate if a later page fails, rather than returning partial totals", async () => {
    await expect(
      readAnalyticsPages(
        async (offset) =>
          offset
            ? { data: null, error: new Error("failed") }
            : { data: [1, 2], error: null },
        2,
      ),
    ).rejects.toThrow("failed");
  });
});

import { describe, expect, it } from "vitest";
import {
  buildSourceLabel,
  buildWorkoutRunPath,
  resolveUnifiedClientHomeState,
  shouldShowFindCoachSection,
  sortWorkoutsByUrgency,
  type WorkoutLike,
} from "../../src/pages/client/home-unified";

describe("resolveUnifiedClientHomeState", () => {
  it("returns lead_only for pre-workspace lead state", () => {
    expect(
      resolveUnifiedClientHomeState({
        hasWorkspaceMembership: false,
        coachSourceCount: 0,
        hasPersonalSource: false,
      }),
    ).toBe("lead_only");
  });

  it("returns personal_only when only personal source exists", () => {
    expect(
      resolveUnifiedClientHomeState({
        hasWorkspaceMembership: true,
        coachSourceCount: 0,
        hasPersonalSource: true,
      }),
    ).toBe("personal_only");
  });

  it("returns one_pt for a single coach source", () => {
    expect(
      resolveUnifiedClientHomeState({
        hasWorkspaceMembership: true,
        coachSourceCount: 1,
        hasPersonalSource: false,
      }),
    ).toBe("one_pt");
  });

  it("returns multi_pt for multiple coach sources", () => {
    expect(
      resolveUnifiedClientHomeState({
        hasWorkspaceMembership: true,
        coachSourceCount: 2,
        hasPersonalSource: false,
      }),
    ).toBe("multi_pt");
  });

  it("returns mixed for personal + coach sources", () => {
    expect(
      resolveUnifiedClientHomeState({
        hasWorkspaceMembership: true,
        coachSourceCount: 2,
        hasPersonalSource: true,
      }),
    ).toBe("mixed");
  });

  it("avoids hard binary split by considering content sources", () => {
    expect(
      resolveUnifiedClientHomeState({
        hasWorkspaceMembership: false,
        coachSourceCount: 0,
        hasPersonalSource: true,
      }),
    ).toBe("personal_only");
  });
});

describe("sortWorkoutsByUrgency", () => {
  it("prioritizes pending/planned workouts over completed/skipped and keeps mixed sources together", () => {
    const rows: WorkoutLike[] = [
      {
        id: "completed",
        status: "completed",
        day_type: "workout",
        scheduled_date: "2026-04-12",
        created_at: "2026-04-12T08:00:00.000Z",
      },
      {
        id: "planned",
        status: "planned",
        day_type: "workout",
        scheduled_date: "2026-04-12",
        created_at: "2026-04-12T09:00:00.000Z",
      },
      {
        id: "skipped",
        status: "skipped",
        day_type: "workout",
        scheduled_date: "2026-04-12",
        created_at: "2026-04-12T10:00:00.000Z",
      },
    ];

    expect(sortWorkoutsByUrgency(rows).map((row) => row.id)).toEqual([
      "planned",
      "completed",
      "skipped",
    ]);
  });
});

describe("source labels", () => {
  it("renders Personal for workspace-less items", () => {
    expect(buildSourceLabel({ workspaceId: null })).toBe("Personal");
  });

  it("renders coach labels with workspace names", () => {
    expect(
      buildSourceLabel({ workspaceId: "ws-1", workspaceName: "Sarah" }),
    ).toBe("Coach Sarah");
    expect(
      buildSourceLabel({ workspaceId: "ws-1", workspaceName: "Coach Omar" }),
    ).toBe("Coach Omar");
  });
});

describe("navigation helpers", () => {
  it("keeps workout start path on the existing runner route", () => {
    expect(buildWorkoutRunPath("workout-123")).toBe(
      "/app/workout-run/workout-123",
    );
  });
});

describe("find-coach visibility", () => {
  it("shows find-coach for lead/pre-workspace users", () => {
    expect(
      shouldShowFindCoachSection({
        hasWorkspaceMembership: false,
        pendingApplications: 0,
        approvedPendingWorkspace: 0,
        savedCoachCount: 0,
      }),
    ).toBe(true);
  });

  it("shows find-coach when discovery states are present", () => {
    expect(
      shouldShowFindCoachSection({
        hasWorkspaceMembership: true,
        pendingApplications: 1,
        approvedPendingWorkspace: 0,
        savedCoachCount: 0,
      }),
    ).toBe(true);
  });

  it("hides find-coach when no discovery context is relevant", () => {
    expect(
      shouldShowFindCoachSection({
        hasWorkspaceMembership: true,
        pendingApplications: 0,
        approvedPendingWorkspace: 0,
        savedCoachCount: 0,
      }),
    ).toBe(false);
  });
});


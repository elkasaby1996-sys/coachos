import { describe, expect, it } from "vitest";
import {
  applySupersetDragGrouping,
  applyUnifiedWorkoutFilter,
  buildWorkoutSummaryPath,
  canManagePersonalWorkout,
  groupUnifiedWorkoutsByState,
  preparePersonalWorkoutDraft,
  removeExerciseFromSuperset,
  resolveWorkoutPrimaryAction,
  type UnifiedWorkoutRow,
} from "../../src/pages/client/workouts-unified";

const todayKey = "2026-04-12";

const baseRows: UnifiedWorkoutRow[] = [
  {
    id: "in-progress-personal",
    status: "planned",
    dayType: "workout",
    scheduledDate: "2026-04-12",
    createdAt: "2026-04-12T05:00:00.000Z",
    completedAt: null,
    sourceWorkspaceId: null,
    sourceLabel: "Personal",
    sourceKind: "personal",
    workoutName: "Personal Lower Body",
    workoutTypeTag: "Strength",
    coachNote: null,
    programName: null,
    programDayIndex: null,
    hasActiveSession: true,
  },
  {
    id: "today-assigned",
    status: "planned",
    dayType: "workout",
    scheduledDate: "2026-04-12",
    createdAt: "2026-04-12T06:00:00.000Z",
    completedAt: null,
    sourceWorkspaceId: "ws-1",
    sourceLabel: "Coach Sarah",
    sourceKind: "assigned",
    workoutName: "Coach Strength Day",
    workoutTypeTag: "Strength",
    coachNote: "Stay tight on your hinge.",
    programName: "Spring Block",
    programDayIndex: 3,
    hasActiveSession: false,
  },
  {
    id: "upcoming-assigned",
    status: "planned",
    dayType: "workout",
    scheduledDate: "2026-04-14",
    createdAt: "2026-04-12T07:00:00.000Z",
    completedAt: null,
    sourceWorkspaceId: "ws-2",
    sourceLabel: "Coach Omar",
    sourceKind: "assigned",
    workoutName: "Upper Hypertrophy",
    workoutTypeTag: "Hypertrophy",
    coachNote: null,
    programName: "Hypertrophy Block",
    programDayIndex: 1,
    hasActiveSession: false,
  },
  {
    id: "completed-personal",
    status: "completed",
    dayType: "workout",
    scheduledDate: "2026-04-11",
    createdAt: "2026-04-11T06:00:00.000Z",
    completedAt: "2026-04-11T10:00:00.000Z",
    sourceWorkspaceId: null,
    sourceLabel: "Personal",
    sourceKind: "personal",
    workoutName: "Personal Conditioning",
    workoutTypeTag: "Conditioning",
    coachNote: null,
    programName: null,
    programDayIndex: null,
    hasActiveSession: false,
  },
  {
    id: "skipped-assigned",
    status: "skipped",
    dayType: "workout",
    scheduledDate: "2026-04-10",
    createdAt: "2026-04-10T06:00:00.000Z",
    completedAt: null,
    sourceWorkspaceId: "ws-1",
    sourceLabel: "Coach Sarah",
    sourceKind: "assigned",
    workoutName: "Missed Session",
    workoutTypeTag: "Strength",
    coachNote: null,
    programName: "Spring Block",
    programDayIndex: 2,
    hasActiveSession: false,
  },
];

describe("groupUnifiedWorkoutsByState", () => {
  it("renders one merged model by relevance instead of source containers", () => {
    const grouped = groupUnifiedWorkoutsByState(baseRows, todayKey);

    expect(grouped.inProgress.map((row) => row.id)).toEqual([
      "in-progress-personal",
    ]);
    expect(grouped.today.map((row) => row.id)).toEqual(["today-assigned"]);
    expect(grouped.upcoming.map((row) => row.id)).toEqual(["upcoming-assigned"]);
    expect(grouped.recentlyCompleted.map((row) => row.id)).toEqual([
      "completed-personal",
      "skipped-assigned",
    ]);
  });

  it("keeps mixed personal + assigned workouts together inside the same section", () => {
    const rows: UnifiedWorkoutRow[] = [
      {
        ...baseRows[1],
        id: "today-assigned-2",
      },
      {
        ...baseRows[1],
        id: "today-personal-2",
        sourceWorkspaceId: null,
        sourceKind: "personal",
        sourceLabel: "Personal",
      },
    ];
    const grouped = groupUnifiedWorkoutsByState(rows, todayKey);
    expect(grouped.today.map((row) => row.id)).toEqual([
      "today-assigned-2",
      "today-personal-2",
    ]);
    expect(grouped.today.map((row) => row.sourceLabel)).toEqual([
      "Coach Sarah",
      "Personal",
    ]);
  });
});

describe("applyUnifiedWorkoutFilter", () => {
  it("supports all required filters", () => {
    expect(
      applyUnifiedWorkoutFilter(baseRows, "all", todayKey).map((row) => row.id),
    ).toHaveLength(baseRows.length);
    expect(
      applyUnifiedWorkoutFilter(baseRows, "assigned", todayKey).every(
        (row) => row.sourceKind === "assigned",
      ),
    ).toBe(true);
    expect(
      applyUnifiedWorkoutFilter(baseRows, "personal", todayKey).every(
        (row) => row.sourceKind === "personal",
      ),
    ).toBe(true);
    expect(
      applyUnifiedWorkoutFilter(baseRows, "today", todayKey).map((row) => row.id),
    ).toEqual(["in-progress-personal", "today-assigned"]);
    expect(
      applyUnifiedWorkoutFilter(baseRows, "upcoming", todayKey).map(
        (row) => row.id,
      ),
    ).toEqual(["upcoming-assigned"]);
  });

  it("returns an empty list cleanly when the selected source is unavailable", () => {
    const assignedOnly = baseRows.filter((row) => row.sourceKind === "assigned");
    expect(applyUnifiedWorkoutFilter(assignedOnly, "personal", todayKey)).toEqual(
      [],
    );
  });
});

describe("resolveWorkoutPrimaryAction", () => {
  it("shows Resume for in-progress workouts", () => {
    expect(resolveWorkoutPrimaryAction(baseRows[0])).toEqual({
      label: "Resume workout",
      href: "/app/workout-run/in-progress-personal",
    });
  });

  it("shows Start for scheduled workouts and keeps runner path shared", () => {
    expect(resolveWorkoutPrimaryAction(baseRows[1])).toEqual({
      label: "Start workout",
      href: "/app/workout-run/today-assigned",
    });
  });

  it("keeps personal workouts on the same runner/session contract", () => {
    const personalPlanned: UnifiedWorkoutRow = {
      ...baseRows[1],
      id: "personal-planned",
      sourceWorkspaceId: null,
      sourceKind: "personal",
      sourceLabel: "Personal",
    };

    expect(resolveWorkoutPrimaryAction(personalPlanned)).toEqual({
      label: "Start workout",
      href: "/app/workout-run/personal-planned",
    });
  });

  it("uses summary path for completed workouts", () => {
    expect(resolveWorkoutPrimaryAction(baseRows[3])).toEqual({
      label: "View summary",
      href: "/app/workout-summary/completed-personal",
    });
  });

  it("keeps skipped workouts historical with view action", () => {
    expect(resolveWorkoutPrimaryAction(baseRows[4])).toEqual({
      label: "View workout",
      href: "/app/workouts/skipped-assigned",
    });
  });
});

describe("canManagePersonalWorkout", () => {
  it("allows management for personal workouts without active sessions", () => {
    expect(canManagePersonalWorkout(baseRows[3])).toBe(true);
  });

  it("blocks management for active personal workouts and assigned workouts", () => {
    expect(canManagePersonalWorkout(baseRows[0])).toBe(false);
    expect(canManagePersonalWorkout(baseRows[1])).toBe(false);
  });
});

describe("path helpers", () => {
  it("builds workout summary paths on the existing route contract", () => {
    expect(buildWorkoutSummaryPath("session-123")).toBe(
      "/app/workout-summary/session-123",
    );
  });
});

describe("preparePersonalWorkoutDraft", () => {
  it("builds a runnable personal workout payload with exercises", () => {
    const payload = preparePersonalWorkoutDraft({
      workoutName: "  Personal Push  ",
      scheduledDate: "2026-04-12",
      exerciseDrafts: [
        { name: " Push Up ", sets: "4", reps: "12", supersetGroup: " a " },
        { name: "Push Up", sets: "5", reps: "10", supersetGroup: "A" },
        { name: "Dumbbell Press", sets: "0", reps: "8-10", supersetGroup: "a" },
      ],
    });

    expect(payload.workoutName).toBe("Personal Push");
    expect(payload.scheduledDate).toBe("2026-04-12");
    expect(payload.exercises).toEqual([
      {
        name: "Push Up",
        sets: 4,
        reps: "12",
        supersetGroup: "A",
        sortOrder: 10,
      },
      {
        name: "Dumbbell Press",
        sets: 3,
        reps: "8-10",
        supersetGroup: "A",
        sortOrder: 20,
      },
    ]);
  });

  it("clears invalid single-member supersets before saving", () => {
    const payload = preparePersonalWorkoutDraft({
      workoutName: "Personal Session",
      scheduledDate: "2026-04-12",
      exerciseDrafts: [
        { name: "Rows", sets: "3", reps: "10", supersetGroup: "A" },
      ],
    });

    expect(payload.exercises).toEqual([
      { name: "Rows", sets: 3, reps: "10", supersetGroup: null, sortOrder: 10 },
    ]);
  });

  it("keeps standalone exercises without a superset group", () => {
    const payload = preparePersonalWorkoutDraft({
      workoutName: "Personal Session",
      scheduledDate: "2026-04-12",
      exerciseDrafts: [
        { name: "Rows", sets: "3", reps: "10", supersetGroup: "  " },
      ],
    });

    expect(payload.exercises).toEqual([
      { name: "Rows", sets: 3, reps: "10", supersetGroup: null, sortOrder: 10 },
    ]);
  });

  it("rejects empty workout names", () => {
    expect(() =>
      preparePersonalWorkoutDraft({
        workoutName: "   ",
        scheduledDate: "2026-04-12",
        exerciseDrafts: [
          { name: "Push Up", sets: "3", reps: "10", supersetGroup: "" },
        ],
      }),
    ).toThrow("Workout name is required.");
  });

  it("requires at least one exercise for runner compatibility", () => {
    expect(() =>
      preparePersonalWorkoutDraft({
        workoutName: "Personal Session",
        scheduledDate: "2026-04-12",
        exerciseDrafts: [{ name: " ", sets: "3", reps: "10", supersetGroup: "" }],
      }),
    ).toThrow("Add at least one exercise to create a workout.");
  });
});

describe("superset drag helpers", () => {
  it("creates a new superset group when dragging between standalone exercises", () => {
    const next = applySupersetDragGrouping(
      [
        { name: "A", sets: "3", reps: "10", supersetGroup: "" },
        { name: "B", sets: "3", reps: "10", supersetGroup: "" },
      ],
      0,
      1,
    );

    expect(next[0].supersetGroup).toBe("A");
    expect(next[1].supersetGroup).toBe("A");
  });

  it("adds dragged exercise to target's existing superset group", () => {
    const next = applySupersetDragGrouping(
      [
        { name: "A", sets: "3", reps: "10", supersetGroup: "" },
        { name: "B", sets: "3", reps: "10", supersetGroup: "C" },
        { name: "C", sets: "3", reps: "10", supersetGroup: "C" },
      ],
      0,
      1,
    );

    expect(next[0].supersetGroup).toBe("C");
    expect(next[1].supersetGroup).toBe("C");
    expect(next[2].supersetGroup).toBe("C");
  });

  it("removes an exercise from superset and cleans up orphaned groups", () => {
    const next = removeExerciseFromSuperset(
      [
        { name: "A", sets: "3", reps: "10", supersetGroup: "D" },
        { name: "B", sets: "3", reps: "10", supersetGroup: "D" },
      ],
      0,
    );

    expect(next[0].supersetGroup).toBe("");
    expect(next[1].supersetGroup).toBe("");
  });
});

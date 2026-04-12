import { buildWorkoutRunPath } from "./home-unified";

export type UnifiedWorkoutSourceKind = "assigned" | "personal";

export type UnifiedWorkoutFilterKey =
  | "all"
  | "assigned"
  | "personal"
  | "today"
  | "upcoming";

export type PersonalWorkoutExerciseDraft = {
  name: string;
  sets: string;
  reps: string;
  supersetGroup: string;
};

export type PreparedPersonalWorkoutDraft = {
  workoutName: string;
  scheduledDate: string;
  exercises: Array<{
    name: string;
    sets: number;
    reps: string | null;
    supersetGroup: string | null;
    sortOrder: number;
  }>;
};

export const unifiedWorkoutFilters: Array<{
  key: UnifiedWorkoutFilterKey;
  label: string;
}> = [
  { key: "all", label: "All" },
  { key: "assigned", label: "Assigned" },
  { key: "personal", label: "Personal" },
  { key: "today", label: "Today" },
  { key: "upcoming", label: "Upcoming" },
];

export type UnifiedWorkoutRow = {
  id: string;
  status: string | null;
  dayType: string | null;
  scheduledDate: string | null;
  createdAt: string | null;
  completedAt: string | null;
  sourceWorkspaceId: string | null;
  sourceLabel: string;
  sourceKind: UnifiedWorkoutSourceKind;
  workoutName: string;
  workoutTypeTag: string | null;
  coachNote: string | null;
  programName: string | null;
  programDayIndex: number | null;
  hasActiveSession: boolean;
};

export type UnifiedWorkoutSections = {
  inProgress: UnifiedWorkoutRow[];
  today: UnifiedWorkoutRow[];
  upcoming: UnifiedWorkoutRow[];
  recentlyCompleted: UnifiedWorkoutRow[];
};

type WorkoutPrimaryAction = {
  label: string;
  href: string;
};

const getDateRank = (value: string | null, fallback: number) => {
  if (!value) return fallback;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : fallback;
};

const normalizeWorkoutStatus = (status: string | null | undefined) => {
  if (!status) return "planned";
  if (status === "pending") return "planned";
  return status;
};

const normalizeExerciseName = (value: string) =>
  value
    .trim()
    .replace(/\s+/g, " ");

const normalizeSupersetGroup = (value: string) =>
  value
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase()
    .slice(0, 16);

const parseExerciseSets = (value: string) => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return 3;
  }
  return Math.min(parsed, 20);
};

export const isTerminalWorkoutStatus = (status: string | null | undefined) => {
  const normalized = normalizeWorkoutStatus(status);
  return normalized === "completed" || normalized === "skipped";
};

export function preparePersonalWorkoutDraft(params: {
  workoutName: string;
  scheduledDate: string;
  exerciseDrafts: PersonalWorkoutExerciseDraft[];
}): PreparedPersonalWorkoutDraft {
  const workoutName = normalizeExerciseName(params.workoutName);
  if (!workoutName) {
    throw new Error("Workout name is required.");
  }

  const scheduledDate = params.scheduledDate.trim();
  if (!scheduledDate) {
    throw new Error("Workout date is required.");
  }

  const deduped = new Set<string>();
  const exercises = params.exerciseDrafts
    .map((draft) => {
      const name = normalizeExerciseName(draft.name);
      if (!name) return null;
      const dedupeKey = name.toLowerCase();
      if (deduped.has(dedupeKey)) return null;
      deduped.add(dedupeKey);
      const supersetGroup = normalizeSupersetGroup(draft.supersetGroup);
      return {
        name,
        sets: parseExerciseSets(draft.sets),
        reps: draft.reps.trim() || null,
        supersetGroup: supersetGroup || null,
      };
    })
    .filter(
      (
        row,
      ): row is {
        name: string;
        sets: number;
        reps: string | null;
        supersetGroup: string | null;
      } => Boolean(row),
    )
    .map((row, index) => ({
      ...row,
      sortOrder: (index + 1) * 10,
    }));

  if (exercises.length === 0) {
    throw new Error("Add at least one exercise to create a workout.");
  }

  return {
    workoutName,
    scheduledDate,
    exercises,
  };
}

const isScheduledFuture = (scheduledDate: string | null, todayKey: string) =>
  Boolean(scheduledDate && scheduledDate > todayKey);

const isDueTodayOrOverdue = (scheduledDate: string | null, todayKey: string) =>
  Boolean(!scheduledDate || scheduledDate <= todayKey);

export function applyUnifiedWorkoutFilter(
  rows: UnifiedWorkoutRow[],
  filter: UnifiedWorkoutFilterKey,
  todayKey: string,
) {
  switch (filter) {
    case "assigned":
      return rows.filter((row) => row.sourceKind === "assigned");
    case "personal":
      return rows.filter((row) => row.sourceKind === "personal");
    case "today":
      return rows.filter((row) => {
        if (row.hasActiveSession && !isTerminalWorkoutStatus(row.status)) {
          return true;
        }
        if (isTerminalWorkoutStatus(row.status)) {
          return false;
        }
        return isDueTodayOrOverdue(row.scheduledDate, todayKey);
      });
    case "upcoming":
      return rows.filter(
        (row) =>
          !row.hasActiveSession &&
          !isTerminalWorkoutStatus(row.status) &&
          isScheduledFuture(row.scheduledDate, todayKey),
      );
    case "all":
    default:
      return rows;
  }
}

export function groupUnifiedWorkoutsByState(
  rows: UnifiedWorkoutRow[],
  todayKey: string,
): UnifiedWorkoutSections {
  const grouped: UnifiedWorkoutSections = {
    inProgress: [],
    today: [],
    upcoming: [],
    recentlyCompleted: [],
  };

  rows.forEach((row) => {
    if (row.hasActiveSession && !isTerminalWorkoutStatus(row.status)) {
      grouped.inProgress.push(row);
      return;
    }

    if (isTerminalWorkoutStatus(row.status)) {
      grouped.recentlyCompleted.push(row);
      return;
    }

    if (isScheduledFuture(row.scheduledDate, todayKey)) {
      grouped.upcoming.push(row);
      return;
    }

    grouped.today.push(row);
  });

  grouped.inProgress.sort((a, b) => {
    const scheduleDiff =
      getDateRank(a.scheduledDate, Number.MAX_SAFE_INTEGER) -
      getDateRank(b.scheduledDate, Number.MAX_SAFE_INTEGER);
    if (scheduleDiff !== 0) return scheduleDiff;
    return getDateRank(b.createdAt, 0) - getDateRank(a.createdAt, 0);
  });

  grouped.today.sort((a, b) => {
    const overdueRankA =
      a.scheduledDate && a.scheduledDate < todayKey
        ? 0
        : a.scheduledDate === todayKey
          ? 1
          : 2;
    const overdueRankB =
      b.scheduledDate && b.scheduledDate < todayKey
        ? 0
        : b.scheduledDate === todayKey
          ? 1
          : 2;
    if (overdueRankA !== overdueRankB) return overdueRankA - overdueRankB;
    return (
      getDateRank(a.scheduledDate, Number.MAX_SAFE_INTEGER) -
      getDateRank(b.scheduledDate, Number.MAX_SAFE_INTEGER)
    );
  });

  grouped.upcoming.sort(
    (a, b) =>
      getDateRank(a.scheduledDate, Number.MAX_SAFE_INTEGER) -
      getDateRank(b.scheduledDate, Number.MAX_SAFE_INTEGER),
  );

  grouped.recentlyCompleted.sort((a, b) => {
    const completedDiff =
      getDateRank(b.completedAt, 0) - getDateRank(a.completedAt, 0);
    if (completedDiff !== 0) return completedDiff;
    return getDateRank(b.scheduledDate, 0) - getDateRank(a.scheduledDate, 0);
  });

  return grouped;
}

export function buildWorkoutSummaryPath(assignedWorkoutId: string) {
  return `/app/workout-summary/${assignedWorkoutId}`;
}

export function buildWorkoutDetailPath(assignedWorkoutId: string) {
  return `/app/workouts/${assignedWorkoutId}`;
}

export function canManagePersonalWorkout(row: UnifiedWorkoutRow) {
  return row.sourceKind === "personal" && !row.hasActiveSession;
}

export function resolveWorkoutPrimaryAction(
  row: UnifiedWorkoutRow,
): WorkoutPrimaryAction {
  const normalizedStatus = normalizeWorkoutStatus(row.status);

  if (row.hasActiveSession && !isTerminalWorkoutStatus(normalizedStatus)) {
    return {
      label: "Resume workout",
      href: buildWorkoutRunPath(row.id),
    };
  }

  if (normalizedStatus === "completed") {
    return {
      label: "View summary",
      href: buildWorkoutSummaryPath(row.id),
    };
  }

  if (normalizedStatus === "skipped") {
    return {
      label: "View workout",
      href: buildWorkoutDetailPath(row.id),
    };
  }

  return {
    label: "Start workout",
    href: buildWorkoutRunPath(row.id),
  };
}

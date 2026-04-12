export type UnifiedClientHomeState =
  | "lead_only"
  | "personal_only"
  | "one_pt"
  | "multi_pt"
  | "mixed";

type HomeStateParams = {
  hasWorkspaceMembership: boolean;
  coachSourceCount: number;
  hasPersonalSource: boolean;
};

export function resolveUnifiedClientHomeState(
  params: HomeStateParams,
): UnifiedClientHomeState {
  if (!params.hasWorkspaceMembership && params.coachSourceCount === 0) {
    return params.hasPersonalSource ? "personal_only" : "lead_only";
  }

  if (params.coachSourceCount === 0 && params.hasPersonalSource) {
    return "personal_only";
  }

  if (params.coachSourceCount <= 0) {
    return params.hasWorkspaceMembership ? "personal_only" : "lead_only";
  }

  if (!params.hasPersonalSource) {
    return params.coachSourceCount > 1 ? "multi_pt" : "one_pt";
  }

  return "mixed";
}

type SourceLabelParams = {
  workspaceId: string | null | undefined;
  workspaceName?: string | null;
};

export function buildSourceLabel(params: SourceLabelParams) {
  if (!params.workspaceId) return "Personal";

  const normalizedName = params.workspaceName?.trim() ?? "";
  if (!normalizedName) return "Coach";

  if (/^coach\s+/i.test(normalizedName)) return normalizedName;
  return `Coach ${normalizedName}`;
}

export type WorkoutLike = {
  id: string;
  status: string | null;
  day_type: string | null;
  scheduled_date: string | null;
  created_at: string | null;
  coach_note?: string | null;
  [key: string]: unknown;
};

function getWorkoutUrgencyRank(workout: WorkoutLike) {
  if (workout.day_type === "rest") return 4;

  switch (workout.status) {
    case "pending":
    case "planned":
      return 0;
    case "completed":
      return 2;
    case "skipped":
      return 3;
    default:
      return 1;
  }
}

function getDateRank(value: string | null) {
  if (!value) return Number.MAX_SAFE_INTEGER;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : Number.MAX_SAFE_INTEGER;
}

export function sortWorkoutsByUrgency<T extends WorkoutLike>(workouts: T[]) {
  return [...workouts].sort((a, b) => {
    const urgencyDiff = getWorkoutUrgencyRank(a) - getWorkoutUrgencyRank(b);
    if (urgencyDiff !== 0) return urgencyDiff;

    const scheduleDiff = getDateRank(a.scheduled_date) - getDateRank(b.scheduled_date);
    if (scheduleDiff !== 0) return scheduleDiff;

    return getDateRank(b.created_at) - getDateRank(a.created_at);
  });
}

type DiscoveryVisibilityParams = {
  hasWorkspaceMembership: boolean;
  pendingApplications: number;
  approvedPendingWorkspace: number;
  savedCoachCount: number;
};

export function shouldShowFindCoachSection(params: DiscoveryVisibilityParams) {
  if (!params.hasWorkspaceMembership) return true;

  return (
    params.pendingApplications > 0 ||
    params.approvedPendingWorkspace > 0 ||
    params.savedCoachCount > 0
  );
}

export function buildWorkoutRunPath(assignedWorkoutId: string) {
  return `/app/workout-run/${assignedWorkoutId}`;
}

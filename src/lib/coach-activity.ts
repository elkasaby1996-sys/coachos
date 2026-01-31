import { supabase } from "./supabase";

export type CoachActivityAction =
  | "workout_assigned"
  | "targets_updated"
  | "plan_updated"
  | "baseline_reviewed";

export type CoachActivityLogPayload = {
  clientId: string | null | undefined;
  workspaceId: string | null | undefined;
  action: CoachActivityAction;
  metadata?: Record<string, unknown> | null;
};

export const logCoachActivity = async ({
  clientId,
  workspaceId,
  action,
  metadata,
}: CoachActivityLogPayload) => {
  if (!clientId || !workspaceId) return { error: null };
  const { error } = await supabase.from("coach_activity_log").insert({
    client_id: clientId,
    workspace_id: workspaceId,
    action,
    metadata: metadata ?? null,
  });
  if (error) {
    console.error("COACH_ACTIVITY_LOG_ERROR", error);
  }
  return { error };
};

export const getCoachActionLabel = (action: string | null | undefined) => {
  switch (action) {
    case "workout_assigned":
      return "Workout assigned";
    case "targets_updated":
      return "Targets updated";
    case "plan_updated":
      return "Plan updated";
    case "baseline_reviewed":
      return "Baseline reviewed";
    default:
      return action ? action.replace(/_/g, " ") : "Coach action";
  }
};

import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../../../lib/auth";
import { supabase } from "../../../lib/supabase";
import {
  getCompletionPercent,
  getDraftFields,
  getResumeStep,
  getStepProgress,
  isOnboardingAwaitingReview,
  isOnboardingEditable,
} from "../lib/client-onboarding";
import type {
  ClientBaselineEntrySummary,
  ClientOnboardingClientProfile,
  ClientOnboardingSummary,
  WorkspaceClientOnboardingRow,
} from "../types";

type BaselineQueryRow = {
  id: string;
  status: string | null;
  created_at: string | null;
  submitted_at: string | null;
};

const onboardingSelect = [
  "id",
  "workspace_id",
  "client_id",
  "source",
  "status",
  "basics",
  "goals",
  "training_history",
  "injuries_limitations",
  "nutrition_lifestyle",
  "step_state",
  "initial_baseline_entry_id",
  "coach_review_notes",
  "first_program_template_id",
  "first_program_applied_at",
  "first_checkin_template_id",
  "first_checkin_date",
  "first_checkin_scheduled_at",
  "reviewed_by_user_id",
  "last_saved_at",
  "submitted_at",
  "reviewed_at",
  "activated_at",
  "completed_at",
  "started_at",
  "created_at",
  "updated_at",
].join(", ");

function toBaselineSummary(
  row: BaselineQueryRow | null | undefined,
): ClientBaselineEntrySummary | null {
  if (!row?.id) return null;
  return {
    id: row.id,
    status: row.status,
    created_at: row.created_at,
    submitted_at: row.submitted_at,
  };
}

export function useClientOnboarding() {
  const { session, user } = useAuth();

  return useQuery({
    queryKey: ["client-workspace-onboarding", session?.user?.id],
    enabled: Boolean(session?.user?.id),
    queryFn: async () => {
      const userId = session?.user?.id;
      if (!userId) return null as ClientOnboardingSummary | null;

      const { data: clientData, error: clientError } = await supabase
        .from("clients")
        .select(
          "id, workspace_id, display_name, phone, location, location_country, timezone, gender, unit_preference, goal, injuries, limitations, equipment, days_per_week, gym_name, email, training_type",
        )
        .eq("user_id", userId)
        .maybeSingle();

      if (clientError) throw clientError;
      if (!clientData?.id || !clientData.workspace_id) {
        return null as ClientOnboardingSummary | null;
      }

      const client = clientData as ClientOnboardingClientProfile;

      const { error: ensureError } = await supabase.rpc(
        "ensure_workspace_client_onboarding",
        {
          p_client_id: client.id,
        },
      );

      if (ensureError) throw ensureError;

      const [
        { data: onboardingData, error: onboardingError },
        { data: baselineRows, error: baselineError },
      ] = await Promise.all([
        supabase
          .from("workspace_client_onboardings")
          .select(onboardingSelect)
          .eq("workspace_id", client.workspace_id)
          .eq("client_id", client.id)
          .returns<WorkspaceClientOnboardingRow>()
          .maybeSingle(),
        supabase
          .from("baseline_entries")
          .select("id, status, created_at, submitted_at")
          .eq("client_id", client.id)
          .order("created_at", { ascending: false })
          .returns<BaselineQueryRow[]>()
          .limit(20),
      ]);

      if (onboardingError) throw onboardingError;
      if (baselineError) throw baselineError;
      if (!onboardingData) return null as ClientOnboardingSummary | null;

      const onboarding = onboardingData as WorkspaceClientOnboardingRow;
      const baselineItems = (baselineRows ?? []) as BaselineQueryRow[];
      const latestDraftBaseline =
        baselineItems.find((row) => row.status !== "submitted") ?? null;
      const latestSubmittedBaseline =
        baselineItems.find((row) => row.status === "submitted") ?? null;
      const linkedSubmittedBaseline =
        baselineItems.find(
          (row) =>
            row.id === onboarding.initial_baseline_entry_id &&
            row.status === "submitted",
        ) ?? null;

      const draft = getDraftFields(client, onboarding, user?.email);
      const progress = getStepProgress({
        draft,
        latestSubmittedBaseline: toBaselineSummary(latestSubmittedBaseline),
        linkedSubmittedBaseline: toBaselineSummary(linkedSubmittedBaseline),
      });

      const completionPercent = getCompletionPercent(progress);
      const resumeStep = getResumeStep({
        status: onboarding.status,
        progress,
        stepState: onboarding.step_state,
      });

      return {
        client,
        onboarding,
        latestDraftBaseline: toBaselineSummary(latestDraftBaseline),
        latestSubmittedBaseline: toBaselineSummary(latestSubmittedBaseline),
        linkedSubmittedBaseline: toBaselineSummary(linkedSubmittedBaseline),
        progress,
        resumeStep,
        completionPercent,
        canEdit: isOnboardingEditable(onboarding.status),
        awaitingReview: isOnboardingAwaitingReview(onboarding.status),
      } satisfies ClientOnboardingSummary;
    },
  });
}

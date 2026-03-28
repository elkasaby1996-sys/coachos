import type {
  ClientOnboardingStatus,
  WorkspaceClientOnboardingRow,
} from "../../client-onboarding/types";

export type PtOnboardingChecklistItem = {
  key: "intake_submitted" | "baseline_submitted" | "intake_reviewed";
  label: string;
  detail: string;
  complete: boolean;
  optional?: boolean;
};

export const ptOnboardingSelect = [
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

export function getPtOnboardingStatusMeta(
  status: ClientOnboardingStatus | null | undefined,
) {
  switch (status) {
    case "invited":
      return {
        label: "Not started",
        description:
          "The client joined the workspace but has not started intake.",
        variant: "warning" as const,
      };
    case "in_progress":
      return {
        label: "In progress",
        description: "The client is still working through onboarding steps.",
        variant: "secondary" as const,
      };
    case "review_needed":
      return {
        label: "Needs review",
        description:
          "The client submitted onboarding and it is ready for PT review.",
        variant: "warning" as const,
      };
    case "submitted":
      return {
        label: "Reviewed",
        description:
          "The intake has been reviewed and is waiting for final completion.",
        variant: "secondary" as const,
      };
    case "partially_activated":
      return {
        label: "Reviewed",
        description:
          "This onboarding is using an older intermediate state and will be treated as reviewed.",
        variant: "secondary" as const,
      };
    case "completed":
      return {
        label: "Completed",
        description: "This client is fully onboarded in the workspace.",
        variant: "success" as const,
      };
    default:
      return {
        label: "Unavailable",
        description: "Onboarding state has not been loaded.",
        variant: "muted" as const,
      };
  }
}

export function formatOnboardingSource(
  source: WorkspaceClientOnboardingRow["source"] | null | undefined,
) {
  if (source === "converted_lead") return "Converted lead";
  return "Direct invite";
}

export function getOnboardingReviewBadgeLabel(
  status: ClientOnboardingStatus | null | undefined,
) {
  if (status === "review_needed") return "Needs review";
  if (status === "submitted") return "Reviewed";
  if (status === "partially_activated") return "Reviewed";
  if (status === "completed") return "Completed";
  return "In progress";
}

export function toDisplayText(value: unknown, fallback = "Not provided") {
  if (Array.isArray(value)) {
    const items = value
      .map((item) => (typeof item === "string" ? item.trim() : ""))
      .filter(Boolean);
    return items.length > 0 ? items.join(", ") : fallback;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  if (typeof value === "string") {
    return value.trim() || fallback;
  }
  return fallback;
}

export function buildPtOnboardingChecklist(params: {
  onboarding: WorkspaceClientOnboardingRow | null | undefined;
  baselineSubmitted: boolean;
}) {
  const onboarding = params.onboarding;
  const intakeSubmitted = Boolean(onboarding?.submitted_at);
  const intakeReviewed = Boolean(onboarding?.reviewed_at);

  return [
    {
      key: "intake_submitted",
      label: "Intake submitted",
      detail: "Client submitted the guided onboarding answers.",
      complete: intakeSubmitted,
    },
    {
      key: "baseline_submitted",
      label: "Initial assessment submitted",
      detail: "A submitted baseline is linked to this onboarding cycle.",
      complete: params.baselineSubmitted,
    },
    {
      key: "intake_reviewed",
      label: "Intake reviewed",
      detail: "Coach review has been logged for this onboarding.",
      complete: intakeReviewed,
    },
  ] satisfies PtOnboardingChecklistItem[];
}

export function isReadyForOnboardingCompletion(
  checklist: PtOnboardingChecklistItem[],
) {
  return checklist
    .filter((item) => !item.optional)
    .every((item) => item.complete);
}

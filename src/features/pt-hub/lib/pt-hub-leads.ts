import type { PTLeadStatus, PTPublicLeadInput } from "../types";

export function normalizePtLeadStatus(
  status: string | null | undefined,
): PTLeadStatus {
  switch (status) {
    case "new":
      return "new";
    case "reviewed":
      return "new";
    case "contacted":
      return "contacted";
    case "consultation_booked":
      return "contacted";
    case "approved_pending_workspace":
      return "approved_pending_workspace";
    case "accepted":
      return "converted";
    case "converted":
      return "converted";
    case "rejected":
      return "declined";
    case "archived":
      return "declined";
    case "declined":
      return "declined";
    default:
      return "new";
  }
}

function slugifyLeadValue(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export type PublicPtApplicationRpcInput = {
  p_slug: string;
  p_full_name: string;
  p_phone: string;
  p_goal_summary: string;
  p_training_experience: string;
  p_package_interest_id: string | null;
  p_package_interest_label_snapshot: string | null;
};

export function buildPublicPtApplicationRpcInput(params: {
  input: PTPublicLeadInput;
  authenticatedEmail: string;
  authenticatedFullName: string;
}): PublicPtApplicationRpcInput {
  const authenticatedEmail = params.authenticatedEmail.trim().toLowerCase();
  if (!authenticatedEmail) {
    throw new Error(
      "Your account email is missing. Update your account email and try again.",
    );
  }

  const resolvedFullName =
    params.input.fullName.trim() || params.authenticatedFullName.trim();
  if (!resolvedFullName) {
    throw new Error("Full name is required.");
  }

  if (!params.input.goalSummary.trim()) {
    throw new Error("Goal summary is required.");
  }

  return {
    p_slug: slugifyLeadValue(params.input.slug),
    p_full_name: resolvedFullName,
    p_phone: params.input.phone.trim(),
    p_goal_summary: params.input.goalSummary.trim(),
    p_training_experience: params.input.trainingExperience.trim(),
    p_package_interest_id: params.input.packageInterestId?.trim() || null,
    p_package_interest_label_snapshot:
      params.input.packageInterestLabelSnapshot?.trim() || null,
  };
}

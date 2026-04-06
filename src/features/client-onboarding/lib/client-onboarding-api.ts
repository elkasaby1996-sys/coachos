import { supabase } from "../../../lib/supabase";
import { updateClientCanonicalProfile } from "../../../lib/account-profiles";
import type {
  ClientOnboardingStatus,
  ClientOnboardingStepKey,
  ClientOnboardingStepState,
} from "../types";

type OnboardingSectionKey =
  | "basics"
  | "goals"
  | "training_history"
  | "injuries_limitations"
  | "nutrition_lifestyle";

export async function saveClientOnboardingDraft(params: {
  onboardingId: string;
  status: ClientOnboardingStatus;
  section: OnboardingSectionKey;
  value: Record<string, unknown>;
  stepState: ClientOnboardingStepState;
}) {
  const nextStatus =
    params.status === "invited" ? "in_progress" : params.status;

  const { data, error } = await supabase
    .from("workspace_client_onboardings")
    .update({
      [params.section]: params.value,
      status: nextStatus,
      step_state: params.stepState,
    })
    .eq("id", params.onboardingId)
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

export async function updateClientOnboardingStepState(params: {
  onboardingId: string;
  stepState: ClientOnboardingStepState;
  status?: ClientOnboardingStatus;
}) {
  const payload: {
    step_state: ClientOnboardingStepState;
    status?: ClientOnboardingStatus;
  } = {
    step_state: params.stepState,
  };

  if (params.status) {
    payload.status = params.status;
  }

  const { data, error } = await supabase
    .from("workspace_client_onboardings")
    .update(payload)
    .eq("id", params.onboardingId)
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

export async function submitClientOnboarding(clientId: string) {
  const { data, error } = await supabase.rpc(
    "submit_workspace_client_onboarding",
    {
      p_client_id: clientId,
    },
  );

  if (error) throw error;
  return data;
}

export async function saveClientCanonicalBasics(params: {
  clientId: string;
  fullName: string;
  phone: string;
  dateOfBirth: string;
  sex: string;
  avatarUrl: string;
  heightValue: string;
  heightUnit: string;
  weightValueCurrent: string;
  weightUnit: string;
}) {
  const isComplete =
    params.fullName.trim() &&
    params.phone.trim() &&
    params.dateOfBirth.trim() &&
    params.sex.trim() &&
    params.heightValue.trim() &&
    params.weightValueCurrent.trim();

  return updateClientCanonicalProfile(params.clientId, {
    full_name: params.fullName,
    phone: params.phone,
    date_of_birth: params.dateOfBirth,
    sex: params.sex,
    avatar_url: params.avatarUrl,
    height_value: params.heightValue.trim()
      ? Number(params.heightValue)
      : null,
    height_unit: params.heightUnit,
    weight_value_current: params.weightValueCurrent.trim()
      ? Number(params.weightValueCurrent)
      : null,
    weight_unit: params.weightUnit,
    account_onboarding_completed_at: isComplete
      ? new Date().toISOString()
      : undefined,
  });
}

export function getOnboardingSectionForStep(stepKey: ClientOnboardingStepKey) {
  switch (stepKey) {
    case "basics":
      return "basics";
    case "goals":
      return "goals";
    case "training-history":
      return "training_history";
    case "injuries-limitations":
      return "injuries_limitations";
    case "nutrition-lifestyle":
      return "nutrition_lifestyle";
    default:
      return null;
  }
}

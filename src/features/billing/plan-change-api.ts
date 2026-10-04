import { billingCapability } from "./provider-capabilities";
import { parsePlanPreview } from "./providers/plan-preview";
import {
  planChangeStateSchema,
  safePlanChangeError,
} from "./plan-change-contracts";
export async function fetchPlanChangeState() {
  try {
    const { supabase } = await import("../../lib/supabase");
    const { data, error } = await supabase.rpc(
      "get_my_billing_plan_change_state",
    );
    if (error) throw error;
    if (!billingCapability(data?.provider, "planChanges"))
      return planChangeStateSchema.parse({
        linked: false,
        cadence: null,
        eligible: false,
        operation: null,
      });
    return planChangeStateSchema.parse(data);
  } catch (error) {
    throw safePlanChangeError(error);
  }
}
export async function requestPlanChange(
  action: "preview" | "apply" | "cancel" | "refresh",
  body: Record<string, unknown>,
  provider?: string | null,
) {
  try {
    if (!billingCapability(provider, "planChanges"))
      throw safePlanChangeError({ code: "BILLING_PLAN_CHANGE_NOT_ELIGIBLE" });
    const { supabase } = await import("../../lib/supabase");
    const endpoint = {
      preview: "billing-preview-plan-change",
      apply: "billing-change-subscription-plan",
      cancel: "billing-cancel-scheduled-plan-change",
      refresh: "billing-refresh-plan-change",
    }[action];
    const { data, error } = await supabase.functions.invoke(endpoint, {
      body:
        action === "preview" && billingCapability(provider, "planChanges")
          ? { ...body, previewContractVersion: 2 }
          : body,
    });
    if (error) {
      let safe: unknown;
      try {
        safe = await error.context?.json();
      } catch {
        /* Discard raw response. */
      }
      throw safePlanChangeError(safe);
    }
    return action === "preview"
      ? parsePlanPreview(data)
      : planChangeStateSchema.parse(data);
  } catch (error) {
    throw safePlanChangeError(error);
  }
}

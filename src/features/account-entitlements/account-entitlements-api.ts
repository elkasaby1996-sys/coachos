import { z } from "zod";
import {
  PUBLIC_PLAN_KEYS,
  type PublicPlanKey,
} from "../commercial-catalogue/contracts";
import {
  AccountEntitlementError,
  effectiveAccountEntitlementsSchema,
  workspaceEffectiveEntitlementsSchema,
  requestedPaidPlanResultSchema,
} from "./contracts";

export type AccountEntitlementClient = {
  rpc: (
    name: string,
    args?: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: unknown }>;
};
export function mapAccountEntitlementError(
  error: unknown,
): AccountEntitlementError {
  if (error instanceof AccountEntitlementError) return error;
  const code =
    error && typeof error === "object" && "code" in error
      ? error.code
      : undefined;
  return new AccountEntitlementError(
    code === "42501" || code === "PGRST301"
      ? "FORBIDDEN"
      : code === "22023"
        ? "INVALID_INPUT"
        : "UNAVAILABLE",
  );
}
async function request<T>(
  name: string,
  schema: z.ZodType<T>,
  args?: Record<string, unknown>,
  client?: AccountEntitlementClient,
): Promise<T> {
  try {
    const source = client ?? (await import("../../lib/supabase")).supabase;
    const { data, error } = await source.rpc(name, args);
    if (error) throw mapAccountEntitlementError(error);
    const result = schema.safeParse(data);
    if (!result.success) throw new AccountEntitlementError("INVALID_PAYLOAD");
    return result.data;
  } catch (error) {
    throw mapAccountEntitlementError(error);
  }
}
export function fetchMyEffectiveAccountEntitlements(
  client?: AccountEntitlementClient,
) {
  return request(
    "get_my_effective_account_entitlements",
    effectiveAccountEntitlementsSchema,
    undefined,
    client,
  );
}
export function fetchWorkspaceEffectiveEntitlements(
  workspaceId: string,
  client?: AccountEntitlementClient,
) {
  if (!z.string().uuid().safeParse(workspaceId).success)
    return Promise.reject(new AccountEntitlementError("INVALID_INPUT"));
  return request(
    "get_workspace_effective_entitlements",
    workspaceEffectiveEntitlementsSchema,
    { p_workspace_id: workspaceId },
    client,
  );
}
export function setMyRequestedPaidPlan(
  planKey: PublicPlanKey,
  client?: AccountEntitlementClient,
) {
  if (!z.enum(PUBLIC_PLAN_KEYS).safeParse(planKey).success)
    return Promise.reject(new AccountEntitlementError("INVALID_INPUT"));
  return request(
    "set_my_requested_paid_plan",
    requestedPaidPlanResultSchema,
    { p_plan_key: planKey },
    client,
  );
}

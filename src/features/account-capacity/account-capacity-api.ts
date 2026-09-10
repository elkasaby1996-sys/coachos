import { z } from "zod";
import {
  AccountCapacityError,
  ACCOUNT_CAPACITY_DIMENSION_KEYS,
  accountCapacitySnapshotSchema,
  capacityChangeEvaluationSchema,
  type AccountCapacityDimensionKey,
} from "./contracts";
export type AccountCapacityClient = {
  rpc: (
    name: string,
    args?: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: unknown }>;
};
export function mapAccountCapacityError(error: unknown): AccountCapacityError {
  if (error instanceof AccountCapacityError) return error;
  const code =
    error && typeof error === "object" && "code" in error
      ? error.code
      : undefined;
  return new AccountCapacityError(
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
  client?: AccountCapacityClient,
): Promise<T> {
  try {
    const source = client ?? (await import("../../lib/supabase")).supabase;
    const { data, error } = await source.rpc(name, args);
    if (error) throw error;
    const result = schema.safeParse(data);
    if (!result.success) throw new AccountCapacityError("INVALID_PAYLOAD");
    return result.data;
  } catch (error) {
    throw mapAccountCapacityError(error);
  }
}
export function fetchMyAccountCapacitySnapshot(client?: AccountCapacityClient) {
  return request(
    "get_my_account_capacity_snapshot",
    accountCapacitySnapshotSchema,
    undefined,
    client,
  );
}
/** Informational only; mutation admission requires the service reservation lock. */
export function evaluateMyCapacityChange(
  dimension: AccountCapacityDimensionKey,
  quantity = 1,
  client?: AccountCapacityClient,
) {
  if (
    !z.enum(ACCOUNT_CAPACITY_DIMENSION_KEYS).safeParse(dimension).success ||
    !z.number().int().positive().max(2147483647).safeParse(quantity).success
  )
    return Promise.reject(new AccountCapacityError("INVALID_INPUT"));
  return request(
    "evaluate_my_capacity_change",
    capacityChangeEvaluationSchema,
    { p_dimension: dimension, p_quantity: quantity },
    client,
  );
}

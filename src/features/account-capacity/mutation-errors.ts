import type { QueryClient } from "@tanstack/react-query";
import type {
  AccountCapacityDimensionKey as CapacityDimensionKey,
  AccountCapacitySnapshot,
} from "./contracts";
import { invalidateAccountCapacity } from "./query-keys";

export const CAPACITY_MUTATION_CODES = [
  "ACCOUNT_CAPACITY_LIMIT_REACHED",
  "ACCOUNT_CAPACITY_GROWTH_NOT_ALLOWED",
  "ACCOUNT_CAPACITY_UNAVAILABLE",
  "ACCOUNT_CAPACITY_RESERVATION_CONFLICT",
  "ACCOUNT_CAPACITY_OPERATION_EXPIRED",
] as const;
export type CapacityMutationCode = (typeof CAPACITY_MUTATION_CODES)[number];
export type CapacityAudience = "owner" | "team" | "client";
export const capacityDimensionLabels: Record<CapacityDimensionKey, string> = {
  counted_clients: "Current clients",
  coach_seats: "Coach seats",
  active_workspaces: "Workspaces",
  published_packages: "Published packages",
};

export class CapacityMutationError extends Error {
  constructor(
    readonly code: CapacityMutationCode,
    readonly dimension: CapacityDimensionKey,
  ) {
    super(
      "This account cannot add capacity right now. Ask the owner to review Billing.",
    );
    this.name = "CapacityMutationError";
  }
}

/** Only exact structured database details are commercial errors. */
export function parseCapacityMutationError(
  error: unknown,
): CapacityMutationError | null {
  if (error instanceof CapacityMutationError) return error;
  if (!error || typeof error !== "object" || !("details" in error)) return null;
  if ("code" in error && error.code !== undefined && error.code !== "P0001")
    return null;
  if (typeof error.details !== "string") return null;
  try {
    const value = JSON.parse(error.details) as Record<string, unknown>;
    if (!CAPACITY_MUTATION_CODES.includes(value.code as CapacityMutationCode))
      return null;
    if (
      typeof value.dimension !== "string" ||
      !Object.prototype.hasOwnProperty.call(
        capacityDimensionLabels,
        value.dimension,
      )
    )
      return null;
    return new CapacityMutationError(
      value.code as CapacityMutationCode,
      value.dimension as CapacityDimensionKey,
    );
  } catch {
    return null;
  }
}

export function capacityMutationCopy(
  error: CapacityMutationError,
  audience: CapacityAudience,
  snapshot?: AccountCapacitySnapshot,
) {
  if (audience === "client")
    return "This coach is not accepting additional clients right now.";
  if (audience === "team")
    return "This account cannot add capacity right now. Ask the owner to review Billing.";
  const dimension = snapshot?.dimensions.find(
    (item) => item.key === error.dimension,
  );
  const usage =
    dimension && dimension.limit !== null
      ? ` ${dimension.committed} committed of ${dimension.limit}.`
      : "";
  const reason =
    error.code === "ACCOUNT_CAPACITY_LIMIT_REACHED"
      ? `${capacityDimensionLabels[error.dimension]} capacity has been reached.`
      : error.code === "ACCOUNT_CAPACITY_GROWTH_NOT_ALLOWED"
        ? "Your current account access does not allow additional capacity."
        : "Capacity could not be confirmed. Please try again.";
  return `${reason}${usage} View Billing to review your account.`;
}

export function capacityMutationFailure(
  error: unknown,
  queryClient?: QueryClient,
  audience: CapacityAudience = "team",
) {
  const capacityError = parseCapacityMutationError(error);
  if (!capacityError) return null;
  if (queryClient) invalidateAccountCapacity(queryClient);
  capacityError.message = capacityMutationCopy(capacityError, audience);
  return capacityError;
}

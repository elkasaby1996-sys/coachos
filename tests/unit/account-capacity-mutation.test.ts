import { describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { readFileSync } from "node:fs";
import {
  CAPACITY_MUTATION_CODES,
  CapacityMutationError,
  capacityDimensionLabels,
  capacityMutationCopy,
  capacityMutationFailure,
  parseCapacityMutationError,
} from "../../src/features/account-capacity/mutation-errors";
import type { AccountCapacitySnapshot } from "../../src/features/account-capacity/contracts";

describe("capacity mutation error boundary", () => {
  it.each(CAPACITY_MUTATION_CODES)(
    "parses exact code %s independently from dimension",
    (code) => {
      for (const dimension of Object.keys(capacityDimensionLabels)) {
        const result = parseCapacityMutationError({
          details: JSON.stringify({ code, dimension }),
        });
        expect(result).toMatchObject({
          code,
          dimension,
          name: "CapacityMutationError",
        });
      }
    },
  );
  it.each([
    { code: "42501", message: "Not authorized" },
    { details: "LEAD_TRANSFER_REQUIRES_CONFIRMATION" },
    { details: "CLIENT_RELATIONSHIP_TRANSFERRED_OUT" },
    {
      details: JSON.stringify({
        code: "ACCOUNT_CAPACITY_LIMIT_REACHED",
        dimension: "plan",
      }),
    },
    {
      details: JSON.stringify({
        code: "UNKNOWN",
        dimension: "counted_clients",
      }),
    },
    { details: "ACCOUNT_CAPACITY_LIMIT_REACHED" },
    null,
  ])(
    "does not reclassify permission, domain or unknown errors: %j",
    (error) => {
      expect(parseCapacityMutationError(error)).toBeNull();
      expect(capacityMutationFailure(error)).toBeNull();
    },
  );
  const error = new CapacityMutationError(
    "ACCOUNT_CAPACITY_LIMIT_REACHED",
    "counted_clients",
  );
  const snapshot = {
    dimensions: [{ key: "counted_clients", committed: 11, limit: 10 }],
  } as AccountCapacitySnapshot;
  it("owner copy includes the fresh quantities", () => {
    expect(capacityMutationCopy(error, "owner", snapshot)).toContain(
      "11 committed of 10",
    );
    expect(capacityMutationCopy(error, "owner")).not.toContain("undefined");
  });
  it("team and client copy hide quantities even if passed an owner snapshot", () => {
    expect(capacityMutationCopy(error, "team", snapshot)).toBe(
      "This account cannot add capacity right now. Ask the owner to review Billing.",
    );
    expect(capacityMutationCopy(error, "client", snapshot)).toBe(
      "This coach is not accepting additional clients right now.",
    );
  });
  it("invalidates on capacity denial without changing normal errors", () => {
    const client = new QueryClient();
    const invalidate = vi
      .spyOn(client, "invalidateQueries")
      .mockResolvedValue();
    expect(capacityMutationFailure(error, client, "owner")).toBe(error);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["account-capacity"] });
    invalidate.mockClear();
    expect(capacityMutationFailure(new Error("Permission"), client)).toBeNull();
    expect(invalidate).not.toHaveBeenCalled();
  });
  it("renders local accessible feedback with owner-gated queries and navigation", () => {
    const source = readFileSync(
      "src/features/account-capacity/mutation-notice.tsx",
      "utf8",
    );
    expect(source).toContain('role="alert"');
    expect(source).toContain('audience === "owner"');
    expect(source).toContain('to="/pt-hub/settings/billing"');
    expect(source).not.toMatch(/upgrade|checkout|payment|rawEmail/);
  });
});

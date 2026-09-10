import { describe, expect, it } from "vitest";
import {
  ACCOUNT_CAPACITY_DIMENSION_KEYS,
  ACCOUNT_CAPACITY_STATES,
  accountCapacitySnapshotSchema,
  accountCapacityDimensionSchema,
  capacityChangeEvaluationSchema,
} from "../../src/features/account-capacity/contracts";
import {
  fetchMyAccountCapacitySnapshot,
  evaluateMyCapacityChange,
  mapAccountCapacityError,
} from "../../src/features/account-capacity/account-capacity-api";
import { dimension, snapshot } from "./account-capacity-fixtures";

describe("capacity contracts", () => {
  it("locks exact dimensions and states", () => {
    expect(ACCOUNT_CAPACITY_DIMENSION_KEYS).toEqual([
      "counted_clients",
      "coach_seats",
      "active_workspaces",
      "published_packages",
    ]);
    expect(ACCOUNT_CAPACITY_STATES).toEqual([
      "unavailable",
      "unlimited",
      "available",
      "approaching",
      "at_limit",
      "over_limit",
    ]);
  });
  it.each([false, true])(
    "accepts finite and unavailable snapshots (%s)",
    (unavailable) =>
      expect(
        accountCapacitySnapshotSchema.safeParse(snapshot(unavailable)).success,
      ).toBe(true),
  );
  it("accepts unlimited packages and separate included/maximum seats", () => {
    const s = snapshot();
    s.dimensions[3] = dimension("published_packages", 120, null);
    s.dimensions[1] = dimension("coach_seats", 2, 5, 1);
    expect(accountCapacitySnapshotSchema.safeParse(s).success).toBe(true);
  });
  it.each([
    [79, "available"],
    [80, "approaching"],
    [99, "approaching"],
    [100, "at_limit"],
    [101, "over_limit"],
  ] as const)("validates %s percent as %s", (actual, state) => {
    const d = dimension("counted_clients", actual, 100);
    expect(d.state).toBe(state);
    expect(accountCapacityDimensionSchema.safeParse(d).success).toBe(true);
  });
  it.each([
    ["key", "clients"],
    ["state", "full"],
    ["actual", -1],
    ["pending", -1],
    ["reserved", -1],
    ["committed", -1],
    ["committed", 2],
    ["limit", -1],
    ["remaining", -1],
    ["remaining", 8],
    ["overBy", -1],
    ["overBy", 1],
    ["utilizationPercent", -1],
    ["utilizationPercent", 101],
    ["utilizationPercent", 10.001],
    ["state", "unlimited"],
    ["limit", null],
    ["wouldExceedNext", true],
  ])("rejects malformed %s=%s", (key, value) =>
    expect(
      accountCapacityDimensionSchema.safeParse({
        ...dimension("counted_clients"),
        [key]: value,
      }).success,
    ).toBe(false),
  );
  it("rejects missing, duplicate and invalid snapshot context", () => {
    const s = snapshot();
    for (const invalid of [
      { ...s, dimensions: s.dimensions.slice(1) },
      { ...s, dimensions: [...s.dimensions.slice(0, 3), s.dimensions[0]] },
      { ...s, ownerUserId: "bad" },
      { ...s, billingAccountId: "bad" },
      { ...s, computedAt: "yesterday" },
      { ...s, hasAnyDataQualityIssue: true },
      { ...s, subscription: snapshot(true).subscription },
      { ...snapshot(true), dimensions: s.dimensions },
    ])
      expect(accountCapacitySnapshotSchema.safeParse(invalid).success).toBe(
        false,
      );
  });
  it("rejects included seats above maximum and malformed unavailable shape", () => {
    expect(
      accountCapacityDimensionSchema.safeParse({
        ...dimension("coach_seats"),
        included: 11,
      }).success,
    ).toBe(false);
    expect(
      accountCapacityDimensionSchema.safeParse({
        ...dimension("coach_seats", 1, null, 0, 0, false),
        included: 2,
      }).success,
    ).toBe(false);
    expect(
      accountCapacityDimensionSchema.safeParse({
        ...dimension("published_packages", 1, null),
        remaining: 0,
      }).success,
    ).toBe(false);
  });
  it("validates evaluation arithmetic and reason", () => {
    const e = {
      dimension: "counted_clients",
      currentCommitted: 10,
      proposedQuantity: 1,
      projectedCommitted: 11,
      limit: 10,
      currentState: "at_limit",
      projectedState: "over_limit",
      allowedUnderCurrentContract: false,
      reasonCode: "capacity_would_exceed",
      computedAt: snapshot().computedAt,
    };
    expect(capacityChangeEvaluationSchema.safeParse(e).success).toBe(true);
    expect(
      capacityChangeEvaluationSchema.safeParse({
        ...e,
        allowedUnderCurrentContract: true,
      }).success,
    ).toBe(false);
    expect(
      capacityChangeEvaluationSchema.safeParse({ ...e, projectedCommitted: 12 })
        .success,
    ).toBe(false);
  });
  it("maps errors without leaking payloads", async () => {
    for (const [code, expected] of [
      ["42501", "FORBIDDEN"],
      ["22023", "INVALID_INPUT"],
      ["other", "UNAVAILABLE"],
    ])
      expect(mapAccountCapacityError({ code, message: "private" }).code).toBe(
        expected,
      );
    await expect(
      fetchMyAccountCapacitySnapshot({
        rpc: async () => ({ data: {}, error: null }),
      }),
    ).rejects.toMatchObject({ code: "INVALID_PAYLOAD" });
    await expect(
      fetchMyAccountCapacitySnapshot({
        rpc: async () => {
          throw new Error("private");
        },
      }),
    ).rejects.toMatchObject({ code: "UNAVAILABLE" });
    await expect(
      evaluateMyCapacityChange("coach_seats", 0),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(
      fetchMyAccountCapacitySnapshot({
        rpc: async (name, args) => {
          expect(name).toBe("get_my_account_capacity_snapshot");
          expect(args).toBeUndefined();
          return { data: snapshot(), error: null };
        },
      }),
    ).resolves.toEqual(snapshot());
  });
});

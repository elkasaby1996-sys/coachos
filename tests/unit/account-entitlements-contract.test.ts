import { describe, expect, it } from "vitest";
import {
  ACCOUNT_ACCESS_MODES,
  ACCOUNT_SUBSCRIPTION_STORED_STATUSES,
  ACCOUNT_SUBSCRIPTION_EFFECTIVE_STATUSES,
  ACCOUNT_TRIAL_POLICY_V1,
  AccountEntitlementError,
  effectiveAccountEntitlementsSchema,
  workspaceEffectiveEntitlementsSchema,
  type EffectiveAccountEntitlements,
} from "../../src/features/account-entitlements/contracts";
import {
  fetchMyEffectiveAccountEntitlements,
  fetchWorkspaceEffectiveEntitlements,
  setMyRequestedPaidPlan,
  mapAccountEntitlementError,
} from "../../src/features/account-entitlements/account-entitlements-api";
import { PUBLIC_TRIAL_POLICY } from "../../src/features/commercial-catalogue/contracts";

const ownerId = "a0200000-0000-4000-8000-000000000002";
export function ownerPayload(): EffectiveAccountEntitlements {
  return {
    schemaVersion: 1,
    billingAccount: {
      id: ownerId,
      ownerUserId: ownerId,
      requestedPaidPlanKey: "scale",
      canManageBilling: true,
    },
    subscription: {
      id: ownerId,
      kind: "trial",
      storedStatus: "trialing",
      effectiveStatus: "trialing",
      accessMode: "full",
      accessLabel: "Growth trial",
      planKey: "growth",
      planVersion: 1,
      planDisplayName: "Growth",
      trialStartedAt: "2026-09-10T00:00:00+00:00",
      trialEndsAt: "2026-09-24T00:00:00+00:00",
      trialRecoveryEndsAt: "2026-10-01T00:00:00+00:00",
      currentPeriodStartedAt: null,
      currentPeriodEndsAt: null,
      cancelAtPeriodEnd: false,
    },
    limits: {
      countedClients: 10,
      includedCoachSeats: 2,
      maxCoachSeats: 2,
      activeWorkspaces: 1,
      publishedPackages: 3,
    },
    targetFeatureKeys: ["core.messaging"],
    enabledFeatureKeys: [],
    computedAt: "2026-09-10T00:00:00Z",
  };
}
function emptyPayload() {
  const value = ownerPayload();
  value.billingAccount.id = null;
  Object.assign(value.subscription, {
    id: null,
    kind: null,
    storedStatus: "no_subscription",
    effectiveStatus: "no_subscription",
    accessMode: "onboarding",
    accessLabel: "Trial not started",
    planKey: null,
    planVersion: null,
    planDisplayName: null,
    trialStartedAt: null,
    trialEndsAt: null,
    trialRecoveryEndsAt: null,
  });
  value.limits = {
    countedClients: null,
    includedCoachSeats: null,
    maxCoachSeats: null,
    activeWorkspaces: null,
    publishedPackages: null,
  };
  value.targetFeatureKeys = [];
  return value;
}
describe("account entitlement payload contracts", () => {
  it("locks exact status and access unions", () => {
    expect(ACCOUNT_SUBSCRIPTION_STORED_STATUSES).toEqual([
      "trialing",
      "trial_recovery",
      "active",
      "past_due",
      "grace",
      "restricted",
      "canceled",
      "expired",
    ]);
    expect(ACCOUNT_SUBSCRIPTION_EFFECTIVE_STATUSES).toEqual([
      ...ACCOUNT_SUBSCRIPTION_STORED_STATUSES,
      "no_subscription",
    ]);
    expect(ACCOUNT_ACCESS_MODES).toEqual([
      "onboarding",
      "full",
      "existing_delivery_only",
      "read_only",
      "none",
    ]);
  });
  it("keeps trial policy parity and separate intended plan", () => {
    expect(ACCOUNT_TRIAL_POLICY_V1).toMatchObject({
      durationDays: PUBLIC_TRIAL_POLICY.durationDays,
      requiresCard: PUBLIC_TRIAL_POLICY.requiresCard,
      featurePlanKey: PUBLIC_TRIAL_POLICY.featurePlanKey,
      recoveryDays: 7,
      countedClients: 10,
      includedCoachSeats: 2,
      maxCoachSeats: 2,
      activeWorkspaces: 1,
      publishedPackages: 3,
    });
    expect(
      effectiveAccountEntitlementsSchema.parse(ownerPayload()).billingAccount
        .requestedPaidPlanKey,
    ).toBe("scale");
  });
  it("parses owner and no-subscription payloads", () => {
    expect(effectiveAccountEntitlementsSchema.parse(ownerPayload())).toEqual(
      ownerPayload(),
    );
    expect(
      effectiveAccountEntitlementsSchema.parse(emptyPayload()).subscription
        .accessMode,
    ).toBe("onboarding");
  });
  it.each([
    "planKey",
    "storedStatus",
    "effectiveStatus",
    "accessMode",
    "id",
  ] as const)("rejects unknown or malformed %s", (field) => {
    const payload = ownerPayload();
    expect(
      effectiveAccountEntitlementsSchema.safeParse({
        ...payload,
        subscription: { ...payload.subscription, [field]: "invalid" },
      }).success,
    ).toBe(false);
  });
  it("rejects negative limits, fractional limits, and included seats above maximum", () => {
    for (const patch of [
      { countedClients: -1 },
      { countedClients: 1.5 },
      { includedCoachSeats: 3 },
      { maxCoachSeats: null },
    ]) {
      const value = ownerPayload();
      expect(
        effectiveAccountEntitlementsSchema.safeParse({
          ...value,
          limits: { ...value.limits, ...patch },
        }).success,
      ).toBe(false);
    }
  });
  it("rejects invalid timestamp syntax and ordering", () => {
    for (const patch of [
      { trialEndsAt: "yesterday" },
      { trialEndsAt: "2026-09-09T00:00:00Z" },
      { trialRecoveryEndsAt: "2026-09-24T00:00:00Z" },
      {
        currentPeriodStartedAt: "2026-10-01T00:00:00Z",
        currentPeriodEndsAt: "2026-09-01T00:00:00Z",
      },
    ]) {
      const value = ownerPayload();
      expect(
        effectiveAccountEntitlementsSchema.safeParse({
          ...value,
          subscription: { ...value.subscription, ...patch },
        }).success,
      ).toBe(false);
    }
  });
  it("accepts dynamically derived recovery/expiry and rejects stale status", () => {
    const value = ownerPayload();
    value.computedAt = value.subscription.trialEndsAt!;
    expect(effectiveAccountEntitlementsSchema.safeParse(value).success).toBe(
      false,
    );
    Object.assign(value.subscription, {
      effectiveStatus: "trial_recovery",
      accessMode: "existing_delivery_only",
    });
    expect(effectiveAccountEntitlementsSchema.safeParse(value).success).toBe(
      true,
    );
    value.computedAt = value.subscription.trialRecoveryEndsAt!;
    Object.assign(value.subscription, {
      effectiveStatus: "expired",
      accessMode: "none",
    });
    expect(effectiveAccountEntitlementsSchema.safeParse(value).success).toBe(
      true,
    );
  });
  it("rejects duplicate or malformed feature keys", () => {
    for (const keys of [
      ["core.messaging", "core.messaging"],
      ["core.secret"],
      ["not-a-feature"],
    ]) {
      for (const field of ["targetFeatureKeys", "enabledFeatureKeys"])
        expect(
          effectiveAccountEntitlementsSchema.safeParse({
            ...ownerPayload(),
            [field]: keys,
          }).success,
        ).toBe(false);
    }
  });
  it("rejects fabricated no-subscription fields", () => {
    const empty = emptyPayload();
    expect(
      effectiveAccountEntitlementsSchema.safeParse({
        ...empty,
        limits: ownerPayload().limits,
      }).success,
    ).toBe(false);
    expect(
      effectiveAccountEntitlementsSchema.safeParse({
        ...empty,
        targetFeatureKeys: ["core.messaging"],
      }).success,
    ).toBe(false);
    expect(
      effectiveAccountEntitlementsSchema.safeParse({
        ...empty,
        subscription: { ...empty.subscription, planKey: "growth" },
      }).success,
    ).toBe(false);
  });
  it("validates workspace projection and excludes owner details", () => {
    const owner = ownerPayload();
    const {
      effectiveStatus,
      accessMode,
      accessLabel,
      planKey,
      planVersion,
      planDisplayName,
    } = owner.subscription;
    const value = {
      schemaVersion: 1,
      workspaceId: ownerId,
      billingOwnerUserId: ownerId,
      canManageBilling: false,
      effectiveStatus,
      accessMode,
      accessLabel,
      planKey,
      planVersion,
      planDisplayName,
      limits: owner.limits,
      enabledFeatureKeys: [],
      computedAt: owner.computedAt,
    };
    expect(workspaceEffectiveEntitlementsSchema.safeParse(value).success).toBe(
      true,
    );
    expect(
      workspaceEffectiveEntitlementsSchema.safeParse({
        ...value,
        requestedPaidPlanKey: "scale",
      }).success,
    ).toBe(false);
    expect(
      workspaceEffectiveEntitlementsSchema.safeParse({
        ...value,
        workspaceId: "bad",
      }).success,
    ).toBe(false);
  });
  it("maps typed errors without exposing raw provider messages", async () => {
    const client = {
      rpc: async () => ({
        data: null,
        error: { code: "42501", message: "private database detail" },
      }),
    };
    await expect(
      fetchMyEffectiveAccountEntitlements(client),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      fetchMyEffectiveAccountEntitlements({
        rpc: async () => ({ data: {}, error: null }),
      }),
    ).rejects.toMatchObject({ code: "INVALID_PAYLOAD" });
    await expect(
      fetchMyEffectiveAccountEntitlements({
        rpc: async () => {
          throw new Error("network");
        },
      }),
    ).rejects.toMatchObject({ code: "UNAVAILABLE" });
    await expect(
      fetchWorkspaceEffectiveEntitlements("bad", client),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(
      setMyRequestedPaidPlan("growth", client),
    ).rejects.toBeInstanceOf(AccountEntitlementError);
    expect(mapAccountEntitlementError({ code: "22023" }).code).toBe(
      "INVALID_INPUT",
    );
    expect(mapAccountEntitlementError(client).message).not.toContain(
      "private database",
    );
  });
});

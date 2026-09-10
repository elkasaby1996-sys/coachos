import { readFileSync } from "node:fs";
import { QueryClient } from "@tanstack/react-query";
import { accountEntitlementKeys } from "../../src/features/account-entitlements/query-keys";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ persist: vi.fn(), capture: vi.fn() }));
vi.mock(
  "../../src/features/account-entitlements/account-entitlements-api",
  () => ({ setMyRequestedPaidPlan: mocks.persist }),
);
vi.mock("@sentry/react", () => ({ captureException: mocks.capture }));
import { persistPendingRequestedPaidPlan } from "../../src/features/account-entitlements/persist-requested-plan";
import {
  hasPendingTrialPlan,
  persistPendingTrialPlan,
} from "../../src/lib/trial-plan";

describe("entitlement auth isolation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const store = new Map<string, string>();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => store.set(key, value),
        removeItem: (key: string) => store.delete(key),
      },
    });
  });
  afterEach(() => vi.unstubAllGlobals());
  it.each([
    "src/lib/auth.tsx",
    "src/components/common/theme-provider.tsx",
    "src/components/common/bootstrap-gate.tsx",
    "src/main.tsx",
    "src/routes/app.tsx",
  ])("does not mount or fetch entitlements in %s", (path) => {
    expect(readFileSync(path, "utf8")).not.toMatch(
      /account-entitlements|EffectiveAccountEntitlements|EntitlementProvider/,
    );
  });
  it("callback dispatches persistence after profile creation without awaiting it", () => {
    const source = readFileSync("src/lib/auth-callback.ts", "utf8");
    expect(
      source.indexOf("void persistPendingRequestedPaidPlan"),
    ).toBeGreaterThan(source.indexOf("await ensurePtProfile"));
    expect(source).not.toContain("await persistPendingRequestedPaidPlan");
    expect(source).not.toContain("clearPendingTrialPlan");
    expect(
      readFileSync(
        "src/features/account-entitlements/persist-requested-plan.ts",
        "utf8",
      ),
    ).not.toContain("auth.getUser");
  });
  it("failed persistence is non-fatal, observed, and retains intent for retry", async () => {
    persistPendingTrialPlan("scale");
    mocks.persist.mockRejectedValueOnce(new Error("unavailable"));
    expect(await persistPendingRequestedPaidPlan()).toBe(false);
    expect(hasPendingTrialPlan()).toBe(true);
    expect(mocks.capture).toHaveBeenCalledOnce();
    mocks.persist.mockResolvedValueOnce({});
    expect(await persistPendingRequestedPaidPlan()).toBe(true);
    expect(mocks.persist).toHaveBeenLastCalledWith("scale");
    expect(hasPendingTrialPlan()).toBe(false);
  });
  it("does not overwrite persisted intent with an absent browser default", async () => {
    expect(await persistPendingRequestedPaidPlan()).toBe(true);
    expect(mocks.persist).not.toHaveBeenCalled();
  });
  it("invalidates owner and workspace projections after canonical persistence", async () => {
    const client = new QueryClient();
    const ownerKey = accountEntitlementKeys.owner("owner");
    const workspaceKey = accountEntitlementKeys.workspace("owner", "workspace");
    client.setQueryData(ownerKey, { old: true });
    client.setQueryData(workspaceKey, { old: true });
    client.setQueryData(["unrelated"], { old: true });
    persistPendingTrialPlan("scale");
    mocks.persist.mockResolvedValueOnce({});
    expect(await persistPendingRequestedPaidPlan(client)).toBe(true);
    expect(client.getQueryState(ownerKey)?.isInvalidated).toBe(true);
    expect(client.getQueryState(workspaceKey)?.isInvalidated).toBe(true);
    expect(client.getQueryState(["unrelated"])?.isInvalidated).toBe(false);
    expect(accountEntitlementKeys.owner("another-owner")).not.toEqual(ownerKey);
    client.clear();
  });
  it("normalizes legacy browser values before RPC", async () => {
    window.localStorage.setItem("repsync_pending_trial_plan", "studio");
    mocks.persist.mockResolvedValueOnce({});
    await persistPendingRequestedPaidPlan();
    expect(mocks.persist).toHaveBeenCalledWith("growth");
  });
  it("preserves a newer in-flight selection", async () => {
    persistPendingTrialPlan("launch");
    mocks.persist.mockImplementationOnce(async () => {
      persistPendingTrialPlan("scale");
    });
    await persistPendingRequestedPaidPlan();
    expect(hasPendingTrialPlan()).toBe(true);
  });
  it("retries immediately inside the workspace action and invalidates after creation", () => {
    const source = readFileSync(
      "src/features/pt-hub/lib/pt-hub.ts",
      "utf8",
    ).split("export async function createPtWorkspace")[1];
    expect(
      source.indexOf("await persistPendingRequestedPaidPlan"),
    ).toBeLessThan(source.indexOf('supabase.rpc("create_workspace"'));
    expect(source).toContain("invalidateAccountEntitlements(queryClient)");
  });
});

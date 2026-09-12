import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  ACTION_CLASSES,
  actionAllowed,
  ownerAccessSchema,
  workspaceAccessSchema,
  clientAccessSchema,
  type AccessMode,
} from "../../src/features/commercial-access/contracts";
import {
  ACCESS_ERROR_CODES,
  commercialErrorCode,
  commercialErrorMessage,
} from "../../src/features/commercial-access/access-errors";
const base = [
  "billing_manage",
  "account_security",
  "data_export",
  "remediation",
  "client_self_service",
  "client_coached_read",
];
const allowed: Record<AccessMode, readonly string[]> = {
  onboarding: base,
  full: ACTION_CLASSES,
  existing_delivery_only: [
    ...base,
    "workspace_read",
    "delivery_write",
    "client_coached_write",
  ],
  read_only: [...base, "workspace_read"],
  none: base,
};
describe("commercial action contract", () => {
  for (const mode of Object.keys(allowed) as AccessMode[])
    for (const action of ACTION_CLASSES)
      it(`${mode}: ${action}`, () =>
        expect(actionAllowed(mode, action)).toBe(
          allowed[mode].includes(action),
        ));
  const owner = {
    schemaVersion: 1,
    accessMode: "full",
    reason: "active",
    effectiveUntil: null,
    actions: Object.fromEntries(ACTION_CLASSES.map((a) => [a, true])),
    canManageBilling: true,
    recoveryRequired: false,
    recoveryAction: "none",
    recoveryPath: "/pt-hub/settings/billing",
    computedAt: "2026-09-12T00:00:00Z",
  };
  it("validates the complete owner contract", () =>
    expect(ownerAccessSchema.safeParse(owner).success).toBe(true));
  it.each([
    { accessMode: "unknown" },
    { reason: "expired" },
    { actions: { ...owner.actions, extra: true } },
    { actions: {} },
    { recoveryAction: "review_billing" },
    { recoveryRequired: true },
    { providerId: "secret" },
    { computedAt: "not-a-date" },
    { reason: "trialing", effectiveUntil: "2026-09-11T00:00:00Z" },
  ])("rejects inconsistent owner response %j", (patch) =>
    expect(ownerAccessSchema.safeParse({ ...owner, ...patch }).success).toBe(
      false,
    ),
  );
  it("requires support recovery for missing subscription with owned data", () => {
    const accessMode = "read_only";
    const result = {
      ...owner,
      accessMode,
      reason: "owner_recovery_required",
      actions: Object.fromEntries(
        ACTION_CLASSES.map((a) => [a, actionAllowed(accessMode, a)]),
      ),
      recoveryRequired: true,
      recoveryAction: "contact_support",
      recoveryPath: "/contact",
    };
    expect(ownerAccessSchema.safeParse(result).success).toBe(true);
    expect(
      ownerAccessSchema.safeParse({ ...result, recoveryAction: "start_trial" })
        .success,
    ).toBe(false);
  });
  const workspace = {
    schemaVersion: 1,
    workspaceId: "a0800000-0000-4000-8000-000000000001",
    billingOwnerUserId: "a0800000-0000-4000-8000-000000000002",
    accessMode: "read_only",
    canReadWorkspace: true,
    canWriteExistingDelivery: false,
    canWriteBusinessConfiguration: false,
    canGrowCapacity: false,
    canManageBilling: false,
    recoveryRequired: true,
    computedAt: owner.computedAt,
  };
  it("accepts a privacy-limited shared workspace contract", () =>
    expect(workspaceAccessSchema.safeParse(workspace).success).toBe(true));
  it.each([
    { canWriteExistingDelivery: true },
    { limits: {} },
    { planKey: "scale" },
    { workspaceId: "forged" },
  ])("rejects workspace leak or contradiction %j", (patch) =>
    expect(
      workspaceAccessSchema.safeParse({ ...workspace, ...patch }).success,
    ).toBe(false),
  );
  const client = {
    schemaVersion: 1,
    clientId: workspace.workspaceId,
    serviceMode: "unavailable",
    canReadCoachedContent: true,
    canLogWorkout: false,
    canSubmitCheckin: false,
    canSubmitHabitProgress: false,
    canMessageRelationship: false,
    canUseIndependentSelfService: true,
    canBrowseMarketplace: true,
    computedAt: owner.computedAt,
  };
  it("preserves history and independent access after relationship loss", () =>
    expect(clientAccessSchema.safeParse(client).success).toBe(true));
  it.each([
    { canMessageRelationship: true },
    { canBrowseMarketplace: false },
    { planKey: "growth" },
    { paymentStatus: "failed" },
    { serviceMode: "expired" },
  ])("rejects client contradiction or disclosure %j", (patch) =>
    expect(clientAccessSchema.safeParse({ ...client, ...patch }).success).toBe(
      false,
    ),
  );
  it.each(ACCESS_ERROR_CODES)("recognizes only exact safe code %s", (code) => {
    expect(commercialErrorCode({ message: code })).toBe(code);
    expect(commercialErrorCode({ details: JSON.stringify({ code }) })).toBe(
      code,
    );
  });
  it("does not reclassify ordinary permission or provider failures", () => {
    expect(commercialErrorCode({ message: "permission denied" })).toBeNull();
    expect(commercialErrorCode({ message: "provider timeout" })).toBeNull();
    expect(
      commercialErrorCode({ message: "prefix ACCOUNT_ACCESS_EXPIRED" }),
    ).toBeNull();
  });
  it("uses prospect-safe application copy", () =>
    expect(
      commercialErrorMessage("PUBLIC_COACH_NOT_ACCEPTING_APPLICATIONS"),
    ).toBe("This coach is not accepting new applications right now."));
});
describe("commercial enforcement inventory", () => {
  const migration = readFileSync(
    "supabase/migrations/20260912010000_commercial_access_enforcement.sql",
    "utf8",
  );
  const intentionallyAllowed = new Set([
    "notification_deliveries",
    "notification_events",
    "notification_preferences",
    "push_subscriptions",
    "dismissed_reminders",
  ]);
  function files(path: string): string[] {
    return readdirSync(path, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory()
        ? files(join(path, e.name))
        : /\.tsx?$/.test(e.name)
          ? [join(path, e.name)]
          : [],
    );
  }
  it("covers every literal direct database mutation with a guard or personal notification exception", () => {
    const missing: string[] = [];
    for (const file of files("src")) {
      const source = readFileSync(file, "utf8");
      for (const match of source.matchAll(
        /\.from\(\s*["']([^"']+)["']\s*\)([\s\S]*?)(?=;|\bawait\b|\.from\()/g,
      )) {
        if (!/\.(insert|update|upsert|delete)\(/.test(match[2])) continue;
        if (
          !intentionallyAllowed.has(match[1]) &&
          !migration.includes(
            `on public.${match[1]} for each row execute function public.guard_commercial_domain_write()`,
          )
        )
          missing.push(`${file}: ${match[1]}`);
      }
    }
    expect(missing).toEqual([]);
  });
  it("uses one forward transaction and no dynamic SQL", () => {
    expect(migration.trim().startsWith("begin;")).toBe(true);
    expect(migration.trim().endsWith("commit;")).toBe(true);
    expect(migration).not.toMatch(/\bexecute\s+(format|['"])/i);
  });
  it("requires a reviewed boundary for every Edge Function table mutation", () => {
    const independentServiceTables = new Set([
      "marketing_leads",
      "client_wearable_connections",
      "client_wearable_daily_metrics",
      "client_wearable_sleep_sessions",
      "client_wearable_health_scores",
      "client_wearable_activities",
      "client_wearable_sync_runs",
    ]);
    const unreviewed: string[] = [];
    for (const file of files("supabase/functions")) {
      const source = readFileSync(file, "utf8");
      for (const match of source.matchAll(
        /\.from\(\s*["']([^"']+)["']\s*\)([\s\S]*?)(?=;|\bawait\b|\.from\()/g,
      )) {
        if (!/\.(insert|update|upsert|delete)\(/.test(match[2])) continue;
        if (!independentServiceTables.has(match[1]))
          unreviewed.push(`${file}: ${match[1]}`);
        expect(migration).not.toContain(
          `on public.${match[1]} for each row execute function public.guard_commercial_domain_write()`,
        );
      }
    }
    expect(unreviewed).toEqual([]);
  });
  it("keeps billing and wearable service scopes tied to authenticated identities", () => {
    const runtime = readFileSync(
      "supabase/functions/_shared/billing-runtime.ts",
      "utf8",
    );
    expect(runtime).toContain("service.auth.getUser(token)");
    expect(runtime).toContain('env("SUPABASE_ANON_KEY")');
    expect(runtime).toContain("Authorization: `Bearer ${token}`");
    const wearables = readFileSync(
      "supabase/functions/open-wearables/index.ts",
      "utf8",
    );
    expect(wearables).toContain("supabase.auth.getUser(bearerToken)");
    expect(wearables).toContain('.eq("user_id", user.id)');
    expect(wearables).toContain(
      "loadWearableSettings(supabase, client.workspace_id)",
    );
  });
  it("does not add feature-key gating", () => {
    for (const file of files("src/features/commercial-access"))
      expect(readFileSync(file, "utf8")).not.toContain("enabledFeatureKeys");
  });
  it("keeps commercial loading outside auth and startup boundaries", () => {
    for (const file of [
      "src/lib/auth.tsx",
      "src/components/common/theme-provider.tsx",
      "src/components/common/bootstrap-gate.tsx",
      "src/lib/use-workspace.ts",
      "src/pages/public/login.tsx",
      "src/routes/app.tsx",
    ]) {
      expect(readFileSync(file, "utf8"), file).not.toMatch(
        /from\s+["'][^"']*commercial-access/,
      );
    }
  });
});

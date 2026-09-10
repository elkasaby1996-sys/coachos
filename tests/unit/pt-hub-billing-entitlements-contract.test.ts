import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const source = readFileSync(
  "src/pages/pt-hub/settings/tabs/billing.tsx",
  "utf8",
).replace(/\s+/g, " ");
describe("PT Hub Billing canonical status", () => {
  it("reads canonical hook and typed errors without compatibility plan truth", () => {
    expect(source).toContain("useMyEffectiveAccountEntitlements()");
    expect(source).toContain("AccountEntitlementError");
    expect(source).not.toMatch(
      /subscription\.planName|subscription\.billingStatus|pt_hub_settings/,
    );
    expect(source).toContain('role="alert"');
    expect(source).toContain('role="status"');
  });
  it("keeps existing sections, placeholders, and disabled controls", () => {
    for (const text of [
      "usePtHubPayments()",
      "Plan and Subscription",
      "Payment Methods",
      "Invoice History",
      "SettingsSectionCard",
      "SettingsFieldRow",
      "invoices.map",
      "Scope boundary",
    ])
      expect(source).toContain(text);
    expect(source).toMatch(/<Button[^>]*disabled>\s*Manage subscription/);
    expect(source).toMatch(/<Button[^>]*disabled>\s*Add payment method/);
    expect(source).not.toMatch(/checkout|usageMeter|stripe|renewalDate/i);
    // PR-PRICE-03 adds descriptive capacity while preserving PR-PRICE-02's
    // canonical entitlement card and disconnected payment controls.
    expect(source).toContain("useMyAccountCapacitySnapshot()");
    expect(source).toContain("<CapacityMeters snapshot={capacityQuery.data}");
    expect(source).not.toMatch(/disabled=\{[^}]*capacity/i);
  });
  it("explains trial, intent, complimentary contract and current enforcement boundary", () => {
    for (const text of [
      "Your 14-day Growth trial begins when you create your first workspace.",
      "Trial end date",
      "Recovery end date",
      "Intended paid plan",
      "Complimentary beta access",
      "Scale v1 entitlement contract",
      "access restrictions are not enforced yet",
      "no automatic conversion",
    ])
      expect(source).toContain(text);
    expect(source).toContain("subscription.currentPeriodStartedAt &&");
  });
});

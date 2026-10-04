import { readFileSync } from "node:fs";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { billingCapability } from "../../src/features/billing/provider-capabilities";
import { paymentMethodContinuationSchema } from "../../src/features/billing/payment-method-contracts";
import { planChangeStateSchema } from "../../src/features/billing/plan-change-contracts";
import { seatQuantityStateSchema } from "../../src/features/billing/seat-quantity-contracts";
import {
  projectPaddlePlanResult,
  legacyPaddlePlanPreview,
} from "../../supabase/functions/_shared/paddle-workflow-projection";

function dependencies(path: string) {
  const source = readFileSync(path, "utf8");
  const file = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true);
  const result: string[] = [];
  function visit(node: ts.Node) {
    if (
      ts.isStringLiteral(node) &&
      (ts.isImportDeclaration(node.parent) ||
        ts.isExportDeclaration(node.parent) ||
        ts.isImportTypeNode(node.parent.parent) ||
        (ts.isCallExpression(node.parent) &&
          node.parent.expression.kind === ts.SyntaxKind.ImportKeyword))
    )
      result.push(node.text);
    ts.forEachChild(node, visit);
  }
  visit(file);
  return result;
}

it.each([null, undefined])(
  "parses provider %s only as unavailable non-paid workflow state",
  (provider) => {
    const plan = {
      provider,
      linked: false,
      eligible: false,
      cadence: null,
      operation: null,
    };
    const seats = {
      provider,
      available: false,
      summary: null,
      operation: null,
    };
    expect(planChangeStateSchema.safeParse(plan).success).toBe(true);
    expect(seatQuantityStateSchema.safeParse(seats).success).toBe(true);
    for (const patch of [
      { linked: true },
      { eligible: true },
      { cadence: "monthly" },
    ])
      expect(
        planChangeStateSchema.safeParse({ ...plan, ...patch }).success,
      ).toBe(false);
    for (const patch of [{ available: true }, { canCancel: true }])
      expect(
        seatQuantityStateSchema.safeParse({ ...seats, ...patch }).success,
      ).toBe(false);
    for (const unknown of ["unknown", "lemonsqueezy"]) {
      expect(
        planChangeStateSchema.safeParse({ ...plan, provider: unknown }).success,
      ).toBe(false);
      expect(
        seatQuantityStateSchema.safeParse({ ...seats, provider: unknown })
          .success,
      ).toBe(false);
    }
  },
);
describe("generic plan-change import isolation", () => {
  it.each([
    "src/lib/auth.tsx",
    "src/lib/theme.ts",
    "src/routes/app.tsx",
    "src/lib/auth-callback.ts",
    "src/pages/public/login.tsx",
  ])("does not bootstrap a plan workflow in %s", (path) => {
    expect(
      dependencies(path).filter((value) =>
        /plan-change|billing-plan|provider|paddle/i.test(value),
      ),
    ).toEqual([]);
  });
});
it.each([
  "supabase/functions/_shared/billing-handlers.ts",
  "supabase/functions/_shared/billing-plan-change.ts",
  "supabase/functions/_shared/billing-seat-quantity.ts",
  "supabase/functions/_shared/billing-payment-method.ts",
  "src/features/billing/plan-change-contracts.ts",
  "src/features/billing/seat-quantity-contracts.ts",
  "src/features/billing/payment-method-contracts.ts",
  "src/features/billing/plan-change-panel.tsx",
  "src/features/billing/seat-quantity-panel.tsx",
])(
  "ordinary contract %s has no concrete provider transport dependency",
  (path) => {
    expect(
      dependencies(path).filter((value) => /paddle|sdk|transport/i.test(value)),
    ).toEqual([]);
  },
);
it.each([null, undefined, "", "unknown", "lemonsqueezy"])(
  "unregistered identity %s has no domain capabilities",
  (provider) => {
    expect(billingCapability(provider, "planChanges")).toBe(false);
    expect(billingCapability(provider, "seatChanges")).toBe(false);
    expect(billingCapability(provider, "paymentMethod")).toBe(false);
  },
);
it("translates mutation mechanics without leaking external IDs or changing the frozen legacy contract", () => {
  const wire = {
    provider: "paddle",
    prorationMode: "invoice_immediately",
    sourcePlanKey: "growth",
    quote: { action: "charge", amountMinor: 100, currencyCode: "USD" },
  };
  const result = projectPaddlePlanResult("preview", wire);
  expect(result.billingTreatment).toBe("charge_now");
  expect(result).not.toHaveProperty("prorationMode");
  expect(legacyPaddlePlanPreview(result)).toEqual({
    provider: "paddle",
    prorationMode: "invoice_immediately",
    sourcePlanKey: "growth",
  });
  expect(
    projectPaddlePlanResult("preview", { prorationMode: "unknown" })
      .billingTreatment,
  ).toBeNull();
});
it("keeps opaque payment capabilities generic without registering another provider", () => {
  expect(
    paymentMethodContinuationSchema.parse({
      kind: "provider_checkout",
      provider: "provider_x",
      environment: "test",
      token: "opaque_reference",
    }),
  ).toEqual({
    kind: "provider_checkout",
    provider: "provider_x",
    environment: "test",
    token: "opaque_reference",
  });
  expect(billingCapability("provider_x", "paymentMethod")).toBe(false);
});

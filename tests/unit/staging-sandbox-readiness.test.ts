import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import {
  CATALOGUE_QUERY,
  inspectSandboxCatalogue,
  summarizeStagingAuth,
  validateCatalogueState,
} from "../../scripts/staging-sandbox-readiness.mjs";
import { PaddleCatalogueError } from "../../supabase/functions/_shared/paddle-catalogue/index";
import {
  STAGING_PROJECT,
  STAGING_ORIGIN,
} from "../../scripts/staging-billing-status.mjs";

const privateValue = "synthetic-private-value-must-not-appear";
const env = {
  STAGING_SUPABASE_PROJECT_REF: STAGING_PROJECT,
  PADDLE_ENVIRONMENT: "sandbox",
  SUPABASE_ACCESS_TOKEN: privateValue,
  PADDLE_SANDBOX_API_KEY: privateValue,
};

function fixture() {
  const versions = Object.entries({
    launch: 1900,
    growth: 5900,
    scale: 11900,
    "coach-seat": 1200,
  }).map(([key, monthly], i) => ({
    key,
    id: `00000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
    currency: "USD",
    monthly,
    annual: monthly * 10,
  }));
  const products = versions.map((v) => ({
    productReference: `synthetic-product-${v.key}`,
    status: "active",
    taxCategory: "saas",
  }));
  const prices = versions.flatMap((v) =>
    ["monthly", "annual"].map((cadence) => ({
      priceReference: `synthetic-price-${v.key}-${cadence}`,
      productReference: `synthetic-product-${v.key}`,
      status: "active",
      unitPrice: {
        currency: "USD",
        amount: String(v[cadence as "monthly" | "annual"]),
      },
      billingCycle: {
        interval: cadence === "annual" ? "year" : "month",
        frequency: 1,
      },
      trial: null as null | { interval: string; frequency: number },
      quantity: { minimum: 1, maximum: v.key === "coach-seat" ? 5 : 1 },
      taxMode: "location",
      hasUnitPriceOverrides: false,
    })),
  );
  const state = {
    versions,
    mappings: versions.flatMap((v) =>
      ["monthly", "annual"].map((cadence) => ({
        key: v.key,
        cadence,
        version: v.id,
        productRef: `synthetic-product-${v.key}`,
        priceRef: `synthetic-price-${v.key}-${cadence}`,
        currency: "USD",
        amount: v[cadence as "monthly" | "annual"],
        unit: cadence === "annual" ? "year" : "month",
        frequency: 1,
        status: "active",
        hasCatalogueEvidence: true,
        hasVerification: true,
      })),
    ),
    policy: {
      environment: "test",
      salesEnabled: false,
      reconciliationEnabled: false,
    },
  };
  const auth = {
    site_url: STAGING_ORIGIN,
    uri_allow_list: `${STAGING_ORIGIN}/auth/callback`,
    external_email_enabled: true,
    mailer_autoconfirm: false,
    smtp_host: "smtp.resend.com",
    smtp_user: "resend",
    smtp_admin_email: privateValue,
    smtp_pass: privateValue,
    smtp_sender_name: privateValue,
  };
  const capability = {
    provider: "paddle",
    environment: "test",
    listProducts: vi.fn(async () => structuredClone(products)),
    listPrices: vi.fn(async () => structuredClone(prices)),
    retrievePrice: vi.fn(async (ref: string) =>
      structuredClone(prices.find((p) => p.priceReference === ref)),
    ),
    retrieveProduct: vi.fn(async (ref: string) =>
      structuredClone(products.find((p) => p.productReference === ref)),
    ),
  };
  const transport = vi.fn(async (url: string, options: RequestInit) => {
    expect(options.redirect).toBe("error");
    expect(options.headers).toMatchObject({
      Authorization: `Bearer ${privateValue}`,
    });
    if (
      url ===
      `https://api.supabase.com/v1/projects/${STAGING_PROJECT}/database/query/read-only`
    ) {
      expect(options.method).toBe("POST");
      expect(JSON.parse(options.body as string)).toEqual({
        query: CATALOGUE_QUERY,
      });
      return Response.json([{ catalogue: state }]);
    }
    expect(url).toBe(
      `https://api.supabase.com/v1/projects/${STAGING_PROJECT}/config/auth`,
    );
    expect(options.method).toBe("GET");
    expect(options.body).toBeUndefined();
    return Response.json(auth);
  });
  const createCapability = vi.fn(() => capability);
  return {
    state,
    auth,
    prices,
    products,
    capability,
    transport,
    createCapability,
    run: (overrides = {}) =>
      inspectSandboxCatalogue({
        env,
        transport,
        createCapability,
        ...overrides,
      }),
  };
}

describe("staging sandbox readiness observations", () => {
  it("freshly retrieves all explicitly mapped prices and reports no payment or email certification", async () => {
    const f = fixture();
    const result = await f.run();
    expect(result).toMatchObject({
      status: "inspected",
      readOnly: true,
      mappingsPublished: false,
      gatesChanged: false,
      paymentsVerified: false,
      auth: {
        siteUrlMatches: true,
        callbackExplicitlyAllowed: true,
        emailProvider: "resend",
        confirmationRequired: true,
        smtpCredentialsVerified: false,
        confirmationEmailDeliveryVerified: false,
      },
      catalogue: {
        readiness: "existing_mappings_match_provider_facts",
        matchedActiveMappings: 8,
        mappedStructureMatches: true,
      },
    });
    expect(f.capability.retrievePrice).toHaveBeenCalledTimes(8);
    expect(f.capability.retrieveProduct).toHaveBeenCalledTimes(4);
    const output = JSON.stringify(result);
    for (const secret of [
      privateValue,
      ...f.products.map((p) => p.productReference),
      ...f.prices.map((p) => p.priceReference),
    ])
      expect(output).not.toContain(secret);
    for (const v of f.state.versions) expect(output).not.toContain(v.id);
  });
  it("reports compatible candidates without selecting or publishing absent mappings", async () => {
    const f = fixture();
    f.state.mappings = [];
    const result = await f.run();
    expect(result.catalogue).toMatchObject({
      readiness: "catalogue_mapping_publication_required",
      matchedActiveMappings: 0,
      candidateStructureMatches: true,
    });
    expect(f.capability.retrievePrice).not.toHaveBeenCalled();
    expect(f.capability.retrieveProduct).not.toHaveBeenCalled();
  });
  it.each([
    ["quantity", "QUANTITY_LIMITS_DIFFER"],
    ["trial", "PROVIDER_TRIAL_PRESENT"],
    ["overrides", "PRICE_OVERRIDES_PRESENT"],
    ["frequency", "RECURRENCE_DIFFERS"],
    ["tax", "TAX_CATEGORY_NOT_SAAS"],
  ])("identifies incompatible %s settings", async (field, code) => {
    const f = fixture();
    if (field === "quantity") f.prices[0].quantity.maximum = 100;
    if (field === "trial")
      f.prices[0].trial = { interval: "day", frequency: 14 };
    if (field === "overrides") f.prices[0].hasUnitPriceOverrides = true;
    if (field === "frequency") f.prices[0].billingCycle.frequency = 2;
    if (field === "tax") f.products[0].taxCategory = "digital-goods";
    const result = await f.run();
    expect(result.catalogue.pairs[0].candidateProblems).toContain(code);
    expect(result.catalogue.pairs[0].activeMappingMatches).toBe(false);
    expect(result.catalogue.readiness).toBe(
      "provider_catalogue_review_required",
    );
  });
  it("does not silently choose between duplicate compatible prices", async () => {
    const f = fixture();
    f.state.mappings = [];
    f.prices.push({
      ...f.prices[0],
      priceReference: "synthetic-duplicate-price",
    });
    const result = await f.run();
    expect(result.catalogue.pairs[0].compatibleCandidateCount).toBe(2);
    expect(result.catalogue.candidateStructureMatches).toBe(false);
  });
  it("rejects stale stored mappings even when provider prices exist", async () => {
    const f = fixture();
    f.state.mappings[0].version = "99999999-9999-4999-8999-999999999999";
    f.state.mappings[1].hasCatalogueEvidence = false;
    const result = await f.run();
    expect(result.catalogue.matchedActiveMappings).toBe(6);
    expect(result.catalogue.readiness).toBe(
      "catalogue_mapping_publication_required",
    );
  });
  it("requires different canonical products and paired cadence products", async () => {
    const f = fixture();
    for (let i = 2; i < 4; i++) {
      f.prices[i].productReference = f.prices[0].productReference;
      f.state.mappings[i].productRef = f.prices[0].productReference;
    }
    const result = await f.run();
    expect(result.catalogue.matchedActiveMappings).toBe(8);
    expect(result.catalogue.mappedStructureMatches).toBe(false);
    expect(result.catalogue.readiness).toBe(
      "provider_catalogue_review_required",
    );
  });
  it("detects a price change between listing and fresh retrieval", async () => {
    const f = fixture();
    f.capability.retrievePrice.mockImplementationOnce(async () => ({
      ...f.prices[0],
      quantity: { minimum: 1, maximum: 100 },
    }));
    const result = await f.run();
    expect(result.catalogue.pairs[0].compatibleCandidateCount).toBe(1);
    expect(result.catalogue.pairs[0].activeMappingMatches).toBe(false);
  });
  it.each([
    { STAGING_SUPABASE_PROJECT_REF: "unconfirmed-project" },
    { PADDLE_ENVIRONMENT: "production" },
    { SUPABASE_ACCESS_TOKEN: "" },
  ])("blocks invalid configuration before any request", async (change) => {
    const f = fixture();
    const result = await f.run({ env: { ...env, ...change } });
    expect(result.status).toBe("blocked");
    expect(f.transport).not.toHaveBeenCalled();
  });
  it("retains email observations when the workflow Paddle key is missing", async () => {
    const f = fixture();
    const result = await f.run({ env: { ...env, PADDLE_SANDBOX_API_KEY: "" } });
    expect(result).toMatchObject({
      status: "blocked",
      code: "PADDLE_SANDBOX_API_KEY_MISSING_IN_GITHUB",
      auth: { emailProvider: "resend" },
    });
    expect(f.createCapability).not.toHaveBeenCalled();
  });
  it("rejects canonical drift and live database policy before provider access", async () => {
    const f = fixture();
    f.state.versions[0].monthly = 1999;
    expect(() => validateCatalogueState(f.state)).toThrow(
      "STAGING_CANONICAL_CATALOGUE_DIFFERS",
    );
    f.state.policy.environment = "live";
    expect((await f.run()).status).toBe("blocked");
    expect(f.createCapability).not.toHaveBeenCalled();
  });
  it("redacts arbitrary provider errors and SMTP secrets", async () => {
    const f = fixture();
    f.capability.listPrices.mockRejectedValue(new Error(privateValue));
    const result = await f.run();
    expect(result.code).toBe("SANDBOX_CATALOGUE_INSPECTION_FAILED");
    expect(JSON.stringify(result)).not.toContain(privateValue);
    expect(JSON.stringify(summarizeStagingAuth(f.auth))).not.toContain(
      privateValue,
    );
  });
  it("preserves only safe provider failure categories and HTTP status", async () => {
    const f = fixture();
    f.capability.listProducts.mockRejectedValue(
      new PaddleCatalogueError("forbidden", 403),
    );
    expect(await f.run()).toMatchObject({
      status: "blocked",
      code: "PADDLE_CATALOGUE_FORBIDDEN",
      httpStatus: 403,
    });
  });
  it("reports wrong redirects and default SMTP without claiming delivery", () => {
    expect(
      summarizeStagingAuth({
        site_url: "https://example.test",
        uri_allow_list: "",
        smtp_host: "",
      }),
    ).toMatchObject({
      siteUrlMatches: false,
      callbackExplicitlyAllowed: false,
      emailProvider: "supabase_default",
      confirmationRequired: null,
      confirmationEmailDeliveryVerified: false,
    });
  });
  it("uses the existing protected staging review with only read-only credentials", () => {
    const workflow = createRequire(import.meta.url)("js-yaml").load(
      readFileSync(".github/workflows/paddle-staging-readiness.yml", "utf8"),
    );
    expect(workflow.on.push.branches).toEqual(["Ahmed-billing"]);
    expect(workflow.jobs.catalogue.environment).toBe("supabase-staging");
    expect(workflow.jobs.catalogue.needs).toBe("validate");
    expect(JSON.stringify(workflow.jobs.validate)).not.toContain("secrets.");
    expect(JSON.stringify(workflow.jobs.catalogue)).not.toMatch(
      /SUPABASE_DB_PASSWORD|ALLOW_REMOTE_SUPABASE|functions deploy|db push/,
    );
    expect(CATALOGUE_QUERY).toMatch(/^select /);
    expect(CATALOGUE_QUERY).not.toMatch(
      /\b(update|insert|delete|alter|drop|truncate)\b/i,
    );
  });
});

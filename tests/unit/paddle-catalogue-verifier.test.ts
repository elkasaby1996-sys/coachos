import { afterEach, describe, expect, it, vi } from "vitest";
import { syntheticCatalogue } from "../fixtures/paddle-catalogue-verifier";
import {
  CATALOGUE_TAX_MODES,
  createPaddleCatalogueVerifier,
  parsePrivateCatalogueBinding,
  verifyCatalogueObservations,
} from "../../supabase/functions/_shared/paddle-catalogue-verifier";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const verify = (f: ReturnType<typeof syntheticCatalogue>) =>
  verifyCatalogueObservations(
    {
      provider: f.capability.provider,
      environment: f.capability.environment,
      products: f.products,
      prices: f.prices,
    },
    f.binding,
    f.binding.expectedCatalogue,
  );
describe("private explicit catalogue binding", () => {
  it("accepts eight explicit pairs regardless of order", () => {
    const f = syntheticCatalogue();
    f.binding.selections.reverse();
    expect(parsePrivateCatalogueBinding(f.binding).selections).toHaveLength(8);
  });
  it.each([
    ["missing pair", (b: any) => b.selections.pop()],
    [
      "duplicate pair",
      (b: any) => (b.selections[1].pair = b.selections[0].pair),
    ],
    [
      "duplicate price",
      (b: any) => (b.selections[1].priceRef = b.selections[0].priceRef),
    ],
    [
      "shared product claim",
      (b: any) => {
        b.selections[2].productRef = b.selections[0].productRef;
        b.selections[3].productRef = b.selections[0].productRef;
      },
    ],
    [
      "split product claim",
      (b: any) => (b.selections[1].productRef = "synthetic/other"),
    ],
    ["unknown key", (b: any) => (b.selections[0].pair = "unknown.monthly")],
    ["wrong environment", (b: any) => (b.environment = "live")],
    ["wrong schema", (b: any) => (b.schema = "unknown")],
    ["whitespace ref", (b: any) => (b.selections[0].priceRef = " secret ")],
    ["control ref", (b: any) => (b.selections[0].priceRef = "secret\nvalue")],
    ["oversized ref", (b: any) => (b.selections[0].priceRef = "é".repeat(129))],
    [
      "missing version",
      (b: any) => delete b.expectedCatalogue.canonicalVersions.launch,
    ],
    [
      "duplicate version",
      (b: any) =>
        (b.expectedCatalogue.canonicalVersions.growth =
          b.expectedCatalogue.canonicalVersions.launch),
    ],
    [
      "unknown tax mode",
      (b: any) => (b.expectedCatalogue.taxMode = "secret-mode"),
    ],
    ["unknown property", (b: any) => (b.providerSecret = "synthetic-secret")],
  ])("rejects %s without exposing input", (_, mutate) => {
    const f = syntheticCatalogue();
    mutate(f.binding);
    expect(() => parsePrivateCatalogueBinding(f.binding)).toThrow(
      /^(BINDING_INVALID|ENVIRONMENT)$/,
    );
  });
  it("rejects accessors without invoking them", () => {
    const f = syntheticCatalogue();
    const getter = vi.fn();
    Object.defineProperty(f.binding, "environment", { get: getter });
    expect(() => parsePrivateCatalogueBinding(f.binding)).toThrow();
    expect(getter).not.toHaveBeenCalled();
  });
});
describe("strict advisory verification", () => {
  it("does not let supplied expectations override the private review", () => {
    const f = syntheticCatalogue();
    const expected = structuredClone(f.binding.expectedCatalogue);
    expected.canonicalVersions.launch = "00000000-0000-4000-8000-000000000099";
    expect(() =>
      createPaddleCatalogueVerifier(f.capability, f.binding, expected),
    ).toThrow("BINDING_INVALID");
    expect(
      verifyCatalogueObservations(
        {
          provider: "paddle",
          environment: "test",
          products: f.products,
          prices: f.prices,
        },
        f.binding,
        expected,
      ).discrepancyCodes,
    ).toEqual(["BINDING_INVALID"]);
  });
  it.each(CATALOGUE_TAX_MODES)("supports reviewed %s tax mode", (taxMode) => {
    const f = syntheticCatalogue();
    f.binding.expectedCatalogue.taxMode = taxMode;
    f.prices.forEach((p) => (p.taxMode = taxMode));
    const result = verify(f);
    expect(result.canonicalPairsVerified).toBe(8);
    expect(result.receiptCount).toBe(0);
    expect(result.pairs.every((p) => p.taxMode === taxMode)).toBe(true);
  });
  it.each([
    ["amount", "AMOUNT", (f: any) => (f.prices[0].unitPrice.amount = "1901")],
    [
      "currency",
      "CURRENCY",
      (f: any) => (f.prices[0].unitPrice.currency = "EUR"),
    ],
    [
      "cadence",
      "RECURRENCE",
      (f: any) => (f.prices[0].billingCycle.interval = "year"),
    ],
    [
      "frequency",
      "RECURRENCE",
      (f: any) => (f.prices[0].billingCycle.frequency = 2),
    ],
    [
      "nonrecurring",
      "RECURRENCE",
      (f: any) => (f.prices[0].billingCycle = null),
    ],
    [
      "association",
      "ASSOCIATION",
      (f: any) =>
        (f.prices[0].productReference = f.products[1].productReference),
    ],
    [
      "unknown tax",
      "TAX_MODE",
      (f: any) => (f.prices[0].taxMode = "secret-tax"),
    ],
    [
      "unreviewed tax",
      "TAX_MODE",
      (f: any) => (f.prices[0].taxMode = "external"),
    ],
    [
      "category",
      "TAX_CATEGORY",
      (f: any) => (f.products[0].taxCategory = "unknown"),
    ],
    [
      "inactive product",
      "PRODUCT_INACTIVE",
      (f: any) => (f.products[0].status = "archived"),
    ],
    [
      "inactive price",
      "PRICE_INACTIVE",
      (f: any) => (f.prices[0].status = "archived"),
    ],
    [
      "trial",
      "TRIAL",
      (f: any) => (f.prices[0].trial = { interval: "day", frequency: 3 }),
    ],
    ["missing trial fact", "TRIAL", (f: any) => delete f.prices[0].trial],
    [
      "override",
      "OVERRIDE",
      (f: any) => (f.prices[0].hasUnitPriceOverrides = true),
    ],
    [
      "unknown override",
      "OVERRIDE",
      (f: any) => delete f.prices[0].hasUnitPriceOverrides,
    ],
    [
      "minimum quantity",
      "QUANTITY",
      (f: any) => (f.prices[0].quantity.minimum = 2),
    ],
    [
      "maximum quantity",
      "QUANTITY",
      (f: any) => (f.prices[0].quantity.maximum = 5),
    ],
    ["seat cap", "QUANTITY", (f: any) => (f.prices[6].quantity.maximum = 99)],
    [
      "duplicate observed price",
      "DUPLICATE_REFERENCE",
      (f: any) => f.prices.push(f.prices[0]),
    ],
    [
      "duplicate observed product",
      "DUPLICATE_REFERENCE",
      (f: any) => f.products.push(f.products[0]),
    ],
    ["missing price", "MISSING_RESOURCE", (f: any) => f.prices.pop()],
    [
      "wrong environment",
      "ENVIRONMENT",
      (f: any) => (f.capability.environment = "live"),
    ],
    [
      "wrong provider",
      "ENVIRONMENT",
      (f: any) => (f.capability.provider = "other"),
    ],
  ])("rejects %s", (_, code, mutate) => {
    const f = syntheticCatalogue();
    mutate(f);
    const r = verify(f);
    expect(r.discrepancyCodes).toContain(code);
    expect(r.canonicalPairsVerified).toBeLessThan(8);
    expect(JSON.stringify(r)).not.toContain("synthetic/");
    expect(r.receiptCount).toBe(0);
  });
  it("uses binding rather than resource ordering or names", () => {
    const f = syntheticCatalogue();
    f.products.reverse();
    f.prices.reverse();
    Object.assign(f.products[0], { name: "Wrong name" });
    expect(verify(f).canonicalPairsVerified).toBe(8);
  });
});
describe("trusted fresh receipt issuance without publication", () => {
  it("captures private input independently of later caller mutation", async () => {
    const f = syntheticCatalogue();
    const v = createPaddleCatalogueVerifier(
      f.capability,
      f.binding,
      f.binding.expectedCatalogue,
    );
    f.binding.selections[0].priceRef = "synthetic/tampered";
    f.binding.expectedCatalogue.taxMode = "external";
    expect((await v.verify()).receiptCount).toBe(8);
  });
  it("refuses overlapping verification and handoff during refresh", async () => {
    const f = syntheticCatalogue();
    let release!: (products: typeof f.products) => void;
    f.capability.listProducts = () =>
      new Promise((resolve) => {
        release = resolve;
      });
    const v = createPaddleCatalogueVerifier(
      f.capability,
      f.binding,
      f.binding.expectedCatalogue,
    );
    const pending = v.verify();
    expect((await v.verify()).discrepancyCodes).toEqual(["FRESHNESS"]);
    expect(() => v.withVerifiedReceipts(() => {})).toThrow("RECEIPT");
    release(f.products);
    expect((await pending).receiptCount).toBe(8);
  });
  it("issues exactly eight instance-bound nonserializable catalogue-only receipts", async () => {
    const f = syntheticCatalogue(),
      getPrice = vi.spyOn(f.capability, "retrievePrice"),
      getProduct = vi.spyOn(f.capability, "retrieveProduct");
    const v = createPaddleCatalogueVerifier(
      f.capability,
      f.binding,
      f.binding.expectedCatalogue,
    );
    const r = await v.verify();
    expect(r.receiptCount).toBe(8);
    expect(getPrice).toHaveBeenCalledTimes(8);
    expect(getProduct).toHaveBeenCalledTimes(4);
    expect(Object.keys(v).sort()).toEqual(["verify", "withVerifiedReceipts"]);
    const other = createPaddleCatalogueVerifier(
      f.capability,
      f.binding,
      f.binding.expectedCatalogue,
    );
    await other.verify();
    v.withVerifiedReceipts((tokens, boundary) => {
      expect(tokens).toHaveLength(8);
      expect(Object.isFrozen(tokens)).toBe(true);
      for (const token of tokens) {
        expect(() => JSON.stringify(token)).toThrow(
          "BILLING_RECEIPT_NOT_SERIALIZABLE",
        );
        const proof = boundary.catalogueArguments(token).p_proof;
        expect(proof.provider).toBe("paddle");
        expect(proof.environment).toBe("test");
        expect(proof.evidenceClass).toBe("verified_catalogue");
        expect(() => boundary.transactionArguments(token as any)).toThrow(
          "BILLING_RECEIPT_INVALID",
        );
        expect(() =>
          boundary.catalogueArguments(token, {
            provider: "paddle",
            environment: "live",
          }),
        ).toThrow();
        other.withVerifiedReceipts((_, issuer) =>
          expect(() => issuer.catalogueArguments(token)).toThrow(
            "BILLING_RECEIPT_INVALID",
          ),
        );
      }
      expect(() => boundary.catalogueArguments({} as any)).toThrow();
    });
    expect(JSON.stringify(r)).not.toContain("synthetic/");
    expect(r.pairs.map((p) => p.passed)).toEqual(Array(8).fill(true));
  });
  it("fresh retrieves override an earlier valid list", async () => {
    const f = syntheticCatalogue();
    const original = f.capability.retrievePrice;
    f.capability.retrievePrice = async (ref) => ({
      ...(await original(ref)),
      status: "archived",
    });
    const v = createPaddleCatalogueVerifier(
      f.capability,
      f.binding,
      f.binding.expectedCatalogue,
    );
    expect((await v.verify()).receiptCount).toBe(0);
    expect(() => v.withVerifiedReceipts(() => {})).toThrow("RECEIPT");
  });
  it("does not issue partial receipts", async () => {
    const f = syntheticCatalogue();
    f.prices[7].unitPrice.amount = "1";
    const v = createPaddleCatalogueVerifier(
      f.capability,
      f.binding,
      f.binding.expectedCatalogue,
    );
    const r = await v.verify();
    expect(r.canonicalPairsVerified).toBe(7);
    expect(r.receiptCount).toBe(0);
    expect(() => v.withVerifiedReceipts(() => {})).toThrow();
  });
  it("invalidates prior receipts after a failed refresh", async () => {
    const f = syntheticCatalogue();
    const v = createPaddleCatalogueVerifier(
      f.capability,
      f.binding,
      f.binding.expectedCatalogue,
    );
    await v.verify();
    f.prices[0].hasUnitPriceOverrides = true;
    await v.verify();
    expect(() => v.withVerifiedReceipts(() => {})).toThrow();
  });
  it("rejects swapped retrieval identities", async () => {
    const f = syntheticCatalogue();
    f.capability.retrievePrice = async () => f.prices[1];
    const v = createPaddleCatalogueVerifier(
      f.capability,
      f.binding,
      f.binding.expectedCatalogue,
    );
    expect((await v.verify()).discrepancyCodes).toEqual(["ASSOCIATION"]);
  });
  it("redacts transport exceptions", async () => {
    const f = syntheticCatalogue();
    f.capability.listProducts = async () => {
      throw Error("synthetic-private-key-and-ref");
    };
    const v = createPaddleCatalogueVerifier(
      f.capability,
      f.binding,
      f.binding.expectedCatalogue,
    );
    const r = await v.verify();
    expect(r.discrepancyCodes).toEqual(["TRANSPORT"]);
    expect(JSON.stringify(r)).not.toContain("synthetic-private");
  });
  it("rejects stale batches and receipt consumption", async () => {
    const f = syntheticCatalogue();
    const v = createPaddleCatalogueVerifier(
      f.capability,
      f.binding,
      f.binding.expectedCatalogue,
    );
    const now = Date.now();
    const clock = vi.spyOn(Date, "now").mockReturnValue(now);
    await v.verify();
    clock.mockReturnValue(now + 60001);
    expect(() => v.withVerifiedReceipts(() => {})).toThrow();
    clock.mockReturnValueOnce(now).mockReturnValue(now + 60001);
    expect((await v.verify()).discrepancyCodes).toEqual(["FRESHNESS"]);
  });
  it("rejects browser execution", () => {
    vi.stubGlobal("window", {});
    const f = syntheticCatalogue();
    expect(() =>
      createPaddleCatalogueVerifier(
        f.capability,
        f.binding,
        f.binding.expectedCatalogue,
      ),
    ).toThrow();
  });
});

import { assertServer } from "./paddle-catalogue/config.ts";
import type {
  PaddleCatalogueCapability,
  PaddlePriceObservation,
  PaddleProductObservation,
} from "./paddle-catalogue/contract.ts";
import {
  createVerifiedEvidenceBoundaryV2,
  type VerifiedCatalogueV1,
} from "./billing-verified-receipts-v2.ts";
import type { CatalogueProofV1 } from "./billing-catalogue-proof-v1.ts";

export const CATALOGUE_KEYS = [
  "launch",
  "growth",
  "scale",
  "coach-seat",
] as const;
export const CATALOGUE_PAIRS = CATALOGUE_KEYS.flatMap(
  (key) => [`${key}.monthly`, `${key}.annual`] as const,
);
export const CATALOGUE_TAX_MODES = [
  "account_setting",
  "internal",
  "external",
  "location",
] as const;
export type CatalogueKey = (typeof CATALOGUE_KEYS)[number];
export type CataloguePair = `${CatalogueKey}.${"monthly" | "annual"}`;
export type TaxMode = (typeof CATALOGUE_TAX_MODES)[number];
export type ExpectedCatalogue = {
  canonicalVersions: Record<CatalogueKey, string>;
  taxCategory: "saas";
  taxMode: TaxMode;
};
export type CatalogueBinding = {
  schema: "repsync-paddle-catalogue-binding-v1";
  environment: "test";
  expectedCatalogue: ExpectedCatalogue;
  selections: { pair: CataloguePair; productRef: string; priceRef: string }[];
};
export type DiscrepancyCode =
  | "BINDING_INVALID"
  | "ENVIRONMENT"
  | "OBSERVATION_INVALID"
  | "DUPLICATE_REFERENCE"
  | "MISSING_RESOURCE"
  | "PRODUCT_INACTIVE"
  | "PRICE_INACTIVE"
  | "ASSOCIATION"
  | "CURRENCY"
  | "AMOUNT"
  | "RECURRENCE"
  | "TAX_MODE"
  | "TAX_CATEGORY"
  | "TRIAL"
  | "OVERRIDE"
  | "QUANTITY"
  | "TRANSPORT"
  | "FRESHNESS"
  | "RECEIPT"
  | "BINDING_PATH_REQUIRED"
  | "BINDING_FILE_UNREADABLE"
  | "BINDING_FILE_UNSAFE";
export class CatalogueVerificationError extends Error {
  constructor(readonly code: DiscrepancyCode) {
    super(code);
    this.name = "CatalogueVerificationError";
  }
}
function fail(code: DiscrepancyCode): never {
  throw new CatalogueVerificationError(code);
}
function object(value: unknown, fields: string[]): Record<string, unknown> {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value))
  )
    fail("BINDING_INVALID");
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (
    Reflect.ownKeys(value).length !== fields.length ||
    fields.some(
      (k) => !descriptors[k]?.enumerable || !("value" in descriptors[k]),
    )
  )
    fail("BINDING_INVALID");
  return value as Record<string, unknown>;
}
function reference(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    new TextEncoder().encode(value).length <= 256 &&
    !/[\s\x00-\x1f\x7f]/.test(value)
  );
}
function expectedCatalogue(value: unknown): ExpectedCatalogue {
  const e = object(value, ["canonicalVersions", "taxCategory", "taxMode"]);
  const versions = object(e.canonicalVersions, [...CATALOGUE_KEYS]);
  if (
    e.taxCategory !== "saas" ||
    !CATALOGUE_TAX_MODES.includes(e.taxMode as TaxMode) ||
    CATALOGUE_KEYS.some(
      (k) =>
        typeof versions[k] !== "string" ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(
          versions[k] as string,
        ),
    ) ||
    new Set(Object.values(versions)).size !== 4
  )
    fail("BINDING_INVALID");
  return structuredClone(e) as ExpectedCatalogue;
}
function matchExpected(binding: CatalogueBinding, expected: ExpectedCatalogue) {
  const approved = binding.expectedCatalogue;
  if (
    approved.taxMode !== expected.taxMode ||
    approved.taxCategory !== expected.taxCategory ||
    CATALOGUE_KEYS.some(
      (key) =>
        approved.canonicalVersions[key] !== expected.canonicalVersions[key],
    )
  )
    fail("BINDING_INVALID");
}
/** Private operator state only; never infer identity from names, IDs or ordering. */
export function parsePrivateCatalogueBinding(value: unknown): CatalogueBinding {
  assertServer();
  const b = object(value, [
    "schema",
    "environment",
    "expectedCatalogue",
    "selections",
  ]);
  if (b.schema !== "repsync-paddle-catalogue-binding-v1")
    fail("BINDING_INVALID");
  if (b.environment !== "test") fail("ENVIRONMENT");
  expectedCatalogue(b.expectedCatalogue);
  if (!Array.isArray(b.selections) || b.selections.length !== 8)
    fail("BINDING_INVALID");
  for (const item of b.selections) {
    const s = object(item, ["pair", "productRef", "priceRef"]);
    if (
      !CATALOGUE_PAIRS.includes(s.pair as CataloguePair) ||
      !reference(s.productRef) ||
      !reference(s.priceRef)
    )
      fail("BINDING_INVALID");
  }
  const result = structuredClone(b) as CatalogueBinding;
  if (
    new Set(result.selections.map((s) => s.pair)).size !== 8 ||
    new Set(result.selections.map((s) => s.priceRef)).size !== 8
  )
    fail("BINDING_INVALID");
  const products = CATALOGUE_KEYS.map((key) => {
    const pair = result.selections.filter((s) => s.pair.startsWith(`${key}.`));
    if (pair[0].productRef !== pair[1].productRef) fail("BINDING_INVALID");
    return pair[0].productRef;
  });
  if (new Set(products).size !== 4) fail("BINDING_INVALID");
  return result;
}
export type PairVerification = {
  pair: CataloguePair;
  passed: boolean;
  taxMode: TaxMode | null;
  trialPresent: boolean | null;
  monetaryOverridePresent: boolean | null;
  discrepancyCodes: DiscrepancyCode[];
};
export type CatalogueVerificationSummary = {
  productsObserved: number;
  recurringPricesObserved: number;
  canonicalPairsVerified: number;
  pairs: PairVerification[];
  receiptCount: number;
  discrepancyCodes: DiscrepancyCode[];
};
export function failedCatalogueSummary(
  code: DiscrepancyCode,
): CatalogueVerificationSummary {
  return {
    productsObserved: 0,
    recurringPricesObserved: 0,
    canonicalPairsVerified: 0,
    pairs: CATALOGUE_PAIRS.map((pair) => ({
      pair,
      passed: false,
      taxMode: null,
      trialPresent: null,
      monetaryOverridePresent: null,
      discrepancyCodes: [code],
    })),
    receiptCount: 0,
    discrepancyCodes: [code],
  };
}
type Observations = {
  provider: string;
  environment: string;
  products: PaddleProductObservation[];
  prices: PaddlePriceObservation[];
};
const monthlyAmounts = {
  launch: 1900,
  growth: 5900,
  scale: 11900,
  "coach-seat": 1200,
} as const;
/** Advisory pure validation: this function alone can never issue receipts. */
export function verifyCatalogueObservations(
  observations: Observations,
  input: unknown,
  expected: ExpectedCatalogue,
): CatalogueVerificationSummary {
  assertServer();
  try {
    const binding = parsePrivateCatalogueBinding(input),
      review = expectedCatalogue(expected);
    matchExpected(binding, review);
    if (
      observations.provider !== "paddle" ||
      observations.environment !== "test"
    )
      return failedCatalogueSummary("ENVIRONMENT");
    const products = structuredClone(observations.products),
      prices = structuredClone(observations.prices);
    if (
      !Array.isArray(products) ||
      !Array.isArray(prices) ||
      products.some((p) => !p || !reference(p.productReference)) ||
      prices.some(
        (p) =>
          !p || !reference(p.priceReference) || !reference(p.productReference),
      )
    )
      return failedCatalogueSummary("OBSERVATION_INVALID");
    if (
      new Set(products.map((p) => p.productReference)).size !==
        products.length ||
      new Set(prices.map((p) => p.priceReference)).size !== prices.length
    )
      return failedCatalogueSummary("DUPLICATE_REFERENCE");
    const pairs = CATALOGUE_PAIRS.map((pair) => {
      const selection = binding.selections.find((s) => s.pair === pair)!;
      const product = products.find(
          (p) => p.productReference === selection.productRef,
        ),
        price = prices.find((p) => p.priceReference === selection.priceRef);
      const codes: DiscrepancyCode[] = [];
      const [key, cadence] = pair.split(".") as [
        CatalogueKey,
        "monthly" | "annual",
      ];
      if (!product || !price) codes.push("MISSING_RESOURCE");
      else {
        if (product.status !== "active") codes.push("PRODUCT_INACTIVE");
        if (price.status !== "active") codes.push("PRICE_INACTIVE");
        if (price.productReference !== selection.productRef)
          codes.push("ASSOCIATION");
        if (price.unitPrice?.currency !== "USD") codes.push("CURRENCY");
        if (
          price.unitPrice?.amount !==
          String(monthlyAmounts[key] * (cadence === "annual" ? 10 : 1))
        )
          codes.push("AMOUNT");
        if (
          price.billingCycle?.frequency !== 1 ||
          price.billingCycle.interval !==
            (cadence === "annual" ? "year" : "month")
        )
          codes.push("RECURRENCE");
        if (
          !CATALOGUE_TAX_MODES.includes(price.taxMode) ||
          price.taxMode !== review.taxMode
        )
          codes.push("TAX_MODE");
        if (product.taxCategory !== review.taxCategory)
          codes.push("TAX_CATEGORY");
        if (price.trial !== null) codes.push("TRIAL");
        if (price.hasUnitPriceOverrides !== false) codes.push("OVERRIDE");
        if (
          price.quantity?.minimum !== 1 ||
          price.quantity.maximum !== (key === "coach-seat" ? 5 : 1)
        )
          codes.push("QUANTITY");
      }
      return {
        pair,
        passed: codes.length === 0,
        taxMode:
          price && CATALOGUE_TAX_MODES.includes(price.taxMode)
            ? price.taxMode
            : null,
        trialPresent:
          price?.trial === null ? false : price?.trial ? true : null,
        monetaryOverridePresent:
          typeof price?.hasUnitPriceOverrides === "boolean"
            ? price.hasUnitPriceOverrides
            : null,
        discrepancyCodes: codes,
      };
    });
    return {
      productsObserved: products.length,
      recurringPricesObserved: prices.filter(
        (p) => p.billingCycle !== null && p.billingCycle !== undefined,
      ).length,
      canonicalPairsVerified: pairs.filter((p) => p.passed).length,
      pairs,
      receiptCount: 0,
      discrepancyCodes: [...new Set(pairs.flatMap((p) => p.discrepancyCodes))],
    };
  } catch (e) {
    return failedCatalogueSummary(
      e instanceof CatalogueVerificationError ? e.code : "OBSERVATION_INVALID",
    );
  }
}

/** Trusted server composition only. No database, publication, checkout or payment port.
 * Receipts and their boundary travel through a separate in-memory callback, never
 * through the serializable summary. Consumers remain inside the trusted runtime. */
export function createPaddleCatalogueVerifier(
  capability: PaddleCatalogueCapability,
  input: unknown,
  expected: ExpectedCatalogue,
) {
  assertServer();
  const binding = parsePrivateCatalogueBinding(input),
    review = expectedCatalogue(expected);
  matchExpected(binding, review);
  let receipts: readonly VerifiedCatalogueV1[] = [],
    issuedAt = 0,
    running = false;
  const proofs = new Map<string, CatalogueProofV1>();
  const unavailable = async (): Promise<never> => fail("RECEIPT");
  const boundary = createVerifiedEvidenceBoundaryV2({
    provider: "paddle",
    environment: "test",
    verifyEvent: unavailable,
    retrieveSubscription: unavailable,
    retrieveTransaction: unavailable,
    async retrieveCatalogue(ref) {
      const proof = proofs.get(ref);
      if (!proof) fail("RECEIPT");
      return proof;
    },
  });
  const scope = () => {
    if (capability.provider !== "paddle" || capability.environment !== "test")
      fail("ENVIRONMENT");
  };
  const listProducts = capability.listProducts.bind(capability),
    listPrices = capability.listPrices.bind(capability),
    retrieveProduct = capability.retrieveProduct.bind(capability),
    retrievePrice = capability.retrievePrice.bind(capability);
  return Object.freeze({
    async verify(): Promise<CatalogueVerificationSummary> {
      assertServer();
      if (running) return failedCatalogueSummary("FRESHNESS");
      running = true;
      receipts = [];
      proofs.clear();
      const started = Date.now();
      try {
        scope();
        const listedProducts = await listProducts(),
          listedPrices = await listPrices();
        const listed = verifyCatalogueObservations(
          {
            provider: capability.provider,
            environment: capability.environment,
            products: listedProducts,
            prices: listedPrices,
          },
          binding,
          review,
        );
        if (listed.canonicalPairsVerified !== 8) return listed;
        const products: PaddleProductObservation[] = [],
          prices: PaddlePriceObservation[] = [];
        for (const ref of new Set(
          binding.selections.map((s) => s.productRef),
        )) {
          const product = await retrieveProduct(ref);
          if (product.productReference !== ref) fail("ASSOCIATION");
          products.push(structuredClone(product));
        }
        for (const s of binding.selections) {
          const price = await retrievePrice(s.priceRef);
          if (price.priceReference !== s.priceRef) fail("ASSOCIATION");
          prices.push(structuredClone(price));
        }
        scope();
        if (Date.now() - started > 60000) fail("FRESHNESS");
        const summary = verifyCatalogueObservations(
          {
            provider: capability.provider,
            environment: capability.environment,
            products,
            prices,
          },
          binding,
          review,
        );
        summary.productsObserved = listed.productsObserved;
        summary.recurringPricesObserved = listed.recurringPricesObserved;
        if (summary.canonicalPairsVerified !== 8) return summary;
        const observation = crypto.randomUUID(),
          observedAt = new Date().toISOString();
        for (const pair of CATALOGUE_PAIRS) {
          const s = binding.selections.find((s) => s.pair === pair)!;
          const price = prices.find((p) => p.priceReference === s.priceRef)!;
          const [key, cadence] = pair.split(".") as [
            CatalogueKey,
            "monthly" | "annual",
          ];
          proofs.set(s.priceRef, {
            schema: "billing-catalogue-v1",
            validator: "paddle-catalogue-contract-v1",
            kind: "catalogue",
            source: "catalogue_api",
            evidenceClass: "verified_catalogue",
            provider: "paddle",
            environment: "test",
            verificationRef: observation,
            observedAt,
            catalogue: {
              productRef: s.productRef,
              priceRef: s.priceRef,
              identityKind: key === "coach-seat" ? "addon" : "plan",
              canonicalKey: key,
              canonicalVersionId: review.canonicalVersions[key],
              cadence,
              currency: "USD",
              unitAmountMinor: Number(price.unitPrice.amount),
              recurrenceUnit: cadence === "annual" ? "year" : "month",
              recurrenceCount: 1,
              trial: null,
              productStatus: "active",
              priceStatus: "active",
              quantity: { ...price.quantity },
            },
          });
        }
        const tokens: VerifiedCatalogueV1[] = [];
        for (const pair of CATALOGUE_PAIRS)
          tokens.push(
            await boundary.retrieveCatalogue(
              binding.selections.find((s) => s.pair === pair)!.priceRef,
            ),
          );
        receipts = Object.freeze(tokens);
        issuedAt = Date.now();
        summary.receiptCount = receipts.length;
        return summary;
      } catch (e) {
        receipts = [];
        return failedCatalogueSummary(
          e instanceof CatalogueVerificationError ? e.code : "TRANSPORT",
        );
      } finally {
        proofs.clear();
        running = false;
      }
    },
    withVerifiedReceipts<T>(
      consume: (
        tokens: readonly VerifiedCatalogueV1[],
        issuer: typeof boundary,
      ) => T,
    ): T {
      assertServer();
      if (running || receipts.length !== 8 || Date.now() - issuedAt > 60000)
        fail("RECEIPT");
      return consume(receipts, boundary);
    },
  });
}

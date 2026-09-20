import {
  CATALOGUE_KEYS,
  CATALOGUE_PAIRS,
  type CatalogueBinding,
} from "../../supabase/functions/_shared/paddle-catalogue-verifier.ts";
import type {
  PaddleCatalogueCapability,
  PaddlePriceObservation,
  PaddleProductObservation,
} from "../../supabase/functions/_shared/paddle-catalogue/contract.ts";

export function syntheticCatalogue() {
  const binding: CatalogueBinding = {
    schema: "repsync-paddle-catalogue-binding-v1",
    environment: "test",
    expectedCatalogue: {
      canonicalVersions: {
        launch: "00000000-0000-4000-8000-000000000001",
        growth: "00000000-0000-4000-8000-000000000002",
        scale: "00000000-0000-4000-8000-000000000003",
        "coach-seat": "00000000-0000-4000-8000-000000000004",
      },
      taxCategory: "saas",
      taxMode: "location",
    },
    selections: CATALOGUE_PAIRS.map((pair) => ({
      pair,
      productRef: `synthetic/product/${pair.split(".")[0]}`,
      priceRef: `synthetic/price/${pair}`,
    })),
  };
  const products: PaddleProductObservation[] = CATALOGUE_KEYS.map((key) => ({
    productReference: `synthetic/product/${key}`,
    status: "active",
    taxCategory: "saas",
  }));
  const prices: PaddlePriceObservation[] = binding.selections.map((s) => {
    const [key, cadence] = s.pair.split(".");
    return {
      priceReference: s.priceRef,
      productReference: s.productRef,
      status: "active",
      unitPrice: {
        currency: "USD",
        amount: String(
          { launch: 1900, growth: 5900, scale: 11900, "coach-seat": 1200 }[
            key
          ]! * (cadence === "annual" ? 10 : 1),
        ),
      },
      billingCycle: {
        interval: cadence === "monthly" ? "month" : "year",
        frequency: 1,
      },
      trial: null,
      quantity: { minimum: 1, maximum: key === "coach-seat" ? 5 : 1 },
      taxMode: "location",
      hasUnitPriceOverrides: false,
    };
  });
  const capability: PaddleCatalogueCapability = {
    provider: "paddle",
    environment: "test",
    listProducts: async () => structuredClone(products),
    listPrices: async () => structuredClone(prices),
    retrieveProduct: async (ref) =>
      structuredClone(products.find((p) => p.productReference === ref)!),
    retrievePrice: async (ref) =>
      structuredClone(prices.find((p) => p.priceReference === ref)!),
  };
  return { binding, products, prices, capability };
}

import { describe, expect, it } from "vitest";
import {
  PUBLIC_PLAN_KEYS,
  COMMERCIAL_PLAN_KEYS,
  COMMERCIAL_FEATURE_KEYS,
  FEATURE_DOMAINS,
  PLAN_FEATURE_KEYS,
  SCALE_ONLY_FEATURE_KEYS,
} from "../../src/features/commercial-catalogue/contracts";
import {
  PUBLIC_PLAN_SNAPSHOT_V1,
  formatCommercialPrice,
  formatPublishedPackageCapacity,
} from "../../src/features/commercial-catalogue/public-plan-snapshot";
import {
  fetchPublicCommercialCatalogue,
  publicCommercialCatalogueSchema,
  CommercialCatalogueError,
} from "../../src/features/commercial-catalogue/catalogue-api";

describe("commercial catalogue v1", () => {
  it("has exactly the three public plans and private custom key", () => {
    expect(PUBLIC_PLAN_KEYS).toEqual(["launch", "growth", "scale"]);
    expect(COMMERCIAL_PLAN_KEYS).toEqual([
      "launch",
      "growth",
      "scale",
      "custom",
    ]);
    expect(PUBLIC_PLAN_SNAPSHOT_V1.map((plan) => plan.planKey)).toEqual(
      PUBLIC_PLAN_KEYS,
    );
  });
  it("locks exact prices and capacities", () => {
    expect(
      PUBLIC_PLAN_SNAPSHOT_V1.map((p) => [
        p.planVersion,
        p.currencyCode,
        p.monthlyPriceMinor,
        p.annualPriceMinor,
        ...Object.values(p.capacities),
      ]),
    ).toEqual([
      [1, "USD", 1900, 19000, 10, 1, 2, 1, 3],
      [1, "USD", 5900, 59000, 50, 2, 5, 3, null],
      [1, "USD", 11900, 119000, 100, 5, 10, 5, null],
    ]);
    expect(
      PUBLIC_PLAN_SNAPSHOT_V1.filter((p) => p.isMostPopular).map(
        (p) => p.planKey,
      ),
    ).toEqual(["growth"]);
    for (const p of PUBLIC_PLAN_SNAPSHOT_V1) {
      expect(p.annualPriceMinor).toBe(p.monthlyPriceMinor * 10);
      expect(Object.isFrozen(p)).toBe(true);
      expect(Object.isFrozen(p.capacities)).toBe(true);
    }
    expect(Object.isFrozen(PUBLIC_PLAN_SNAPSHOT_V1)).toBe(true);
  });
  it("has unique domain-scoped canonical features and complete monotonic mappings", () => {
    expect(COMMERCIAL_FEATURE_KEYS).toHaveLength(63);
    expect(new Set(COMMERCIAL_FEATURE_KEYS).size).toBe(63);
    for (const key of COMMERCIAL_FEATURE_KEYS) {
      expect(key).toMatch(/^[a-z]+\.[a-z]+(?:_[a-z]+)*$/);
      expect(FEATURE_DOMAINS).toContain(key.split(".")[0]);
      expect(PLAN_FEATURE_KEYS.scale).toContain(key);
      if (key.startsWith("core.")) {
        for (const plan of PUBLIC_PLAN_KEYS)
          expect(PLAN_FEATURE_KEYS[plan]).toContain(key);
      }
    }
    for (const key of [
      "premium_user",
      "pro_access",
      "growth_feature",
      "scale_page",
      "is_paid",
    ])
      expect(COMMERCIAL_FEATURE_KEYS).not.toContain(key);
    expect(PLAN_FEATURE_KEYS.launch).toHaveLength(29);
    expect(PLAN_FEATURE_KEYS.growth).toHaveLength(47);
    expect(PLAN_FEATURE_KEYS.scale).toHaveLength(63);
    for (const key of PLAN_FEATURE_KEYS.growth)
      expect(PLAN_FEATURE_KEYS.scale).toContain(key);
    for (const key of SCALE_ONLY_FEATURE_KEYS) {
      expect(PLAN_FEATURE_KEYS.launch).not.toContain(key);
      expect(PLAN_FEATURE_KEYS.growth).not.toContain(key);
    }
  });
  it("formats minor units and nullable unlimited packages", () => {
    expect(formatCommercialPrice(119000)).toBe("$1,190");
    expect(formatCommercialPrice(1950)).toBe("$19.50");
    expect(formatPublishedPackageCapacity(null)).toBe(
      "Unlimited published packages",
    );
    expect(formatPublishedPackageCapacity(3)).toBe("3 published packages");
  });
});

const validPayload = () => ({
  schemaVersion: 1,
  plans: PUBLIC_PLAN_SNAPSHOT_V1.map((p) => ({
    ...p,
    capacities: { ...p.capacities },
    features: [],
  })),
});

describe("public catalogue RPC boundary", () => {
  it("parses valid data and preserves null limits", () => {
    expect(
      publicCommercialCatalogueSchema.parse(validPayload()).plans[1].capacities
        .publishedPackages,
    ).toBeNull();
  });
  it.each([
    ["planKey", "studio"],
    ["planKey", "custom"],
    ["planKey", "unknown"],
    ["currencyCode", "usd"],
    ["currencyCode", "US"],
    ["currencyCode", "USDD"],
    ["currencyCode", "USD\n"],
    ["monthlyPriceMinor", -1],
    ["annualPriceMinor", -1],
    ["monthlyPriceMinor", 0],
    ["monthlyPriceMinor", 1.5],
    ["planVersion", 0],
  ])("rejects invalid %s = %s", (field, value) => {
    const payload = validPayload();
    Object.assign(payload.plans[0], { [field]: value });
    expect(publicCommercialCatalogueSchema.safeParse(payload).success).toBe(
      false,
    );
  });
  it.each([
    "countedClients",
    "includedCoachSeats",
    "maxCoachSeats",
    "activeWorkspaces",
    "publishedPackages",
  ])("rejects invalid %s", (field) => {
    for (const value of [0, -1, 1.5, "3"]) {
      const payload = validPayload();
      Object.assign(payload.plans[0].capacities, { [field]: value });
      expect(publicCommercialCatalogueSchema.safeParse(payload).success).toBe(
        false,
      );
    }
  });
  it("rejects included seats above maximum", () => {
    const payload = validPayload();
    Object.assign(payload.plans[0].capacities, { includedCoachSeats: 3 });
    expect(publicCommercialCatalogueSchema.safeParse(payload).success).toBe(
      false,
    );
  });
  it("returns typed errors for transport, provider, and validation failures", async () => {
    for (const rpc of [
      async () => {
        throw new Error("private detail");
      },
      async () => ({ data: null, error: { secret: "private detail" } }),
    ]) {
      const result = await fetchPublicCommercialCatalogue({ rpc });
      expect(result.data).toBeNull();
      expect(result.error).toBeInstanceOf(CommercialCatalogueError);
      expect(result.error?.code).toBe("UNAVAILABLE");
      expect(JSON.stringify(result)).not.toContain("private detail");
    }
    expect(
      (
        await fetchPublicCommercialCatalogue({
          rpc: async () => ({ data: {}, error: null }),
        })
      ).error?.code,
    ).toBe("INVALID_PAYLOAD");
  });
  it("calls the no-argument RPC and returns parsed catalogue data", async () => {
    const result = await fetchPublicCommercialCatalogue({
      rpc: async (name) => {
        expect(name).toBe("get_public_commercial_catalogue");
        return { data: validPayload(), error: null };
      },
    });
    expect(result.error).toBeNull();
    expect(result.data?.plans).toHaveLength(3);
  });
});

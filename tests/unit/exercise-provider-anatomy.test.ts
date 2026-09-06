import { describe, expect, it } from "vitest";
import {
  CANONICAL_TO_SAFE_PROVIDER_FILTERS,
  PROVIDER_BODY_PART_MAPPINGS,
  PROVIDER_BODY_PART_VALUES,
  PROVIDER_TARGET_MUSCLE_MAPPINGS,
  PROVIDER_TARGET_MUSCLE_VALUES,
  clearProviderAnatomyFilters,
  getProviderAnatomyExplanation,
  resolveProviderBodyPartMapping,
  resolveProviderTargetMuscleMapping,
  selectCanonicalMuscle,
  selectProviderBodyPart,
  selectProviderTargetMuscle,
} from "../../src/lib/exercise-provider-anatomy";
import {
  BODY_REGIONS,
  MUSCLE_KEYS,
} from "../../src/lib/exercise-muscle-taxonomy";

const expectedBodyParts = [
  "BACK",
  "CALVES",
  "CHEST",
  "FOREARMS",
  "HIPS",
  "NECK",
  "SHOULDERS",
  "THIGHS",
  "WAIST",
  "HANDS",
  "FEET",
  "FACE",
  "FULL BODY",
  "BICEPS",
  "UPPER ARMS",
  "TRICEPS",
  "HAMSTRINGS",
  "QUADRICEPS",
] as const;

const expectedTargets = [
  "ADDUCTOR LONGUS",
  "ADDUCTOR BREVIS",
  "ADDUCTOR MAGNUS",
  "BICEPS BRACHII",
  "BRACHIALIS",
  "BRACHIORADIALIS",
  "DEEP HIP EXTERNAL ROTATORS",
  "ANTERIOR DELTOID",
  "LATERAL DELTOID",
  "POSTERIOR DELTOID",
  "ERECTOR SPINAE",
  "GASTROCNEMIUS",
  "GLUTEUS MAXIMUS",
  "GLUTEUS MEDIUS",
  "GLUTEUS MINIMUS",
  "GRACILIS",
  "HAMSTRINGS",
  "ILIOPSOAS",
  "INFRASPINATUS",
  "LATISSIMUS DORSI",
  "LEVATOR SCAPULAE",
  "OBLIQUES",
  "PECTINEUS",
  "PECTORALIS MAJOR CLAVICULAR HEAD",
  "PECTORALIS MAJOR STERNAL HEAD",
  "POPLITEUS",
  "QUADRICEPS",
  "RECTUS ABDOMINIS",
  "SARTORIUS",
  "SERRATUS ANTE",
  "SERRATUS ANTERIOR",
  "SOLEUS",
  "SPLENIUS",
  "STERNOCLEIDOMASTOID",
  "SUBSCAPULARIS",
  "TENSOR FASCIAE LATAE",
  "TERES MAJOR",
  "TERES MINOR",
  "TIBIALIS ANTERIOR",
  "TRANSVERSUS ABDOMINIS",
  "TRAPEZIUS LOWER FIBERS",
  "TRAPEZIUS MIDDLE FIBERS",
  "TRAPEZIUS UPPER FIBERS",
  "TRICEPS BRACHII",
  "WRIST EXTENSORS",
  "WRIST FLEXORS",
] as const;

describe("provider anatomy corpora and registries", () => {
  it("contains exactly the documented 18 body parts and 46 targets", () => {
    expect(PROVIDER_BODY_PART_VALUES).toEqual(expectedBodyParts);
    expect(PROVIDER_TARGET_MUSCLE_VALUES).toEqual(expectedTargets);
    expect(new Set(PROVIDER_BODY_PART_VALUES).size).toBe(18);
    expect(new Set(PROVIDER_TARGET_MUSCLE_VALUES).size).toBe(46);
  });

  it("maps every corpus value exactly once to valid canonical keys", () => {
    expect(
      PROVIDER_BODY_PART_MAPPINGS.map((item) => item.providerValue),
    ).toEqual(expectedBodyParts);
    expect(
      PROVIDER_TARGET_MUSCLE_MAPPINGS.map((item) => item.providerValue),
    ).toEqual(expectedTargets);

    const validRegions = new Set(BODY_REGIONS.map(({ key }) => key));
    const validMuscles = new Set(MUSCLE_KEYS);
    for (const mapping of PROVIDER_BODY_PART_MAPPINGS) {
      if (mapping.canonicalBodyRegionKey) {
        expect(validRegions.has(mapping.canonicalBodyRegionKey)).toBe(true);
      }
    }
    for (const mapping of PROVIDER_TARGET_MUSCLE_MAPPINGS) {
      if (mapping.canonicalBodyRegionKey) {
        expect(validRegions.has(mapping.canonicalBodyRegionKey)).toBe(true);
      }
      if (mapping.canonicalMuscleKey) {
        expect(validMuscles.has(mapping.canonicalMuscleKey)).toBe(true);
      }
      if (mapping.disposition === "region_only") {
        expect(mapping.canonicalMuscleKey).toBeNull();
      }
      if (mapping.disposition === "unsupported") {
        expect(mapping.canonicalMuscleKey).toBeNull();
        expect(mapping.canonicalBodyRegionKey).toBeNull();
      }
    }
    expect(Object.keys(CANONICAL_TO_SAFE_PROVIDER_FILTERS).sort()).toEqual(
      [...MUSCLE_KEYS].sort(),
    );
  });

  it("keeps the reviewed disposition totals stable", () => {
    const count = (values: readonly { disposition: string }[]) =>
      values.reduce<Record<string, number>>((totals, { disposition }) => {
        totals[disposition] = (totals[disposition] ?? 0) + 1;
        return totals;
      }, {});
    expect(count(PROVIDER_BODY_PART_MAPPINGS)).toEqual({
      exact: 5,
      region_only: 9,
      unsupported: 4,
    });
    expect(count(PROVIDER_TARGET_MUSCLE_MAPPINGS)).toEqual({
      grouped: 20,
      exact: 13,
      region_only: 10,
      unsupported: 3,
    });
  });

  it("keeps high-risk anatomy distinctions explicit", () => {
    expect(resolveProviderTargetMuscleMapping("wrist flexors")).toMatchObject({
      status: "mapped",
      mapping: { disposition: "grouped", canonicalMuscleKey: "forearms" },
    });
    expect(
      resolveProviderTargetMuscleMapping("PECTORALIS MAJOR CLAVICULAR HEAD"),
    ).toMatchObject({
      status: "mapped",
      mapping: { disposition: "grouped", canonicalMuscleKey: "pectorals" },
    });
    for (const value of ["INFRASPINATUS", "SUBSCAPULARIS", "TERES MINOR"]) {
      expect(resolveProviderTargetMuscleMapping(value)).toMatchObject({
        status: "mapped",
        mapping: { disposition: "region_only", canonicalMuscleKey: null },
      });
    }
    for (const value of ["SERRATUS ANTE", "SERRATUS ANTERIOR"]) {
      expect(resolveProviderTargetMuscleMapping(value)).toMatchObject({
        status: "mapped",
        mapping: {
          disposition: "region_only",
          canonicalBodyRegionKey: "core",
        },
      });
    }
    expect(resolveProviderBodyPartMapping("NECK")).toMatchObject({
      status: "mapped",
      mapping: { disposition: "unsupported" },
    });
    expect(resolveProviderTargetMuscleMapping("vendor-only")).toEqual({
      status: "unmapped",
      providerValue: "vendor-only",
    });
  });
});

describe("provider anatomy filter coordinator", () => {
  it("synchronizes exact and grouped provider targets to the visualizer", () => {
    const exact = selectProviderTargetMuscle(
      clearProviderAnatomyFilters(),
      "BICEPS BRACHII",
    );
    expect(exact).toMatchObject({
      providerTargetMuscle: "BICEPS BRACHII",
      canonicalMuscleKey: "biceps",
      source: "provider_target",
      provenance: {
        providerTargetMuscle: "manual",
        canonicalMuscleKey: "derived",
      },
    });
    const grouped = selectProviderTargetMuscle(exact, "WRIST FLEXORS");
    expect(grouped.canonicalMuscleKey).toBe("forearms");
    expect(getProviderAnatomyExplanation(grouped)?.tone).toBe("grouped");
  });

  it("keeps region-only and unsupported provider filters without guessing a muscle", () => {
    const regionOnly = selectProviderTargetMuscle(
      clearProviderAnatomyFilters(),
      "INFRASPINATUS",
    );
    expect(regionOnly.canonicalMuscleKey).toBeNull();
    expect(getProviderAnatomyExplanation(regionOnly)?.tone).toBe("region_only");

    const unsupported = selectProviderTargetMuscle(
      regionOnly,
      "STERNOCLEIDOMASTOID",
    );
    expect(unsupported.canonicalMuscleKey).toBeNull();
    expect(getProviderAnatomyExplanation(unsupported)?.tone).toBe(
      "unsupported",
    );
  });

  it("derives only safe provider filters from visualizer selections", () => {
    const pectorals = selectCanonicalMuscle(
      clearProviderAnatomyFilters(),
      "pectorals",
    );
    expect(pectorals).toMatchObject({
      providerBodyPart: "CHEST",
      providerTargetMuscle: null,
      canonicalMuscleKey: "pectorals",
      source: "visualizer",
      provenance: {
        providerBodyPart: "derived",
        canonicalMuscleKey: "manual",
      },
    });
    const anteriorDeltoid = selectCanonicalMuscle(
      clearProviderAnatomyFilters(),
      "anterior_deltoids",
    );
    expect(anteriorDeltoid.providerTargetMuscle).toBe("ANTERIOR DELTOID");
  });

  it("clears derived values while preserving independent manual filters", () => {
    const manualBody = selectProviderBodyPart(
      clearProviderAnatomyFilters(),
      "BACK",
    );
    const visualizer = selectCanonicalMuscle(manualBody, "quadriceps");
    expect(visualizer.providerBodyPart).toBe("BACK");
    expect(visualizer.providerTargetMuscle).toBe("QUADRICEPS");

    const clearedVisualizer = selectCanonicalMuscle(visualizer, null);
    expect(clearedVisualizer.providerBodyPart).toBe("BACK");
    expect(clearedVisualizer.providerTargetMuscle).toBeNull();
    expect(clearedVisualizer.canonicalMuscleKey).toBeNull();

    const manualTarget = selectProviderTargetMuscle(
      clearProviderAnatomyFilters(),
      "QUADRICEPS",
    );
    const clearedTarget = selectProviderTargetMuscle(manualTarget, null);
    expect(clearedTarget.providerTargetMuscle).toBeNull();
    expect(clearedTarget.canonicalMuscleKey).toBeNull();
  });
});

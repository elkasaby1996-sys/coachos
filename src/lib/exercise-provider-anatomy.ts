import {
  getMuscleMetadata,
  type BodyRegionKey,
  type MuscleKey,
} from "./exercise-muscle-taxonomy";

export const PROVIDER_BODY_PART_VALUES = [
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

export const PROVIDER_TARGET_MUSCLE_VALUES = [
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

export type ProviderBodyPartValue = (typeof PROVIDER_BODY_PART_VALUES)[number];
export type ProviderTargetMuscleValue =
  (typeof PROVIDER_TARGET_MUSCLE_VALUES)[number];

const providerDisplayLabel = (value: string) =>
  value
    .toLocaleLowerCase()
    .split(" ")
    .map((word) => word.charAt(0).toLocaleUpperCase() + word.slice(1))
    .join(" ");

export const PROVIDER_BODY_PART_OPTIONS = PROVIDER_BODY_PART_VALUES.map(
  (value) => ({ value, label: providerDisplayLabel(value) }),
);

export const PROVIDER_TARGET_MUSCLE_OPTIONS = PROVIDER_TARGET_MUSCLE_VALUES.map(
  (value) => ({
    value,
    label: providerDisplayLabel(value),
  }),
);

export type ProviderAnatomyMappingDisposition =
  | "exact"
  | "grouped"
  | "region_only"
  | "unsupported";

export type ProviderTargetMuscleMapping = {
  providerValue: ProviderTargetMuscleValue;
  disposition: ProviderAnatomyMappingDisposition;
  canonicalMuscleKey: MuscleKey | null;
  canonicalBodyRegionKey: BodyRegionKey | null;
  explanation?: string;
};

export type ProviderBodyPartMapping = {
  providerValue: ProviderBodyPartValue;
  disposition: "exact" | "region_only" | "unsupported";
  canonicalBodyRegionKey: BodyRegionKey | null;
  explanation?: string;
};

export const PROVIDER_BODY_PART_MAPPINGS: readonly ProviderBodyPartMapping[] = [
  {
    providerValue: "BACK",
    disposition: "exact",
    canonicalBodyRegionKey: "back",
  },
  {
    providerValue: "CALVES",
    disposition: "region_only",
    canonicalBodyRegionKey: "lower_legs",
  },
  {
    providerValue: "CHEST",
    disposition: "exact",
    canonicalBodyRegionKey: "chest",
  },
  {
    providerValue: "FOREARMS",
    disposition: "exact",
    canonicalBodyRegionKey: "forearms",
  },
  {
    providerValue: "HIPS",
    disposition: "region_only",
    canonicalBodyRegionKey: "hips_glutes",
  },
  {
    providerValue: "NECK",
    disposition: "unsupported",
    canonicalBodyRegionKey: null,
    explanation: "Neck is not represented by the current body map.",
  },
  {
    providerValue: "SHOULDERS",
    disposition: "exact",
    canonicalBodyRegionKey: "shoulders",
  },
  {
    providerValue: "THIGHS",
    disposition: "region_only",
    canonicalBodyRegionKey: "upper_legs",
  },
  {
    providerValue: "WAIST",
    disposition: "region_only",
    canonicalBodyRegionKey: "core",
  },
  {
    providerValue: "HANDS",
    disposition: "unsupported",
    canonicalBodyRegionKey: null,
    explanation: "Hands are not represented by the current body map.",
  },
  {
    providerValue: "FEET",
    disposition: "unsupported",
    canonicalBodyRegionKey: null,
    explanation: "Feet are not represented by the current body map.",
  },
  {
    providerValue: "FACE",
    disposition: "unsupported",
    canonicalBodyRegionKey: null,
    explanation: "Face is not represented by the current body map.",
  },
  {
    providerValue: "FULL BODY",
    disposition: "exact",
    canonicalBodyRegionKey: "full_body",
  },
  {
    providerValue: "BICEPS",
    disposition: "region_only",
    canonicalBodyRegionKey: "arms",
  },
  {
    providerValue: "UPPER ARMS",
    disposition: "region_only",
    canonicalBodyRegionKey: "arms",
  },
  {
    providerValue: "TRICEPS",
    disposition: "region_only",
    canonicalBodyRegionKey: "arms",
  },
  {
    providerValue: "HAMSTRINGS",
    disposition: "region_only",
    canonicalBodyRegionKey: "upper_legs",
  },
  {
    providerValue: "QUADRICEPS",
    disposition: "region_only",
    canonicalBodyRegionKey: "upper_legs",
  },
];

export const PROVIDER_TARGET_MUSCLE_MAPPINGS: readonly ProviderTargetMuscleMapping[] =
  [
    {
      providerValue: "ADDUCTOR LONGUS",
      disposition: "grouped",
      canonicalMuscleKey: "adductors",
      canonicalBodyRegionKey: "upper_legs",
    },
    {
      providerValue: "ADDUCTOR BREVIS",
      disposition: "grouped",
      canonicalMuscleKey: "adductors",
      canonicalBodyRegionKey: "upper_legs",
    },
    {
      providerValue: "ADDUCTOR MAGNUS",
      disposition: "grouped",
      canonicalMuscleKey: "adductors",
      canonicalBodyRegionKey: "upper_legs",
    },
    {
      providerValue: "BICEPS BRACHII",
      disposition: "exact",
      canonicalMuscleKey: "biceps",
      canonicalBodyRegionKey: "arms",
    },
    {
      providerValue: "BRACHIALIS",
      disposition: "grouped",
      canonicalMuscleKey: "biceps",
      canonicalBodyRegionKey: "arms",
    },
    {
      providerValue: "BRACHIORADIALIS",
      disposition: "grouped",
      canonicalMuscleKey: "forearms",
      canonicalBodyRegionKey: "forearms",
    },
    {
      providerValue: "DEEP HIP EXTERNAL ROTATORS",
      disposition: "region_only",
      canonicalMuscleKey: null,
      canonicalBodyRegionKey: "hips_glutes",
      explanation:
        "No current canonical muscle accurately represents this group.",
    },
    {
      providerValue: "ANTERIOR DELTOID",
      disposition: "exact",
      canonicalMuscleKey: "anterior_deltoids",
      canonicalBodyRegionKey: "shoulders",
    },
    {
      providerValue: "LATERAL DELTOID",
      disposition: "exact",
      canonicalMuscleKey: "lateral_deltoids",
      canonicalBodyRegionKey: "shoulders",
    },
    {
      providerValue: "POSTERIOR DELTOID",
      disposition: "exact",
      canonicalMuscleKey: "posterior_deltoids",
      canonicalBodyRegionKey: "shoulders",
    },
    {
      providerValue: "ERECTOR SPINAE",
      disposition: "exact",
      canonicalMuscleKey: "spinal_erectors",
      canonicalBodyRegionKey: "back",
    },
    {
      providerValue: "GASTROCNEMIUS",
      disposition: "grouped",
      canonicalMuscleKey: "calves",
      canonicalBodyRegionKey: "lower_legs",
    },
    {
      providerValue: "GLUTEUS MAXIMUS",
      disposition: "grouped",
      canonicalMuscleKey: "gluteals",
      canonicalBodyRegionKey: "hips_glutes",
    },
    {
      providerValue: "GLUTEUS MEDIUS",
      disposition: "grouped",
      canonicalMuscleKey: "gluteals",
      canonicalBodyRegionKey: "hips_glutes",
    },
    {
      providerValue: "GLUTEUS MINIMUS",
      disposition: "grouped",
      canonicalMuscleKey: "gluteals",
      canonicalBodyRegionKey: "hips_glutes",
    },
    {
      providerValue: "GRACILIS",
      disposition: "grouped",
      canonicalMuscleKey: "adductors",
      canonicalBodyRegionKey: "upper_legs",
    },
    {
      providerValue: "HAMSTRINGS",
      disposition: "exact",
      canonicalMuscleKey: "hamstrings",
      canonicalBodyRegionKey: "upper_legs",
    },
    {
      providerValue: "ILIOPSOAS",
      disposition: "exact",
      canonicalMuscleKey: "hip_flexors",
      canonicalBodyRegionKey: "hips_glutes",
    },
    {
      providerValue: "INFRASPINATUS",
      disposition: "region_only",
      canonicalMuscleKey: null,
      canonicalBodyRegionKey: "shoulders",
      explanation: "Rotator-cuff muscles are not represented as deltoids.",
    },
    {
      providerValue: "LATISSIMUS DORSI",
      disposition: "exact",
      canonicalMuscleKey: "latissimus_dorsi",
      canonicalBodyRegionKey: "back",
    },
    {
      providerValue: "LEVATOR SCAPULAE",
      disposition: "region_only",
      canonicalMuscleKey: null,
      canonicalBodyRegionKey: "back",
    },
    {
      providerValue: "OBLIQUES",
      disposition: "exact",
      canonicalMuscleKey: "obliques",
      canonicalBodyRegionKey: "core",
    },
    {
      providerValue: "PECTINEUS",
      disposition: "grouped",
      canonicalMuscleKey: "adductors",
      canonicalBodyRegionKey: "upper_legs",
    },
    {
      providerValue: "PECTORALIS MAJOR CLAVICULAR HEAD",
      disposition: "grouped",
      canonicalMuscleKey: "pectorals",
      canonicalBodyRegionKey: "chest",
    },
    {
      providerValue: "PECTORALIS MAJOR STERNAL HEAD",
      disposition: "grouped",
      canonicalMuscleKey: "pectorals",
      canonicalBodyRegionKey: "chest",
    },
    {
      providerValue: "POPLITEUS",
      disposition: "unsupported",
      canonicalMuscleKey: null,
      canonicalBodyRegionKey: null,
      explanation:
        "The current map has no accurate knee-region representation.",
    },
    {
      providerValue: "QUADRICEPS",
      disposition: "exact",
      canonicalMuscleKey: "quadriceps",
      canonicalBodyRegionKey: "upper_legs",
    },
    {
      providerValue: "RECTUS ABDOMINIS",
      disposition: "exact",
      canonicalMuscleKey: "rectus_abdominis",
      canonicalBodyRegionKey: "core",
    },
    {
      providerValue: "SARTORIUS",
      disposition: "region_only",
      canonicalMuscleKey: null,
      canonicalBodyRegionKey: "upper_legs",
    },
    {
      providerValue: "SERRATUS ANTE",
      disposition: "region_only",
      canonicalMuscleKey: null,
      canonicalBodyRegionKey: "core",
      explanation: "Serratus is not represented as an oblique muscle.",
    },
    {
      providerValue: "SERRATUS ANTERIOR",
      disposition: "region_only",
      canonicalMuscleKey: null,
      canonicalBodyRegionKey: "core",
      explanation: "Serratus is not represented as an oblique muscle.",
    },
    {
      providerValue: "SOLEUS",
      disposition: "grouped",
      canonicalMuscleKey: "calves",
      canonicalBodyRegionKey: "lower_legs",
    },
    {
      providerValue: "SPLENIUS",
      disposition: "unsupported",
      canonicalMuscleKey: null,
      canonicalBodyRegionKey: null,
      explanation: "The current map has no neck muscle region.",
    },
    {
      providerValue: "STERNOCLEIDOMASTOID",
      disposition: "unsupported",
      canonicalMuscleKey: null,
      canonicalBodyRegionKey: null,
      explanation: "The current map has no neck muscle region.",
    },
    {
      providerValue: "SUBSCAPULARIS",
      disposition: "region_only",
      canonicalMuscleKey: null,
      canonicalBodyRegionKey: "shoulders",
      explanation: "Rotator-cuff muscles are not represented as deltoids.",
    },
    {
      providerValue: "TENSOR FASCIAE LATAE",
      disposition: "grouped",
      canonicalMuscleKey: "hip_abductors",
      canonicalBodyRegionKey: "hips_glutes",
    },
    {
      providerValue: "TERES MAJOR",
      disposition: "region_only",
      canonicalMuscleKey: null,
      canonicalBodyRegionKey: "back",
    },
    {
      providerValue: "TERES MINOR",
      disposition: "region_only",
      canonicalMuscleKey: null,
      canonicalBodyRegionKey: "shoulders",
      explanation: "Rotator-cuff muscles are not represented as deltoids.",
    },
    {
      providerValue: "TIBIALIS ANTERIOR",
      disposition: "exact",
      canonicalMuscleKey: "tibialis_anterior",
      canonicalBodyRegionKey: "lower_legs",
    },
    {
      providerValue: "TRANSVERSUS ABDOMINIS",
      disposition: "region_only",
      canonicalMuscleKey: null,
      canonicalBodyRegionKey: "core",
    },
    {
      providerValue: "TRAPEZIUS LOWER FIBERS",
      disposition: "grouped",
      canonicalMuscleKey: "trapezius",
      canonicalBodyRegionKey: "back",
    },
    {
      providerValue: "TRAPEZIUS MIDDLE FIBERS",
      disposition: "grouped",
      canonicalMuscleKey: "trapezius",
      canonicalBodyRegionKey: "back",
    },
    {
      providerValue: "TRAPEZIUS UPPER FIBERS",
      disposition: "grouped",
      canonicalMuscleKey: "trapezius",
      canonicalBodyRegionKey: "back",
    },
    {
      providerValue: "TRICEPS BRACHII",
      disposition: "exact",
      canonicalMuscleKey: "triceps",
      canonicalBodyRegionKey: "arms",
    },
    {
      providerValue: "WRIST EXTENSORS",
      disposition: "grouped",
      canonicalMuscleKey: "forearms",
      canonicalBodyRegionKey: "forearms",
    },
    {
      providerValue: "WRIST FLEXORS",
      disposition: "grouped",
      canonicalMuscleKey: "forearms",
      canonicalBodyRegionKey: "forearms",
    },
  ];

const normalizeProviderValue = (value: string) =>
  value.trim().toLocaleUpperCase();

const bodyPartValueByNormalized = new Map(
  PROVIDER_BODY_PART_VALUES.map((value) => [
    normalizeProviderValue(value),
    value,
  ]),
);
const targetValueByNormalized = new Map(
  PROVIDER_TARGET_MUSCLE_VALUES.map((value) => [
    normalizeProviderValue(value),
    value,
  ]),
);
const bodyPartMappingByValue = new Map(
  PROVIDER_BODY_PART_MAPPINGS.map((mapping) => [
    mapping.providerValue,
    mapping,
  ]),
);
const targetMappingByValue = new Map(
  PROVIDER_TARGET_MUSCLE_MAPPINGS.map((mapping) => [
    mapping.providerValue,
    mapping,
  ]),
);

export const parseProviderBodyPartValue = (
  value: unknown,
): ProviderBodyPartValue | null =>
  typeof value === "string"
    ? (bodyPartValueByNormalized.get(normalizeProviderValue(value)) ?? null)
    : null;

export const parseProviderTargetMuscleValue = (
  value: unknown,
): ProviderTargetMuscleValue | null =>
  typeof value === "string"
    ? (targetValueByNormalized.get(normalizeProviderValue(value)) ?? null)
    : null;

export type ProviderMappingResolution<T> =
  | { status: "mapped"; mapping: T }
  | { status: "unmapped"; providerValue: string | null };

export function resolveProviderBodyPartMapping(
  value: unknown,
): ProviderMappingResolution<ProviderBodyPartMapping> {
  const providerValue = parseProviderBodyPartValue(value);
  const mapping = providerValue
    ? bodyPartMappingByValue.get(providerValue)
    : undefined;
  return mapping
    ? { status: "mapped", mapping }
    : {
        status: "unmapped",
        providerValue: typeof value === "string" ? value.trim() || null : null,
      };
}

export function resolveProviderTargetMuscleMapping(
  value: unknown,
): ProviderMappingResolution<ProviderTargetMuscleMapping> {
  const providerValue = parseProviderTargetMuscleValue(value);
  const mapping = providerValue
    ? targetMappingByValue.get(providerValue)
    : undefined;
  return mapping
    ? { status: "mapped", mapping }
    : {
        status: "unmapped",
        providerValue: typeof value === "string" ? value.trim() || null : null,
      };
}

type ProviderFilterDerivation = {
  providerBodyPart: ProviderBodyPartValue | null;
  providerTargetMuscle: ProviderTargetMuscleValue | null;
};

export const CANONICAL_TO_SAFE_PROVIDER_FILTERS: Readonly<
  Record<MuscleKey, ProviderFilterDerivation>
> = {
  pectorals: { providerBodyPart: "CHEST", providerTargetMuscle: null },
  anterior_deltoids: {
    providerBodyPart: null,
    providerTargetMuscle: "ANTERIOR DELTOID",
  },
  lateral_deltoids: {
    providerBodyPart: null,
    providerTargetMuscle: "LATERAL DELTOID",
  },
  posterior_deltoids: {
    providerBodyPart: null,
    providerTargetMuscle: "POSTERIOR DELTOID",
  },
  biceps: { providerBodyPart: "UPPER ARMS", providerTargetMuscle: null },
  triceps: { providerBodyPart: null, providerTargetMuscle: "TRICEPS BRACHII" },
  forearms: { providerBodyPart: "FOREARMS", providerTargetMuscle: null },
  rectus_abdominis: {
    providerBodyPart: null,
    providerTargetMuscle: "RECTUS ABDOMINIS",
  },
  obliques: { providerBodyPart: null, providerTargetMuscle: "OBLIQUES" },
  hip_flexors: { providerBodyPart: "HIPS", providerTargetMuscle: null },
  trapezius: { providerBodyPart: "BACK", providerTargetMuscle: null },
  latissimus_dorsi: {
    providerBodyPart: null,
    providerTargetMuscle: "LATISSIMUS DORSI",
  },
  rhomboids: { providerBodyPart: "BACK", providerTargetMuscle: null },
  spinal_erectors: {
    providerBodyPart: null,
    providerTargetMuscle: "ERECTOR SPINAE",
  },
  gluteals: { providerBodyPart: "HIPS", providerTargetMuscle: null },
  hip_abductors: { providerBodyPart: "HIPS", providerTargetMuscle: null },
  quadriceps: { providerBodyPart: null, providerTargetMuscle: "QUADRICEPS" },
  hamstrings: { providerBodyPart: null, providerTargetMuscle: "HAMSTRINGS" },
  adductors: { providerBodyPart: "THIGHS", providerTargetMuscle: null },
  calves: { providerBodyPart: "CALVES", providerTargetMuscle: null },
  tibialis_anterior: {
    providerBodyPart: null,
    providerTargetMuscle: "TIBIALIS ANTERIOR",
  },
};

export type ProviderAnatomyFilterSource =
  | "visualizer"
  | "provider_target"
  | "provider_body_part"
  | null;
export type ProviderAnatomyValueProvenance = "manual" | "derived" | null;

export type ProviderAnatomyFilterState = {
  providerBodyPart: ProviderBodyPartValue | null;
  providerTargetMuscle: ProviderTargetMuscleValue | null;
  canonicalMuscleKey: MuscleKey | null;
  source: ProviderAnatomyFilterSource;
  provenance: {
    providerBodyPart: ProviderAnatomyValueProvenance;
    providerTargetMuscle: ProviderAnatomyValueProvenance;
    canonicalMuscleKey: ProviderAnatomyValueProvenance;
  };
};

export const EMPTY_PROVIDER_ANATOMY_FILTER_STATE: ProviderAnatomyFilterState = {
  providerBodyPart: null,
  providerTargetMuscle: null,
  canonicalMuscleKey: null,
  source: null,
  provenance: {
    providerBodyPart: null,
    providerTargetMuscle: null,
    canonicalMuscleKey: null,
  },
};

const remainingProviderSource = (
  state: ProviderAnatomyFilterState,
): ProviderAnatomyFilterSource =>
  state.providerTargetMuscle
    ? "provider_target"
    : state.providerBodyPart
      ? "provider_body_part"
      : null;

export function selectProviderTargetMuscle(
  state: ProviderAnatomyFilterState,
  value: ProviderTargetMuscleValue | null,
): ProviderAnatomyFilterState {
  if (!value) {
    const clearDerivedCanonical =
      state.provenance.canonicalMuscleKey === "derived";
    const next = {
      ...state,
      providerTargetMuscle: null,
      canonicalMuscleKey: clearDerivedCanonical
        ? null
        : state.canonicalMuscleKey,
      provenance: {
        ...state.provenance,
        providerTargetMuscle: null,
        canonicalMuscleKey: clearDerivedCanonical
          ? null
          : state.provenance.canonicalMuscleKey,
      },
    };
    return { ...next, source: remainingProviderSource(next) };
  }

  const resolution = resolveProviderTargetMuscleMapping(value);
  const mapping = resolution.status === "mapped" ? resolution.mapping : null;
  const canonicalMuscleKey =
    mapping &&
    (mapping.disposition === "exact" || mapping.disposition === "grouped")
      ? mapping.canonicalMuscleKey
      : null;
  return {
    ...state,
    providerTargetMuscle: value,
    canonicalMuscleKey,
    source: "provider_target",
    provenance: {
      ...state.provenance,
      providerTargetMuscle: "manual",
      canonicalMuscleKey: canonicalMuscleKey ? "derived" : null,
    },
  };
}

export function selectProviderBodyPart(
  state: ProviderAnatomyFilterState,
  value: ProviderBodyPartValue | null,
): ProviderAnatomyFilterState {
  const next = {
    ...state,
    providerBodyPart: value,
    source: value ? ("provider_body_part" as const) : state.source,
    provenance: {
      ...state.provenance,
      providerBodyPart: value ? ("manual" as const) : null,
    },
  };
  return value ? next : { ...next, source: remainingProviderSource(next) };
}

export function selectCanonicalMuscle(
  state: ProviderAnatomyFilterState,
  value: MuscleKey | null,
): ProviderAnatomyFilterState {
  if (!value) {
    const next = {
      ...state,
      providerBodyPart:
        state.provenance.providerBodyPart === "derived"
          ? null
          : state.providerBodyPart,
      providerTargetMuscle:
        state.provenance.providerTargetMuscle === "derived"
          ? null
          : state.providerTargetMuscle,
      canonicalMuscleKey: null,
      provenance: {
        providerBodyPart:
          state.provenance.providerBodyPart === "derived"
            ? null
            : state.provenance.providerBodyPart,
        providerTargetMuscle:
          state.provenance.providerTargetMuscle === "derived"
            ? null
            : state.provenance.providerTargetMuscle,
        canonicalMuscleKey: null,
      },
    };
    return { ...next, source: remainingProviderSource(next) };
  }

  const derivation = CANONICAL_TO_SAFE_PROVIDER_FILTERS[value];
  const preserveManualBody = state.provenance.providerBodyPart === "manual";
  return {
    providerBodyPart: preserveManualBody
      ? state.providerBodyPart
      : derivation.providerBodyPart,
    providerTargetMuscle: derivation.providerTargetMuscle,
    canonicalMuscleKey: value,
    source: "visualizer",
    provenance: {
      providerBodyPart: preserveManualBody
        ? "manual"
        : derivation.providerBodyPart
          ? "derived"
          : null,
      providerTargetMuscle: derivation.providerTargetMuscle ? "derived" : null,
      canonicalMuscleKey: "manual",
    },
  };
}

export const clearProviderAnatomyFilters = (): ProviderAnatomyFilterState => ({
  ...EMPTY_PROVIDER_ANATOMY_FILTER_STATE,
  provenance: { ...EMPTY_PROVIDER_ANATOMY_FILTER_STATE.provenance },
});

export type ProviderAnatomyExplanation = {
  tone: "grouped" | "region_only" | "unsupported";
  message: string;
};

export function getProviderAnatomyExplanation(
  state: ProviderAnatomyFilterState,
): ProviderAnatomyExplanation | null {
  if (state.providerTargetMuscle) {
    const resolution = resolveProviderTargetMuscleMapping(
      state.providerTargetMuscle,
    );
    if (resolution.status === "unmapped") {
      return {
        tone: "unsupported",
        message: "This provider filter is not represented on the body map.",
      };
    }
    const { mapping } = resolution;
    if (mapping.disposition === "grouped" && mapping.canonicalMuscleKey) {
      return {
        tone: "grouped",
        message: `Provider target mapped to ${getMuscleMetadata(mapping.canonicalMuscleKey).label}.`,
      };
    }
    if (mapping.disposition === "region_only") {
      return {
        tone: "region_only",
        message:
          "Filtered by provider target. No exact body-map muscle is available.",
      };
    }
    if (mapping.disposition === "unsupported") {
      return {
        tone: "unsupported",
        message: "This provider filter is not represented on the body map.",
      };
    }
    return null;
  }

  if (state.providerBodyPart) {
    const resolution = resolveProviderBodyPartMapping(state.providerBodyPart);
    if (
      resolution.status === "unmapped" ||
      resolution.mapping.disposition === "unsupported"
    ) {
      return {
        tone: "unsupported",
        message: "This provider filter is not represented on the body map.",
      };
    }
  }
  return null;
}

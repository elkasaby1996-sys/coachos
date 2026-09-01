import {
  getMuscleMetadata,
  type AnatomicalSurface,
  type MuscleKey,
} from "../../../../lib/exercise-muscle-taxonomy";
import type {
  AnatomicalRegionDefinition,
  AnatomyShape,
  AnatomySide,
} from "../anatomy-registry";
import {
  VENDORED_MALE_BACK_GEOMETRY,
  VENDORED_MALE_BACK_OUTLINE_PATH,
  VENDORED_MALE_BACK_VIEW_BOX,
} from "./react-muscle-highlighter-male-back";
import {
  VENDORED_MALE_FRONT_GEOMETRY,
  VENDORED_MALE_FRONT_OUTLINE_PATH,
  VENDORED_MALE_FRONT_VIEW_BOX,
} from "./react-muscle-highlighter-male-front";
import {
  REPSYNC_ANATOMY_OVERLAYS,
  type RepSyncAnatomyOverlay,
} from "./repsync-anatomy-overlays";

type SourceSlugMap = Readonly<Partial<Record<string, MuscleKey>>>;

export type VendoredArtworkRegion = {
  readonly id: string;
  readonly sourceSlug: string | null;
  readonly surface: AnatomicalSurface;
  readonly side: AnatomySide;
  readonly muscleKey: MuscleKey | null;
  readonly paths: readonly string[];
  readonly role: "base" | "muscle" | "decorative";
};

// This is intentionally explicit. Upstream slugs are provenance metadata only;
// canonical MuscleKey values are the sole public selector output.
export const SOURCE_SLUG_TO_MUSCLE_KEY: Readonly<
  Record<AnatomicalSurface, SourceSlugMap>
> = {
  front: {
    chest: "pectorals",
    obliques: "obliques",
    abs: "rectus_abdominis",
    biceps: "biceps",
    forearm: "forearms",
    adductors: "adductors",
    quadriceps: "quadriceps",
    tibialis: "tibialis_anterior",
  },
  back: {
    trapezius: "trapezius",
    triceps: "triceps",
    forearm: "forearms",
    gluteal: "gluteals",
    hamstring: "hamstrings",
    calves: "calves",
  },
};

const surfaceGeometry = {
  front: VENDORED_MALE_FRONT_GEOMETRY,
  back: VENDORED_MALE_BACK_GEOMETRY,
} as const;

const sourceArtworkRegions = (
  surface: AnatomicalSurface,
): VendoredArtworkRegion[] => {
  const slugMap = SOURCE_SLUG_TO_MUSCLE_KEY[surface];

  return surfaceGeometry[surface].flatMap((geometry) => {
    const pathsBySide = geometry.paths as {
      readonly left?: readonly string[];
      readonly right?: readonly string[];
      readonly common?: readonly string[];
    };

    return (["left", "right", "common"] as const).flatMap((sourceSide) => {
      const paths = pathsBySide[sourceSide] ?? [];
      if (paths.length === 0) return [];
      const muscleKey = slugMap[geometry.sourceSlug] ?? null;
      return [
        {
          id: `${surface}-${geometry.sourceSlug}-${sourceSide}`,
          sourceSlug: geometry.sourceSlug,
          surface,
          side: sourceSide === "common" ? "center" : sourceSide,
          muscleKey,
          paths,
          role: muscleKey ? "muscle" : "decorative",
        },
      ];
    });
  });
};

export const VENDORED_ARTWORK_REGIONS = [
  {
    id: "front-base-outline",
    sourceSlug: null,
    surface: "front",
    side: "center",
    muscleKey: null,
    paths: [VENDORED_MALE_FRONT_OUTLINE_PATH],
    role: "base",
  },
  {
    id: "back-base-outline",
    sourceSlug: null,
    surface: "back",
    side: "center",
    muscleKey: null,
    paths: [VENDORED_MALE_BACK_OUTLINE_PATH],
    role: "base",
  },
  ...sourceArtworkRegions("front"),
  ...sourceArtworkRegions("back"),
  ...REPSYNC_ANATOMY_OVERLAYS.flatMap((overlay) =>
    (["left", "right"] as const).map((side) => ({
      id: `${overlay.id}-${side}`,
      sourceSlug: null,
      surface: overlay.surface,
      side,
      muscleKey: overlay.muscleKey,
      paths: overlay.paths[side],
      role: "muscle" as const,
    })),
  ),
] as const satisfies readonly VendoredArtworkRegion[];

const toShapes = (
  id: string,
  paths: {
    readonly left?: readonly string[];
    readonly right?: readonly string[];
    readonly common?: readonly string[];
  },
  kind: "art" | "hit" | "passive",
): AnatomyShape[] =>
  (["left", "right", "common"] as const).flatMap((sourceSide) =>
    (paths[sourceSide] ?? []).map((d, index) => ({
      id: `${kind}-${id}-${sourceSide}-${index}`,
      kind: "path" as const,
      side: (sourceSide === "common"
        ? "center"
        : sourceSide) satisfies AnatomySide,
      d,
      ...(kind === "hit" && /spinal-erectors|tibialis/.test(id)
        ? { strokeWidth: 14 }
        : {}),
    })),
  );

const supplementalHitShapes = (id: string): AnatomyShape[] => {
  if (id === "back-trapezius") {
    return [
      {
        id: "hit-back-trapezius-upper",
        kind: "path",
        side: "center",
        d: "M1038 307 C1055 326 1070 343 1084 365 C1098 343 1113 326 1130 307",
        strokeWidth: 20,
      },
    ];
  }

  if (id === "back-gluteal") {
    return [
      {
        id: "hit-back-gluteal-left-lower",
        kind: "path",
        side: "left",
        d: "M1012 758 C1026 775 1045 784 1063 781",
        strokeWidth: 24,
      },
      {
        id: "hit-back-gluteal-right-lower",
        kind: "path",
        side: "right",
        d: "M1156 758 C1142 775 1123 784 1105 781",
        strokeWidth: 24,
      },
    ];
  }

  return [];
};

const directRegions = (surface: AnatomicalSurface) => {
  const slugMap = SOURCE_SLUG_TO_MUSCLE_KEY[surface];

  return surfaceGeometry[surface].flatMap((geometry) => {
    const muscleKey = slugMap[geometry.sourceSlug];
    if (!muscleKey) return [];

    const id = `${surface}-${geometry.sourceSlug}`;
    return [
      {
        id,
        surface,
        muscleKey,
        label: getMuscleMetadata(muscleKey).label,
        interactionLayer: 1,
        artwork: toShapes(id, geometry.paths, "art"),
        hitAreas: [
          ...supplementalHitShapes(id),
          ...toShapes(id, geometry.paths, "hit"),
        ],
      },
    ];
  });
};

const overlayRegions = (
  REPSYNC_ANATOMY_OVERLAYS as readonly RepSyncAnatomyOverlay[]
)
  .map((overlay) => ({
    id: overlay.id,
    surface: overlay.surface,
    muscleKey: overlay.muscleKey,
    label: getMuscleMetadata(overlay.muscleKey),
    interactionLayer: overlay.interactionLayer,
    artwork: toShapes(overlay.id, overlay.paths, "art"),
    hitAreas: toShapes(overlay.id, overlay.hitPaths ?? overlay.paths, "hit"),
  }))
  .map((overlay) => ({ ...overlay, label: overlay.label.label }));

export const ADAPTED_ANATOMICAL_REGIONS = [
  ...directRegions("front"),
  ...directRegions("back"),
  ...overlayRegions,
] as const satisfies readonly AnatomicalRegionDefinition[];

export const getAnatomicalSurfaceArtwork = (surface: AnatomicalSurface) => {
  const mappedSlugs = SOURCE_SLUG_TO_MUSCLE_KEY[surface];
  return {
    sourceViewBox:
      surface === "front"
        ? VENDORED_MALE_FRONT_VIEW_BOX
        : VENDORED_MALE_BACK_VIEW_BOX,
    viewBox: surface === "front" ? "-40 140 804 1240" : "680 140 804 1240",
    contentTransform:
      surface === "front"
        ? "translate(362 0) scale(1.25 1) translate(-362 0)"
        : "translate(1084 0) scale(1.25 1) translate(-1084 0)",
    outlinePath:
      surface === "front"
        ? VENDORED_MALE_FRONT_OUTLINE_PATH
        : VENDORED_MALE_BACK_OUTLINE_PATH,
    passiveShapes: surfaceGeometry[surface].flatMap((geometry) =>
      mappedSlugs[geometry.sourceSlug]
        ? []
        : toShapes(
            `${surface}-${geometry.sourceSlug}`,
            geometry.paths,
            "passive",
          ),
    ),
  };
};

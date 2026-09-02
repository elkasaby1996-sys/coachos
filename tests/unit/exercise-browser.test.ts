import { describe, expect, it } from "vitest";
import {
  adaptPersistedExerciseBrowserItem,
  adaptProviderExerciseBrowserItem,
  applyExerciseBrowserProviderAnatomyState,
  classifyPersistedExerciseOrigin,
  classifyProviderSavedMatch,
  exerciseBrowserItemMatchesQuery,
  filterExerciseBrowserItems,
  filterExerciseBrowserItemsByProviderFacets,
  getExerciseBrowserProviderAnatomyState,
  groupExerciseBrowserMatches,
  isExerciseBrowserItemUnclassified,
  parseExerciseBrowserSearchParams,
  serializeExerciseBrowserSearchState,
  DEFAULT_EXERCISE_BROWSER_SEARCH_STATE,
  type ExerciseBrowserFilters,
  type ExerciseBrowserItem,
} from "../../src/lib/exercise-browser";
import type {
  PersistentExerciseLibraryRecord,
  ProviderNormalizedExercise,
} from "../../src/lib/exercise-domain";
import { selectProviderTargetMuscle } from "../../src/lib/exercise-provider-anatomy";

const persisted = (
  overrides: Partial<PersistentExerciseLibraryRecord> = {},
): PersistentExerciseLibraryRecord => ({
  id: "saved-1",
  owner_user_id: "owner-1",
  workspace_id: null,
  name: "Saved curl",
  category: null,
  muscle_group: "Arms",
  primary_muscle: "Legacy label",
  secondary_muscles: ["Legacy secondary"],
  body_region_keys: ["arms"],
  primary_muscle_keys: ["biceps"],
  secondary_muscle_keys: ["forearms"],
  muscle_taxonomy_version: 1,
  equipment: "Dumbbell",
  video_url: null,
  instructions: "Stand tall\nCurl slowly",
  notes: "Keep the elbow still",
  cues: null,
  is_unilateral: false,
  tags: ["hypertrophy"],
  created_at: null,
  source: "manual",
  source_exercise_id: null,
  source_payload: null,
  ...overrides,
});

const provider = (
  overrides: Partial<ProviderNormalizedExercise> = {},
): ProviderNormalizedExercise => ({
  id: "provider-1",
  name: "Provider curl",
  bodyPart: "Arms",
  target: "Biceps",
  exerciseType: "Strength",
  secondaryMuscles: ["Forearms"],
  equipment: "Dumbbell",
  instructions: ["Curl under control"],
  exerciseTips: [],
  overview: "A controlled arm movement",
  keywords: ["hypertrophy"],
  videoUrl: null,
  imageUrl: null,
  raw: {
    bodyPart: "upper arms",
    target: "biceps brachii",
    secondaryMuscles: ["brachioradialis"],
  },
  ...overrides,
});

const defaultFilters: ExerciseBrowserFilters = {
  query: "",
  muscleKey: null,
  equipment: null,
  origin: "all",
  classification: "all",
};

const browserItem = (
  overrides: Partial<ExerciseBrowserItem>,
): ExerciseBrowserItem => ({
  key: "persisted:test",
  kind: "persisted",
  exerciseId: "test",
  providerExerciseId: null,
  origin: "custom",
  name: "Test exercise",
  muscleProfile: {
    bodyRegionKeys: [],
    primaryMuscleKeys: [],
    secondaryMuscleKeys: [],
    unmappedLabels: [],
  },
  equipment: null,
  bodyPart: null,
  targetMuscle: null,
  exerciseType: null,
  tags: [],
  instructions: [],
  notes: null,
  videoUrl: null,
  imageUrl: null,
  savedMatch: { status: "exact", exerciseId: "test" },
  ...overrides,
});

describe("exercise browser item adapters", () => {
  it("adapts persisted canonical arrays without parsing legacy anatomy", () => {
    const item = adaptPersistedExerciseBrowserItem(persisted());
    expect(item).toMatchObject({
      key: "persisted:saved-1",
      kind: "persisted",
      origin: "custom",
      exerciseId: "saved-1",
      providerExerciseId: null,
      instructions: ["Stand tall", "Curl slowly"],
      muscleProfile: {
        bodyRegionKeys: ["arms", "forearms"],
        primaryMuscleKeys: ["biceps"],
        secondaryMuscleKeys: ["forearms"],
      },
    });
    expect(item.muscleProfile.unmappedLabels).toEqual([]);
  });

  it("adapts provider records through the canonical provider mapper", () => {
    const item = adaptProviderExerciseBrowserItem(
      provider({ imageUrl: "https://cdn.example/curl.webp" }),
      [],
    );
    expect(item).toMatchObject({
      key: "provider:provider-1",
      kind: "provider",
      origin: "provider",
      exerciseId: null,
      providerExerciseId: "provider-1",
      imageUrl: "https://cdn.example/curl.webp",
      muscleProfile: {
        primaryMuscleKeys: ["biceps"],
        secondaryMuscleKeys: ["forearms"],
      },
      savedMatch: { status: "none" },
    });
  });

  it("preserves saved exercise type and imported anatomy facets", () => {
    const item = adaptPersistedExerciseBrowserItem(
      persisted({
        category: "Conditioning",
        source_payload: {
          bodyPart: "UPPER ARMS",
          target: "BICEPS BRACHII",
        },
      }),
    );
    expect(item).toMatchObject({
      bodyPart: "UPPER ARMS",
      targetMuscle: "BICEPS BRACHII",
      exerciseType: "Conditioning",
    });
  });

  it("classifies custom and imported records from provenance, never ID format", () => {
    expect(
      classifyPersistedExerciseOrigin(
        persisted({ id: "42", source: "manual", source_exercise_id: null }),
      ),
    ).toBe("custom");
    expect(
      classifyPersistedExerciseOrigin(
        persisted({
          id: "uuid-looking-id",
          source: "exercise_dataset",
          source_exercise_id: "42",
        }),
      ),
    ).toBe("imported");
  });

  it("finds exact provider identity before a normalized name conflict", () => {
    const exact = persisted({
      id: "exact-id",
      name: "Different name",
      source: "exercise_dataset",
      source_exercise_id: "provider-1",
    });
    expect(classifyProviderSavedMatch(provider(), [exact])).toEqual({
      status: "exact",
      exerciseId: "exact-id",
    });

    const conflict = persisted({
      id: "conflict-id",
      name: " Provider   Curl ",
    });
    expect(classifyProviderSavedMatch(provider(), [conflict])).toEqual({
      status: "name_conflict",
      exerciseId: "conflict-id",
    });
  });
});

describe("canonical exercise browser filtering", () => {
  it("searches normalized canonical labels and general metadata", () => {
    const item = browserItem({
      name: "Cable raise",
      equipment: "Cable machine",
      tags: ["upper body"],
      muscleProfile: {
        bodyRegionKeys: ["shoulders"],
        primaryMuscleKeys: ["anterior_deltoids"],
        secondaryMuscleKeys: [],
        unmappedLabels: [],
      },
    });
    expect(exerciseBrowserItemMatchesQuery(item, " anterior   deltoids ")).toBe(
      true,
    );
    expect(exerciseBrowserItemMatchesQuery(item, "CABLE MACHINE")).toBe(true);
    expect(exerciseBrowserItemMatchesQuery(item, "hamstrings")).toBe(false);
  });

  it("filters saved exercises by visible anatomy and exercise-type facets", () => {
    const armConditioning = browserItem({
      exerciseType: "Conditioning",
      muscleProfile: {
        bodyRegionKeys: ["arms"],
        primaryMuscleKeys: ["biceps"],
        secondaryMuscleKeys: [],
        unmappedLabels: [],
      },
    });
    const legStrength = browserItem({
      key: "persisted:leg",
      exerciseType: "Strength",
      muscleProfile: {
        bodyRegionKeys: ["upper_legs"],
        primaryMuscleKeys: ["quadriceps"],
        secondaryMuscleKeys: [],
        unmappedLabels: [],
      },
    });

    expect(
      filterExerciseBrowserItemsByProviderFacets(
        [armConditioning, legStrength],
        {
          bodyPart: "UPPER ARMS",
          target: "BICEPS BRACHII",
          exerciseType: "conditioning",
        },
      ).map(({ key }) => key),
    ).toEqual(["persisted:test"]);
  });

  it("ranks primary, secondary, region, and full-body fallback deterministically", () => {
    const items = [
      browserItem({
        key: "persisted:region",
        name: "Zulu region",
        muscleProfile: {
          bodyRegionKeys: ["arms"],
          primaryMuscleKeys: [],
          secondaryMuscleKeys: [],
          unmappedLabels: [],
        },
      }),
      browserItem({
        key: "persisted:secondary",
        name: "Beta secondary",
        muscleProfile: {
          bodyRegionKeys: ["arms"],
          primaryMuscleKeys: [],
          secondaryMuscleKeys: ["biceps"],
          unmappedLabels: [],
        },
      }),
      browserItem({
        key: "persisted:primary-z",
        name: "Zulu primary",
        muscleProfile: {
          bodyRegionKeys: ["arms"],
          primaryMuscleKeys: ["biceps"],
          secondaryMuscleKeys: [],
          unmappedLabels: [],
        },
      }),
      browserItem({
        key: "persisted:primary-a",
        name: "Alpha primary",
        muscleProfile: {
          bodyRegionKeys: ["arms"],
          primaryMuscleKeys: ["biceps"],
          secondaryMuscleKeys: [],
          unmappedLabels: [],
        },
      }),
      browserItem({
        key: "persisted:full-body",
        name: "Alpha fallback",
        muscleProfile: {
          bodyRegionKeys: ["full_body"],
          primaryMuscleKeys: [],
          secondaryMuscleKeys: [],
          unmappedLabels: [],
        },
      }),
    ];

    const result = filterExerciseBrowserItems(items, {
      ...defaultFilters,
      muscleKey: "biceps",
    });
    expect(
      result.map(({ key, matchRank, matchReason }) => [
        key,
        matchRank,
        matchReason,
      ]),
    ).toEqual([
      ["persisted:primary-a", 3, "primary"],
      ["persisted:primary-z", 3, "primary"],
      ["persisted:secondary", 2, "secondary"],
      ["persisted:full-body", 1, "region"],
      ["persisted:region", 1, "region"],
    ]);
  });

  it("applies equivalent muscle semantics to custom and provider items", () => {
    const custom = adaptPersistedExerciseBrowserItem(persisted());
    const transient = adaptProviderExerciseBrowserItem(provider(), []);
    const result = filterExerciseBrowserItems([custom, transient], {
      ...defaultFilters,
      muscleKey: "biceps",
    });
    expect(result).toHaveLength(2);
    expect(result.every(({ matchRank }) => matchRank === 3)).toBe(true);
  });

  it("groups primary and secondary separately from region and full-body fallbacks", () => {
    const items = filterExerciseBrowserItems(
      [
        browserItem({
          key: "persisted:primary",
          muscleProfile: {
            bodyRegionKeys: ["arms"],
            primaryMuscleKeys: ["biceps"],
            secondaryMuscleKeys: [],
            unmappedLabels: [],
          },
        }),
        browserItem({
          key: "persisted:secondary",
          muscleProfile: {
            bodyRegionKeys: ["arms"],
            primaryMuscleKeys: [],
            secondaryMuscleKeys: ["biceps"],
            unmappedLabels: [],
          },
        }),
        browserItem({
          key: "persisted:region",
          muscleProfile: {
            bodyRegionKeys: ["arms"],
            primaryMuscleKeys: [],
            secondaryMuscleKeys: [],
            unmappedLabels: [],
          },
        }),
        browserItem({
          key: "persisted:full-body",
          muscleProfile: {
            bodyRegionKeys: ["full_body"],
            primaryMuscleKeys: [],
            secondaryMuscleKeys: [],
            unmappedLabels: [],
          },
        }),
      ],
      { ...defaultFilters, muscleKey: "biceps" },
    );

    const groups = groupExerciseBrowserMatches(items, "biceps");
    expect(groups.directMatches.map(({ key }) => key)).toEqual([
      "persisted:primary",
      "persisted:secondary",
    ]);
    expect(groups.relatedExercises.map(({ key }) => key)).toEqual([
      "persisted:full-body",
      "persisted:region",
    ]);
    expect(
      groups.relatedExercises.every(({ matchRank }) => matchRank === 1),
    ).toBe(true);
  });

  it("detects unclassified items and filters by source", () => {
    const unclassifiedCustom = browserItem({
      key: "persisted:custom",
      origin: "custom",
    });
    const imported = browserItem({
      key: "persisted:imported",
      origin: "imported",
      muscleProfile: {
        bodyRegionKeys: ["back"],
        primaryMuscleKeys: [],
        secondaryMuscleKeys: [],
        unmappedLabels: [],
      },
    });
    expect(isExerciseBrowserItemUnclassified(unclassifiedCustom)).toBe(true);
    expect(
      filterExerciseBrowserItems([unclassifiedCustom, imported], {
        ...defaultFilters,
        origin: "custom",
        classification: "unclassified",
      }).map(({ key }) => key),
    ).toEqual(["persisted:custom"]);
  });
});

describe("exercise browser URL state", () => {
  it("uses a provider-derived canonical muscle to filter custom exercises", () => {
    const synchronized = applyExerciseBrowserProviderAnatomyState(
      DEFAULT_EXERCISE_BROWSER_SEARCH_STATE,
      selectProviderTargetMuscle(
        getExerciseBrowserProviderAnatomyState(
          DEFAULT_EXERCISE_BROWSER_SEARCH_STATE,
        ),
        "QUADRICEPS",
      ),
    );
    const items = [
      adaptPersistedExerciseBrowserItem(
        persisted({
          id: "quad",
          primary_muscle_keys: ["quadriceps"],
          body_region_keys: ["upper_legs"],
        }),
      ),
      adaptPersistedExerciseBrowserItem(persisted({ id: "biceps" })),
    ];

    expect(synchronized.filters.muscleKey).toBe("quadriceps");
    expect(
      filterExerciseBrowserItems(items, synchronized.filters).map(
        ({ exerciseId }) => exerciseId,
      ),
    ).toEqual(["quad"]);
  });

  it("rejects invalid muscles and resolves muscle/unclassified conflicts", () => {
    expect(
      parseExerciseBrowserSearchParams(
        new URLSearchParams("muscle=svg-path-12&classification=unclassified"),
      ).filters,
    ).toMatchObject({ muscleKey: null, classification: "unclassified" });
    expect(
      parseExerciseBrowserSearchParams(
        new URLSearchParams("muscle=biceps&classification=unclassified"),
      ).filters,
    ).toMatchObject({ muscleKey: "biceps", classification: "all" });
  });

  it("serializes canonical non-default filters and round-trips them", () => {
    const state = {
      view: "provider" as const,
      filters: {
        query: " squat ",
        muscleKey: "quadriceps" as const,
        equipment: " BARBELL ",
        origin: "imported" as const,
        classification: "classified" as const,
      },
      providerFilters: {
        bodyPart: " CHEST ",
        target: " QUADRICEPS ",
        exerciseType: " STRENGTH ",
        anatomySource: "provider_target" as const,
        bodyPartProvenance: "manual" as const,
        targetProvenance: "manual" as const,
        muscleProvenance: "derived" as const,
      },
    };
    const params = serializeExerciseBrowserSearchState(state);
    expect(params.toString()).toBe(
      "view=provider&q=squat&muscle=quadriceps&equipment=BARBELL&origin=imported&classification=classified&bodyPart=CHEST&target=QUADRICEPS&exerciseType=STRENGTH&anatomySource=provider_target&bodyPartMode=manual&targetMode=manual&muscleMode=derived",
    );
    expect(parseExerciseBrowserSearchParams(params)).toEqual({
      ...state,
      filters: { ...state.filters, query: "squat", equipment: "BARBELL" },
      providerFilters: {
        bodyPart: "CHEST",
        target: "QUADRICEPS",
        exerciseType: "STRENGTH",
        anatomySource: "provider_target",
        bodyPartProvenance: "manual",
        targetProvenance: "manual",
        muscleProvenance: "derived",
      },
    });
    expect(
      serializeExerciseBrowserSearchState({
        view: "library",
        filters: defaultFilters,
        providerFilters: {
          bodyPart: null,
          target: null,
          exerciseType: null,
          anatomySource: null,
          bodyPartProvenance: null,
          targetProvenance: null,
          muscleProvenance: null,
        },
      }).toString(),
    ).toBe("");
  });
});

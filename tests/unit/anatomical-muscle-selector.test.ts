import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ANATOMICAL_REGION_DEFINITIONS,
  ANATOMY_SURFACES,
  SELECTABLE_ANATOMY_MUSCLE_KEYS,
  getAnatomicalRegionsForSurface,
} from "../../src/components/pt/anatomical-muscle-selector/anatomy-registry";
import {
  SOURCE_SLUG_TO_MUSCLE_KEY,
  VENDORED_ARTWORK_REGIONS,
} from "../../src/components/pt/anatomical-muscle-selector/artwork/artwork-adapter";
import { REPSYNC_ANATOMY_OVERLAYS } from "../../src/components/pt/anatomical-muscle-selector/artwork/repsync-anatomy-overlays";
import {
  MUSCLE_KEYS,
  isMuscleKey,
} from "../../src/lib/exercise-muscle-taxonomy";

const requiredFront = [
  "pectorals",
  "anterior_deltoids",
  "lateral_deltoids",
  "biceps",
  "forearms",
  "rectus_abdominis",
  "obliques",
  "hip_flexors",
  "hip_abductors",
  "quadriceps",
  "adductors",
  "tibialis_anterior",
] as const;

const requiredBack = [
  "posterior_deltoids",
  "lateral_deltoids",
  "triceps",
  "forearms",
  "trapezius",
  "latissimus_dorsi",
  "rhomboids",
  "spinal_erectors",
  "gluteals",
  "hip_abductors",
  "hamstrings",
  "calves",
] as const;

const readSource = (...segments: string[]) =>
  readFileSync(resolve(process.cwd(), ...segments), "utf8");

describe("premium anatomy presentation mapping", () => {
  it("maps the direct upstream slugs through an explicit canonical adapter", () => {
    expect(SOURCE_SLUG_TO_MUSCLE_KEY).toEqual({
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
    });
  });

  it("keeps decorative and base artwork non-selectable", () => {
    const passive = VENDORED_ARTWORK_REGIONS.filter(
      ({ role }) => role !== "muscle",
    );
    const selectable = VENDORED_ARTWORK_REGIONS.filter(
      ({ role }) => role === "muscle",
    );

    expect(passive.length).toBeGreaterThan(0);
    expect(passive.every(({ muscleKey }) => muscleKey === null)).toBe(true);
    expect(selectable.every(({ muscleKey }) => isMuscleKey(muscleKey))).toBe(
      true,
    );
  });

  it("keeps broad source regions passive and refined canonical regions distinct", () => {
    for (const sourceSlug of ["deltoids", "upper-back", "lower-back"]) {
      const broadRegions = VENDORED_ARTWORK_REGIONS.filter(
        (region) => region.sourceSlug === sourceSlug,
      );
      expect(broadRegions.length).toBeGreaterThan(0);
      expect(broadRegions.every(({ role }) => role === "decorative")).toBe(
        true,
      );
    }

    const distinctKeys = new Set(
      ANATOMICAL_REGION_DEFINITIONS.map(({ muscleKey }) => muscleKey),
    );
    expect(distinctKeys.size).toBe(MUSCLE_KEYS.length);
    for (const key of [
      "anterior_deltoids",
      "lateral_deltoids",
      "posterior_deltoids",
      "latissimus_dorsi",
      "rhomboids",
      "spinal_erectors",
      "hip_flexors",
      "hip_abductors",
    ] as const) {
      expect(distinctKeys.has(key)).toBe(true);
    }
  });

  it("uses unique private IDs for regions, artwork, and hit areas", () => {
    const regionIds = ANATOMICAL_REGION_DEFINITIONS.map(({ id }) => id);
    const artworkIds = ANATOMICAL_REGION_DEFINITIONS.flatMap(({ artwork }) =>
      artwork.map(({ id }) => id),
    );
    const hitAreaIds = ANATOMICAL_REGION_DEFINITIONS.flatMap(({ hitAreas }) =>
      hitAreas.map(({ id }) => id),
    );
    const allIds = [...regionIds, ...artworkIds, ...hitAreaIds];

    expect(new Set(regionIds).size).toBe(regionIds.length);
    expect(new Set(artworkIds).size).toBe(artworkIds.length);
    expect(new Set(hitAreaIds).size).toBe(hitAreaIds.length);
    expect(new Set(allIds).size).toBe(allIds.length);
  });

  it("maps every private hit region to a valid canonical muscle", () => {
    for (const definition of ANATOMICAL_REGION_DEFINITIONS) {
      expect(isMuscleKey(definition.muscleKey)).toBe(true);
      expect(ANATOMY_SURFACES).toContain(definition.surface);
      expect(definition.label).toBeTruthy();
      expect(definition.hitAreas.length).toBeGreaterThan(0);
      expect(definition.hitAreas.every(({ id }) => id.startsWith("hit-"))).toBe(
        true,
      );
    }
  });

  it("keeps visible artwork and transparent hit definitions separate", () => {
    for (const definition of ANATOMICAL_REGION_DEFINITIONS) {
      const artworkIds = new Set(definition.artwork.map(({ id }) => id));
      const hitIds = definition.hitAreas.map(({ id }) => id);
      expect(definition.artwork.length).toBeGreaterThan(0);
      expect(definition.artwork.every(({ id }) => id.startsWith("art-"))).toBe(
        true,
      );
      expect(hitIds.every((id) => !artworkIds.has(id))).toBe(true);
    }
  });

  it("represents every required front and back muscle", () => {
    const front = getAnatomicalRegionsForSurface("front").map(
      ({ muscleKey }) => muscleKey,
    );
    const back = getAnatomicalRegionsForSurface("back").map(
      ({ muscleKey }) => muscleKey,
    );

    expect(front).toEqual(expect.arrayContaining(requiredFront));
    expect(back).toEqual(expect.arrayContaining(requiredBack));
  });

  it("makes every canonical muscle available in the equivalent list contract", () => {
    expect(SELECTABLE_ANATOMY_MUSCLE_KEYS).toEqual(
      expect.arrayContaining(MUSCLE_KEYS),
    );
    expect(new Set(SELECTABLE_ANATOMY_MUSCLE_KEYS).size).toBe(
      MUSCLE_KEYS.length,
    );
  });

  it("maps left and right artwork and hit areas to the same MuscleKey", () => {
    for (const definition of ANATOMICAL_REGION_DEFINITIONS) {
      for (const shapes of [definition.artwork, definition.hitAreas]) {
        const sides = new Set(shapes.map(({ side }) => side));
        if (!sides.has("left") && !sides.has("right")) continue;
        expect(sides.has("left")).toBe(true);
        expect(sides.has("right")).toBe(true);
      }
      expect(isMuscleKey(definition.muscleKey)).toBe(true);
    }
  });

  it("keeps provider and legacy vocabulary out of the presentation registry", () => {
    const source = readSource(
      "src",
      "components",
      "pt",
      "anatomical-muscle-selector",
      "anatomy-registry.ts",
    );
    expect(source).not.toMatch(/provider|legacy|bodyPart|targetMuscles/i);
  });
});

describe("controlled anatomical selector source contract", () => {
  const selectorSource = readSource(
    "src",
    "components",
    "pt",
    "anatomical-muscle-selector",
    "anatomical-muscle-selector.tsx",
  );
  const figureSource = readSource(
    "src",
    "components",
    "pt",
    "anatomical-muscle-selector",
    "anatomical-figure.tsx",
  );
  const listSource = readSource(
    "src",
    "components",
    "pt",
    "anatomical-muscle-selector",
    "accessible-muscle-list.tsx",
  );
  const styles = readSource(
    "src",
    "components",
    "pt",
    "anatomical-muscle-selector",
    "anatomical-muscle-selector.css",
  );
  const adapterSource = readSource(
    "src",
    "components",
    "pt",
    "anatomical-muscle-selector",
    "artwork",
    "artwork-adapter.ts",
  );
  const browserSource = readSource(
    "src",
    "components",
    "pt",
    "exercise-library",
    "exercise-library-browser.tsx",
  );
  const messageComposeSource = readSource(
    "src",
    "components",
    "pt",
    "pt-message-compose.tsx",
  );
  const componentSource = `${selectorSource}\n${figureSource}\n${listSource}\n${adapterSource}`;

  it("publishes the exact locked controlled API without mirrored value state", () => {
    expect(selectorSource).toContain("value: MuscleKey | null");
    expect(selectorSource).toContain(
      "onValueChange: (value: MuscleKey | null) => void",
    );
    expect(selectorSource).toContain("disabled?: boolean");
    expect(selectorSource).toContain("className?: string");
    expect(selectorSource).not.toMatch(/useState<MuscleKey/);
    expect(figureSource).toContain("selected={value === definition.muscleKey}");
    expect(listSource).toContain("const selected = value === muscle.key");
  });

  it("emits only MuscleKey values from map and list, and null from Clear", () => {
    expect(figureSource).toContain("onValueChange(definition.muscleKey)");
    expect(figureSource).not.toContain("onValueChange(definition.id)");
    expect(figureSource).not.toContain("id={shape.id}");
    expect(listSource).toContain("onValueChange(muscle.key)");
    expect(selectorSource).toContain("onValueChange(null)");
  });

  it("uses one anatomy surface at a time and preserves controlled selection", () => {
    expect(selectorSource.match(/<AnatomicalFigure/g)).toHaveLength(1);
    expect(selectorSource).toContain("surface={activeSurface}");
    expect(selectorSource).toContain("setActiveSurface(surface)");
    expect(selectorSource).not.toMatch(
      /setActiveSurface\([^)]*\)[\s\S]{0,80}onValueChange/,
    );
  });

  it("uses a common guarded activation path for pointer and keyboard input", () => {
    expect(figureSource).toContain("onClick={activate}");
    expect(figureSource).toContain("activate();");
    expect(figureSource).toContain('event.key !== "Enter"');
    expect(figureSource).toContain('event.key !== " "');
    expect(figureSource).toContain(
      "if (!disabled) onValueChange(definition.muscleKey)",
    );
  });

  it("guards all public selection callbacks while disabled", () => {
    expect(selectorSource).toContain("if (!disabled) onValueChange(muscleKey)");
    expect(figureSource).toContain("if (!disabled) onActivate(definition)");
    expect(listSource).toContain("disabled={disabled}");
    expect(selectorSource).toContain("disabled={disabled}");
  });

  it("keeps map and grouped list synchronized", () => {
    expect(selectorSource).toContain("value={value}");
    expect(selectorSource).toContain("value={value}");
    expect(listSource).toContain("BODY_REGIONS.map");
    expect(listSource).toContain("MUSCLES.filter");
    expect(selectorSource).toContain("selectedMuscle.label");
  });

  it("presents muscle subgroups as keyboard-native disclosures", () => {
    expect(listSource).toContain("<details");
    expect(listSource).toContain("<summary");
    expect(listSource).toContain("group-open:rotate-180");
    expect(listSource).toContain("aria-labelledby={groupLabelId}");
    expect(listSource).toContain("selectedMuscle?.label");
  });

  it("keeps inactive map/list content out of the active tabs view", () => {
    expect(selectorSource).toContain('<TabsContent value="map"');
    expect(selectorSource).toContain('<TabsContent value="list"');
    expect(selectorSource).not.toContain("forceMount");
  });

  it("exposes pressed state, disabled state, and a polite announcement", () => {
    expect(figureSource).toContain("aria-pressed={selected}");
    expect(figureSource).toContain("aria-disabled={disabled || undefined}");
    expect(listSource).toContain("aria-pressed={selected}");
    expect(selectorSource).toContain('aria-live="polite"');
    expect(selectorSource).toContain('aria-label="Anatomical muscle selector"');
  });

  it("uses outline and text indicators in addition to selected color", () => {
    expect(styles).toContain(
      '.anatomy-art-muscle[data-selected="true"] .anatomy-art-shape',
    );
    expect(styles).toContain("stroke: var(--anatomy-selected-outline)");
    expect(styles).toContain("stroke-width: 1.35");
    expect(selectorSource).not.toContain("anatomy-selection-summary");
    expect(listSource).toContain("Selected");
  });

  it("uses selector-local theme tokens without a selected glow", () => {
    for (const token of [
      "--anatomy-canvas-surface",
      "--anatomy-body-fill",
      "--anatomy-passive-fill",
      "--anatomy-passive-seam",
      "--anatomy-hover-fill",
      "--anatomy-hover-outline",
      "--anatomy-focus-outline",
      "--anatomy-selected-fill",
      "--anatomy-selected-outline",
      "--anatomy-disabled-fill",
    ]) {
      expect(styles).toContain(token);
    }

    const selectedRule = styles.slice(
      styles.indexOf(
        '.anatomy-art-muscle[data-selected="true"] .anatomy-art-shape',
      ),
      styles.indexOf(
        '.anatomy-art-muscle[data-interaction="focus"] .anatomy-art-shape',
      ),
    );
    expect(selectedRule).not.toContain("filter:");
  });

  it("removes redundant canvas copy while retaining accessible figure naming", () => {
    expect(selectorSource).not.toContain("Select a muscle");
    expect(selectorSource).not.toContain("{activeSurface} view");
    expect(selectorSource).toContain("{activeSurface} anatomical muscle map");
    expect(selectorSource).toContain('className="sr-only"');
    expect(figureSource).toContain("aria-labelledby={labelledBy}");
    expect(selectorSource).not.toContain("anatomy-selection-summary");
    expect(selectorSource).not.toContain("min-h-14");
  });

  it("reframes artwork and hit regions through one shared transform", () => {
    expect(adapterSource).toContain("scale(1.25 1)");
    expect(adapterSource).toContain('viewBox: surface === "front"');
    expect(figureSource).toContain('className="anatomy-content-layer"');
    expect(figureSource).toContain("transform={artwork.contentTransform}");
    expect(figureSource.indexOf("<BaseSilhouette")).toBeLessThan(
      figureSource.indexOf('className="anatomy-hit-layer"'),
    );
  });

  it("keeps refined hip artwork smaller than its transparent hit geometry", () => {
    for (const id of [
      "front-hip-flexors",
      "front-hip-abductors",
      "back-hip-abductors",
    ]) {
      const overlay = REPSYNC_ANATOMY_OVERLAYS.find(
        (candidate) => candidate.id === id,
      );
      expect(overlay?.hitPaths).toBeDefined();
      expect(overlay?.hitPaths?.left?.[0]).not.toBe(overlay?.paths.left?.[0]);
      expect(overlay?.hitPaths?.right?.[0]).not.toBe(overlay?.paths.right?.[0]);
    }
  });

  it("keeps the mobile support launcher clear of an expanded filter panel", () => {
    expect(browserSource).toContain("exercise-library-mobile-filters");
    expect(messageComposeSource).toContain(
      'data-pt-message-compose-launcher-container="true"',
    );
    expect(styles).toContain(
      "body:has(.exercise-library-mobile-filters[open])",
    );
  });

  it("keeps visible artwork passive and transparent hit areas interactive", () => {
    expect(styles).toContain(".anatomy-base-layer,");
    expect(styles).toContain("pointer-events: none");
    expect(styles).toContain(".anatomy-hit-area");
    expect(styles).toContain("fill: transparent");
    expect(figureSource).toContain('className="anatomy-art-layer"');
    expect(figureSource).toContain('className="anatomy-hit-layer"');
  });

  it("contains no provider or Supabase dependency", () => {
    expect(componentSource).not.toMatch(/supabase|exercise-muscle-mapping/i);
    expect(componentSource).not.toMatch(
      /from ["']react-muscle-highlighter["']/,
    );
  });
});

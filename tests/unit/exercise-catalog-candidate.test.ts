import { describe, expect, it } from "vitest";
import {
  boundExerciseCatalogSourceMetadata,
  mapExerciseCatalogRecord,
  type ExerciseCatalogSourceContract,
} from "../../src/lib/exercise-catalog-candidate";

const contract: ExerciseCatalogSourceContract = {
  source: "fixture_catalog",
  sourceVersion: "fixture-v1",
  fields: {
    id: "identity.key",
    name: "label",
    bodyRegions: "regions",
    primaryMuscles: "muscles.primary",
    secondaryMuscles: "muscles.secondary",
    equipment: "equipment",
    instructions: "steps",
    description: "summary",
    difficulty: "difficulty",
    category: "category",
  },
  media: {
    items: "assets",
    sourcePath: "file",
    kind: "type",
    resolution: "size",
  },
  relationships: {
    similar: "links.similar",
    substitutions: "links.substitutions",
    progressions: "links.progressions",
    regressions: "links.regressions",
  },
};

const fixture = () => ({
  identity: { key: "movement-1" },
  label: "Fixture Press",
  regions: ["upper body"],
  muscles: {
    primary: ["primary-a", "primary-b"],
    secondary: ["secondary-a"],
  },
  equipment: ["fixture bar", "fixture bench"],
  steps: ["Set the start position.", "Complete one controlled repetition."],
  summary: "Short synthetic fixture description.",
  difficulty: "fixture-level",
  category: "fixture-category",
  assets: [
    { file: "media/movement-1/360.gif", type: "gif", size: "360p" },
    {
      file: "media/movement-1/720.mp4",
      type: "video",
      size: "720p",
    },
  ],
  links: {
    similar: ["movement-2", 3],
    substitutions: "movement-4",
    progressions: ["movement-5"],
    regressions: [],
  },
  futureVendorField: { retainedForAudit: true },
});

describe("exercise catalog candidate mapper", () => {
  it("maps string IDs, arrays, relationships, and multiple media resolutions", () => {
    const result = mapExerciseCatalogRecord(fixture(), contract);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toMatchObject({
      source: "fixture_catalog",
      sourceExerciseId: "movement-1",
      sourceVersion: "fixture-v1",
      name: "Fixture Press",
      bodyRegions: ["upper body"],
      primaryMuscles: ["primary-a", "primary-b"],
      secondaryMuscles: ["secondary-a"],
      equipment: ["fixture bar", "fixture bench"],
      instructions: [
        "Set the start position.",
        "Complete one controlled repetition.",
      ],
      relationships: {
        similar: ["movement-2", "3"],
        substitutions: ["movement-4"],
        progressions: ["movement-5"],
        regressions: [],
      },
    });
    expect(result.value.media).toEqual([
      {
        kind: "gif",
        resolution: "360p",
        sourcePath: "media/movement-1/360.gif",
      },
      {
        kind: "video",
        resolution: "720p",
        sourcePath: "media/movement-1/720.mp4",
      },
    ]);
    expect(result.value.sourceMetadata.futureVendorField).toEqual({
      retainedForAudit: true,
    });
  });

  it("normalizes a finite numeric ID without assuming a vendor ID type", () => {
    const record = fixture();
    record.identity.key = 42 as unknown as string;
    const result = mapExerciseCatalogRecord(record, contract);

    expect(result.ok && result.value.sourceExerciseId).toBe("42");
  });

  it("rejects missing and invalid IDs explicitly", () => {
    const missing = fixture() as Partial<ReturnType<typeof fixture>>;
    delete missing.identity;

    expect(mapExerciseCatalogRecord(missing, contract)).toMatchObject({
      ok: false,
      error: { code: "missing_id" },
    });
    expect(
      mapExerciseCatalogRecord(
        { ...fixture(), identity: { key: Number.POSITIVE_INFINITY } },
        contract,
      ),
    ).toMatchObject({ ok: false, error: { code: "invalid_id" } });
  });

  it("rejects missing and blank names explicitly", () => {
    const missing = fixture() as Partial<ReturnType<typeof fixture>>;
    delete missing.label;

    expect(mapExerciseCatalogRecord(missing, contract)).toMatchObject({
      ok: false,
      error: { code: "missing_name" },
    });
    expect(
      mapExerciseCatalogRecord({ ...fixture(), label: "   " }, contract),
    ).toMatchObject({ ok: false, error: { code: "invalid_name" } });
  });

  it("preserves one primary muscle as an array and normalizes scalar instructions", () => {
    const result = mapExerciseCatalogRecord(
      {
        identity: { key: "movement-2" },
        label: "Fixture Row",
        muscles: { primary: "primary-a" },
        steps: "Complete one controlled repetition.",
      },
      contract,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.primaryMuscles).toEqual(["primary-a"]);
    expect(result.value.instructions).toEqual([
      "Complete one controlled repetition.",
    ]);
    expect(result.value.secondaryMuscles).toEqual([]);
    expect(result.value.equipment).toEqual([]);
    expect(result.value.description).toBeNull();
    expect(result.value.difficulty).toBeNull();
    expect(result.value.category).toBeNull();
  });

  it("drops malformed media references without uploading or rewriting them", () => {
    const result = mapExerciseCatalogRecord(
      {
        ...fixture(),
        assets: [
          { file: "../licensed/source.gif", type: "gif", size: "360p" },
          { file: "data:text/plain,unsafe", type: "image" },
          { file: "media/movement-1/unknown.bin", type: "unknown" },
          { file: "media\\movement-1\\still.webp", type: "image" },
        ],
      },
      contract,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.media).toEqual([
      {
        kind: "image",
        resolution: null,
        sourcePath: "media/movement-1/still.webp",
      },
    ]);
  });

  it("bounds retained source metadata and marks truncation", () => {
    const metadata = boundExerciseCatalogSourceMetadata(
      {
        id: "movement-1",
        unknownLargeField: "x".repeat(2_000),
      },
      80,
    );

    expect(metadata).toMatchObject({ id: "movement-1", _truncated: true });
    expect(
      new TextEncoder().encode(JSON.stringify(metadata)).byteLength,
    ).toBeLessThanOrEqual(80);
  });
});

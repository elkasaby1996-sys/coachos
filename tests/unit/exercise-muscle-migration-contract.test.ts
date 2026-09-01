import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(
    process.cwd(),
    "supabase",
    "migrations",
    "20260830120000_exercise_canonical_muscle_taxonomy.sql",
  ),
  "utf8",
).replace(/\r\n/g, "\n");
const muscleFunction = migration.slice(
  migration.indexOf("function public.exercise_canonical_muscle_key"),
  migration.indexOf("function public.exercise_canonical_body_region_key"),
);
const bodyRegionFunction = migration.slice(
  migration.indexOf("function public.exercise_canonical_body_region_key"),
  migration.indexOf("function public.exercise_canonical_region_for_muscle_key"),
);
const settingsSource = readFileSync(
  join(process.cwd(), "src", "pages", "pt", "settings-exercises.tsx"),
  "utf8",
);
const builderSource = readFileSync(
  join(process.cwd(), "src", "pages", "pt", "workout-template-builder.tsx"),
  "utf8",
);
const importMapperSource = readFileSync(
  join(process.cwd(), "src", "lib", "exercise-import.ts"),
  "utf8",
);

describe("canonical exercise muscle migration contract", () => {
  it("adds canonical arrays and a smallint taxonomy version", () => {
    for (const field of [
      "body_region_keys",
      "primary_muscle_keys",
      "secondary_muscle_keys",
    ]) {
      expect(migration).toContain(
        `add column if not exists ${field} text[] not null default '{}'::text[]`,
      );
    }
    expect(migration).toContain(
      "add column if not exists muscle_taxonomy_version smallint not null default 1",
    );
  });

  it("checks approved keys and prevents primary-secondary overlap", () => {
    expect(migration).toContain("body_region_keys <@ array[");
    expect(migration).toContain("primary_muscle_keys <@ array[");
    expect(migration).toContain("secondary_muscle_keys <@ array[");
    expect(migration).toContain(
      "not (primary_muscle_keys && secondary_muscle_keys)",
    );
    expect(migration).toContain("'hip_abductors'");
  });

  it("adds GIN indexes that can combine with the existing owner index", () => {
    expect(migration).toContain("using gin (body_region_keys)");
    expect(migration).toContain("using gin (primary_muscle_keys)");
    expect(migration).toContain("using gin (secondary_muscle_keys)");
    expect(migration).toContain("existing owner_user_id B-tree index");
  });

  it("keeps legacy fields, UUIDs, and provenance untouched", () => {
    for (const field of [
      "muscle_group",
      "primary_muscle",
      "secondary_muscles",
      "category",
      "source",
      "source_exercise_id",
      "source_payload",
    ]) {
      expect(migration).not.toMatch(
        new RegExp(`drop\\s+column(?:\\s+if\\s+exists)?\\s+${field}`, "i"),
      );
    }
    expect(migration).not.toMatch(/set\s+id\s*=/i);
  });

  it("keeps unsafe labels out of specific-muscle backfill", () => {
    expect(muscleFunction).toContain("else null");
    for (const label of [
      "bodyweight",
      "body weight",
      "cardio",
      "arms",
      "legs",
      "back",
    ]) {
      expect(muscleFunction).not.toContain(`when '${label}'`);
    }
  });

  it("allows broad Back and Arms only as regions and leaves Legs/Cardio unknown", () => {
    expect(bodyRegionFunction).toContain("when 'back' then 'back'");
    expect(bodyRegionFunction).toContain("when 'arms' then 'arms'");
    expect(bodyRegionFunction).not.toContain("when 'legs'");
    expect(bodyRegionFunction).not.toContain("when 'cardio'");
    expect(bodyRegionFunction).not.toContain("when 'full body'");
    expect(bodyRegionFunction).toContain(
      "current provider historically\n    -- collapsed Cardio",
    );
  });

  it("backfills arrays and removes primary keys from secondary keys", () => {
    expect(migration).toContain("mapped.primary_keys");
    expect(migration).toContain("mapped.secondary_keys");
    expect(migration).toContain("mapped.body_region_keys");
    expect(migration).toContain(
      "where not (secondary_key = any(mapped.primary_keys))",
    );
  });

  it("persists one shared canonical payload in both provider import paths", () => {
    expect(importMapperSource).toContain(
      "...buildCurrentProviderCanonicalMuscleFields(exercise)",
    );
    expect(settingsSource).toContain(
      "buildCurrentProviderExerciseInsertPayload(",
    );
    expect(builderSource).toContain(
      "buildCurrentProviderExerciseInsertPayload(",
    );
  });

  it("does not clear canonical arrays during an existing library edit", () => {
    const editPayload = settingsSource.slice(
      settingsSource.indexOf("const payload = {"),
      settingsSource.indexOf("const response = selected"),
    );
    expect(editPayload).not.toContain("body_region_keys");
    expect(editPayload).not.toContain("primary_muscle_keys");
    expect(editPayload).not.toContain("secondary_muscle_keys");
  });
});

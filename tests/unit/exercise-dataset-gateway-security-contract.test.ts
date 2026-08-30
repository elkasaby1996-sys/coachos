import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const readSource = (...segments: string[]) =>
  readFileSync(join(process.cwd(), ...segments), "utf8");

const readTree = (directory: string): string =>
  readdirSync(directory)
    .map((entry) => join(directory, entry))
    .map((path) =>
      statSync(path).isDirectory()
        ? readTree(path)
        : readFileSync(path, "utf8"),
    )
    .join("\n");

describe("exercise dataset gateway security wiring", () => {
  const service = readSource("src", "lib", "exercise-dataset.ts");
  const edgeFunction = readSource(
    "supabase",
    "functions",
    "exercise-dataset-search",
    "index.ts",
  );
  const edgeHelper = readSource(
    "supabase",
    "functions",
    "_shared",
    "exercise-dataset-gateway.ts",
  );

  it("verifies the session and existing PT access evidence server-side", () => {
    expect(edgeFunction).toContain("supabase.auth.getUser(accessToken)");
    expect(edgeFunction).toContain('role?.startsWith("pt_")');
    expect(edgeFunction).toContain('.from("workspaces")');
    expect(edgeFunction).toContain('.from("pt_hub_profiles")');
    expect(edgeFunction).toContain('.from("pt_profiles")');
  });

  it("keeps provider configuration and direct requests out of frontend source", () => {
    const frontendSource = readTree(join(process.cwd(), "src"));
    expect(frontendSource).not.toContain("VITE_EXERCISE_DATASET");
    expect(service).toContain("supabase.functions.invoke");
    expect(service).toContain('"exercise-dataset-search"');
    expect(service).not.toContain("fetch(");
    expect(readSource("src", "vite-env.d.ts")).not.toContain(
      "VITE_EXERCISE_DATASET",
    );
    expect(readSource(".env.local.example")).not.toContain(
      "VITE_EXERCISE_DATASET",
    );
  });

  it("bounds upstream calls and returns stable safe errors", () => {
    expect(edgeHelper).toContain("EXERCISE_DATASET_MAX_LIMIT = 50");
    expect(edgeHelper).toContain(
      "EXERCISE_DATASET_PROVIDER_TIMEOUT_MS = 10_000",
    );
    expect(edgeHelper).toContain("new AbortController()");
    expect(edgeHelper).toContain('"provider_rate_limited"');
    expect(edgeHelper).toContain('"provider_timeout"');
    expect(edgeHelper).not.toContain("console.error");
  });

  it("keeps saved/custom results independent when provider loading fails", () => {
    const settings = readSource("src", "pages", "pt", "settings-exercises.tsx");
    const builder = readSource(
      "src",
      "pages",
      "pt",
      "workout-template-builder.tsx",
    );

    expect(settings).toContain("filteredExercises.map((exercise)");
    expect(settings).toMatch(
      /filteredExercises\.length > 0 \|\|\s+visibleDatasetResults\.length > 0/,
    );
    expect(builder).toMatch(
      /filteredExercises\.length > 0 \|\|\s+datasetExercises\.length > 0/,
    );
    expect(settings).toContain(
      "setDatasetError(`${details.code}: ${details.message}`)",
    );
    expect(builder).toContain(
      "setDatasetSearchError(`${details.code}: ${details.message}`)",
    );
  });
});

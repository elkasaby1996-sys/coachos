import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const readSource = (...segments: string[]) =>
  readFileSync(resolve(process.cwd(), ...segments), "utf8");

describe("exercise query wiring", () => {
  it("uses the canonical full library query on both editor and picker surfaces", () => {
    const editor = readSource("src", "pages", "pt", "settings-exercises.tsx");
    const builder = readSource(
      "src",
      "pages",
      "pt",
      "workout-template-builder.tsx",
    );

    expect(editor).toContain("exerciseLibraryFullQueryOptions");
    expect(builder).toContain("exerciseLibraryFullQueryOptions");
    expect(editor).not.toContain('queryKey: ["exercise-library"');
    expect(builder).not.toContain('queryKey: ["exercise-library"');
  });

  it("wires each template consumer to its projection-specific key", () => {
    const expectations = [
      ["pt", "workout-template-builder.tsx", ".builder("],
      ["pt", "workout-template-preview.tsx", ".preview("],
      ["client", "workout-today.tsx", ".today("],
      ["client", "workout-detail.tsx", ".detail("],
      ["client", "workout-run.tsx", ".runner("],
    ] as const;

    expectations.forEach(([area, file, keyFactory]) => {
      const source = readSource("src", "pages", area, file);
      expect(source).toContain(`workoutTemplateExerciseQueryKeys${keyFactory}`);
      expect(source).not.toContain('queryKey: ["workout-template-exercises"');
    });
  });
});

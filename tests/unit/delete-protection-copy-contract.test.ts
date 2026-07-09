import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const readSource = (...segments: string[]) =>
  readFileSync(resolve(process.cwd(), ...segments), "utf8");

const workoutTemplatesPage = readSource(
  "src",
  "pages",
  "pt",
  "workout-templates.tsx",
);
const programsPage = readSource("src", "pages", "pt", "programs.tsx");
const programBuilderPage = readSource(
  "src",
  "pages",
  "pt",
  "program-builder.tsx",
);

describe("delete protection copy parity", () => {
  it("keeps workout template delete failures user-safe and assignment-aware", () => {
    expect(workoutTemplatesPage).toContain("getTemplateDeleteErrorMessage");
    expect(workoutTemplatesPage).toContain("isDeleteProtectionError");
    expect(workoutTemplatesPage).toContain(
      "This template is already assigned to a client and cannot be deleted.",
    );
    expect(workoutTemplatesPage).toContain(
      "Existing client assignments prevent deletion. Historical records are preserved.",
    );
    expect(workoutTemplatesPage).toContain(
      "<AlertTitle>Delete failed</AlertTitle>",
    );
    expect(workoutTemplatesPage).not.toContain("window.confirm");
  });

  it("keeps program delete failures user-safe and assignment-aware", () => {
    expect(programsPage).toContain("getProgramDeleteErrorMessage");
    expect(programsPage).toContain("isDeleteProtectionError");
    expect(programsPage).toContain(
      "This template is already assigned to a client and cannot be deleted.",
    );
    expect(programsPage).toContain(
      "Existing client assignments prevent deletion. Historical records are preserved.",
    );
    expect(programsPage).toContain("<AlertTitle>Delete failed</AlertTitle>");
    expect(programsPage).not.toContain("window.confirm");
  });

  it("keeps program layout save-delete failures user-safe and assignment-aware", () => {
    expect(programBuilderPage).toContain("getProgramLayoutDeleteErrorMessage");
    expect(programBuilderPage).toContain("isDeleteProtectionError");
    expect(programBuilderPage).toContain(
      "This template is already assigned to a client and cannot be deleted.",
    );
    expect(programBuilderPage).toContain(
      "Existing client assignments prevent deletion. Historical records are preserved.",
    );
    expect(programBuilderPage).not.toContain("window.confirm");
  });
});

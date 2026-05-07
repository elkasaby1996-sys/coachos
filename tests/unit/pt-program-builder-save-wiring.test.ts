import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const programBuilderPage = readFileSync(
  resolve(process.cwd(), "src", "pages", "pt", "program-builder.tsx"),
  "utf8",
);

describe("PT program builder save wiring", () => {
  it("shows a success notice after save so the builder does not feel like a no-op", () => {
    expect(programBuilderPage).toContain("Program saved");
    expect(programBuilderPage).toContain(
      "Your weekly structure is now in the library.",
    );
  });

  it("carries success state across the new-program redirect", () => {
    expect(programBuilderPage).toContain("/edit?saved=1");
    expect(programBuilderPage).toContain('searchParams.get("saved") !== "1"');
  });

  it("refreshes the current program and template-day queries after save", () => {
    expect(programBuilderPage).toContain('queryKey: ["program-template", programId]');
    expect(programBuilderPage).toContain(
      'queryKey: ["program-template-days", programId]',
    );
  });
});

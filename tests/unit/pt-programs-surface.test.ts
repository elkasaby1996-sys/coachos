import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const programsSource = readFileSync(
  resolve(process.cwd(), "src/pages/pt/programs.tsx"),
  "utf8",
);

describe("PT programs surface", () => {
  it("does not render summary KPI cards above the programs list", () => {
    expect(programsSource).not.toContain("page-kpi-block");
    expect(programsSource).not.toContain("Multi-week systems ready to reuse");
    expect(programsSource).not.toContain("Available for assignment and edits");
    expect(programsSource).not.toContain(
      "Stored for reference without clutter",
    );
  });

  it("keeps the working list controls available", () => {
    expect(programsSource).toContain("Search programs");
    expect(programsSource).toContain("All program types");
    expect(programsSource).toContain("Sort by updated");
    expect(programsSource).toContain(
      "xl:grid-cols-[minmax(0,1fr)_12rem_12rem_auto]",
    );
    expect(programsSource).toContain("New Program");
  });

  it("combines the empty program guidance into one card", () => {
    expect(programsSource).toContain("Build your first reusable program");
    expect(programsSource).toContain("md:grid-cols-2 xl:grid-cols-4");
    expect(programsSource).toContain("Recommended first step");
    expect(programsSource).toContain("Create the first block");
    expect(programsSource).not.toContain('title="Create flow"');
    expect(programsSource).not.toContain(
      "Start deliberately so the first program already fits the long-term library.",
    );
    expect(programsSource).not.toContain("xl:grid-cols-[1.15fr_0.85fr]");
    expect(programsSource).not.toContain(
      "lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]",
    );
  });
});

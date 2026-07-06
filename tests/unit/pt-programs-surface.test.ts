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
  });
});

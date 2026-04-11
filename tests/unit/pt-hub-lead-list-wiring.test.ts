import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function readSource(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("pt hub lead list package wiring", () => {
  it("uses shared helper-based package filtering and compact row package context", () => {
    const leadsPage = readSource("src/pages/pt-hub/leads.tsx");

    expect(leadsPage).toContain("deriveLeadPackageFilterOptions");
    expect(leadsPage).toContain("filterLeadsByPackageContext");
    expect(leadsPage).toContain('aria-label="Filter by package interest"');
    expect(leadsPage).toContain("Package: {packageLabel}");
    expect(leadsPage).not.toContain("Package not specified");
  });
});

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ptClientDetailPage = readFileSync(
  resolve(process.cwd(), "src", "pages", "pt", "client-detail.tsx"),
  "utf8",
);

const clientBaselinePage = readFileSync(
  resolve(process.cwd(), "src", "pages", "client", "baseline.tsx"),
  "utf8",
);

describe("PT performance marker baseline wiring", () => {
  it("keeps PT baseline tab settings-driven instead of per-client assignment", () => {
    expect(ptClientDetailPage).toContain("Active markers are managed in PT Settings");
    expect(ptClientDetailPage).toContain("Manage in settings");
    expect(ptClientDetailPage).not.toContain("Performance markers to assign");
    expect(ptClientDetailPage).not.toContain("pt_assign_performance_markers");
  });

  it("makes the client baseline page use the active marker library directly", () => {
    expect(clientBaselinePage).toContain("client-baseline-onboarding");
    expect(clientBaselinePage).toContain("initial_baseline_entry_id");
    expect(clientBaselinePage).toContain(
      "No active performance markers are enabled for your coaching space yet.",
    );
    expect(clientBaselinePage).not.toContain("baseline_entry_marker_templates");
  });
});

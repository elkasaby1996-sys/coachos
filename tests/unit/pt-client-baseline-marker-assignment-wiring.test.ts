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

describe("PT client baseline marker assignment wiring", () => {
  it("lets PT choose markers inside the baseline tab", () => {
    expect(ptClientDetailPage).toContain("Performance markers to assign");
    expect(ptClientDetailPage).toContain("selectedBaselineMarkerIds");
    expect(ptClientDetailPage).toContain("pt_assign_baseline_markers");
    expect(ptClientDetailPage).toContain("p_workspace_id: workspaceQuery.data");
  });

  it("makes the client baseline page honor assigned marker rows before fallback", () => {
    expect(clientBaselinePage).toContain("baseline-marker-assignments");
    expect(clientBaselinePage).toContain("client-baseline-onboarding");
    expect(clientBaselinePage).toContain("initial_baseline_entry_id");
    expect(clientBaselinePage).toContain(
      "resolveAssignedBaselineMarkerTemplates",
    );
    expect(clientBaselinePage).toContain(
      "Your coach has not assigned performance markers for this assessment yet.",
    );
  });
});

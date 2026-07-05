import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const clientDetailPage = readFileSync(
  resolve(process.cwd(), "src", "pages", "pt", "client-detail.tsx"),
  "utf8",
);

describe("client detail assignment card polish", () => {
  it("uses local assignment card primitives for delivery cards", () => {
    expect(clientDetailPage).toContain("function AssignmentCardHeader");
    expect(clientDetailPage).toContain("function AssignmentMetaRow");
    expect(clientDetailPage).toContain("function AssignmentActionRow");
    expect(clientDetailPage).toContain("function AssignmentReadOnlyNotice");
  });

  it("surfaces snapshot copy near workout, program, and nutrition assignment controls", () => {
    expect(clientDetailPage).toContain("ASSIGNMENT_SNAPSHOT_WARNING_TITLE");
    expect(clientDetailPage).toContain("ASSIGNMENT_SNAPSHOT_NOTICE");
    expect(clientDetailPage).toContain("Template source");
    expect(clientDetailPage).toContain(
      "Template edits affect future assignments only.",
    );
    expect(clientDetailPage).toContain("Current nutrition assignment");
    expect(clientDetailPage).toContain("Assign nutrition program");
  });

  it("uses cadence settings language for check-in assignment cards", () => {
    expect(clientDetailPage).toContain(
      "Check-ins use cadence settings. Future check-ins",
    );
    expect(clientDetailPage).toContain(
      "follow the selected template, frequency, and start",
    );
    expect(clientDetailPage).toContain("Current check-in assignment");
    expect(clientDetailPage).toContain("Edit check-in settings");
  });

  it("keeps ended client relationships read-only for assignment surfaces", () => {
    expect(clientDetailPage).toContain(
      "This client relationship is no longer active. Assignment history is",
    );
    expect(clientDetailPage).toContain(
      "canEditClients={canMutateActiveClient}",
    );
    expect(clientDetailPage).toContain("!canEditClients");
    expect(clientDetailPage).toContain("!isHistoricalClientRelationship");
  });

  it("keeps destructive assignment actions in subdued action rows", () => {
    expect(clientDetailPage).toContain("<AssignmentActionRow danger>");
    expect(clientDetailPage).toContain("Unassign program");
    expect(clientDetailPage).toContain("Remove assignment");
    expect(clientDetailPage).toContain(
      "Completed workout history is preserved",
    );
    expect(clientDetailPage).toContain("Historical records are preserved");
  });
});

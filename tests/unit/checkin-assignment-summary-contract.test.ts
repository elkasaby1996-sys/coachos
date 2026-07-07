import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const clientDetailPage = readFileSync(
  resolve(process.cwd(), "src/pages/pt/client-detail.tsx"),
  "utf8",
);

describe("coach check-in assignment summary contract", () => {
  it("renders a current check-in assignment summary in the coach delivery context", () => {
    expect(clientDetailPage).toContain("Current check-in assignment");
    expect(clientDetailPage).toContain("checkinAssignmentState");
    expect(clientDetailPage).toContain("resolveClientCheckinPageState");
    expect(clientDetailPage).toContain('label: "Not assigned"');
    expect(clientDetailPage).toContain('label: "Assigned"');
  });

  it("shows assigned template, cadence, start date, and next due", () => {
    expect(clientDetailPage).toContain("checkinAssignmentTemplateName");
    expect(clientDetailPage).toContain("checkinAssignmentFrequencyLabel");
    expect(clientDetailPage).toContain("checkinAssignmentStartLabel");
    expect(clientDetailPage).toContain("Next scheduled");
    expect(clientDetailPage).not.toContain("Selected check-in form");
    expect(clientDetailPage).not.toContain("Frequency drives future check-ins.");
    expect(clientDetailPage).not.toContain("Anchor date for cadence.");
    expect(clientDetailPage).not.toContain("Resolved from current settings.");
    expect(clientDetailPage).not.toContain("Current client-facing state.");
  });

  it("gates the edit CTA to existing delivery-write permission", () => {
    expect(clientDetailPage).toContain("Edit check-in settings");
    expect(clientDetailPage).toContain("canManageDelivery");
    expect(clientDetailPage).toContain("isHistoricalClientRelationship");
    expect(clientDetailPage).toContain("canManageDelivery &&");
    expect(clientDetailPage).toContain("!isHistoricalClientRelationship");
  });
});

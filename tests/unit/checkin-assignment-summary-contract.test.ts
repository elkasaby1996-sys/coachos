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
    expect(clientDetailPage).toContain("No check-in assigned");
    expect(clientDetailPage).toContain("Assigned, not open");
  });

  it("shows assigned template, cadence, start date, next due, and status", () => {
    expect(clientDetailPage).toContain("checkinAssignmentTemplateName");
    expect(clientDetailPage).toContain("checkinAssignmentFrequencyLabel");
    expect(clientDetailPage).toContain("checkinAssignmentStartLabel");
    expect(clientDetailPage).toContain("Next scheduled");
    expect(clientDetailPage).toContain("Current status");
  });

  it("gates the edit CTA to existing delivery-write permission", () => {
    expect(clientDetailPage).toContain("Edit check-in settings");
    expect(clientDetailPage).toContain("canManageDelivery");
    expect(clientDetailPage).toContain("isHistoricalClientRelationship");
    expect(clientDetailPage).toContain("canManageDelivery &&");
    expect(clientDetailPage).toContain("!isHistoricalClientRelationship");
  });
});

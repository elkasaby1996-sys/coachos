import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const readRepoFile = (...parts: string[]) =>
  readFileSync(resolve(process.cwd(), ...parts), "utf8").replace(/\r\n/g, "\n");

const source = readRepoFile("src", "pages", "pt", "client-detail.tsx");

describe("pt client detail status cleanup", () => {
  it("uses the central client status display helper for the detail header", () => {
    expect(source).toContain("getClientGlobalStatusDisplay");
    expect(source).toContain("clientGlobalStatusDisplay");
    expect(source).toContain("<ClientDetailStatusSummary");
  });

  it("keeps lifecycle in one global status area instead of direct header and overview badges", () => {
    expect(source).toContain("Lifecycle");
    expect(source).toContain("statusDisplay.globalBadges");
    expect(source).not.toContain("<LifecycleBadge");
  });

  it("renders one attention state without direct risk badge or sliced risk flag header chips", () => {
    expect(source).toContain("Needs attention");
    expect(source).not.toContain("<RiskBadge");
    expect(source).not.toContain("clientRiskFlags.slice(0, 2)");
  });

  it("prioritizes historical relationship state while preserving the historical banner", () => {
    expect(source).toContain("isHistoricalClientRelationship");
    expect(source).toContain("clientGlobalStatusDisplay");
    expect(source).toContain("relationship_status: clientRelationshipStatus");
    expect(source).toContain("Historical client relationship");
    expect(source).toContain(
      "This client relationship is no longer active. History is preserved for reference.",
    );
    expect(source).toContain("Transferred out");
    expect(source).toContain("Removed");
  });

  it("keeps ended relationships read-only for assignment and delivery mutations", () => {
    expect(source).toContain("canMutateActiveClient");
    expect(source).toContain("canEditClients={canMutateActiveClient}");
    expect(source).toContain("!isHistoricalClientRelationship");
    expect(source).toContain(
      "canManageDelivery && !isHistoricalClientRelationship",
    );
  });

  it("does not expose global attention details for historical relationships", () => {
    expect(source).toContain(
      "hasClientAttentionFlag && !isHistoricalClientRelationship",
    );
    expect(source).not.toContain("setAttentionFlagDialogOpen(true)}");
  });

  it("uses the locked historical copy in tab-level read-only delivery states", () => {
    const readOnlyNoticeMatch = source.match(
      /function AssignmentReadOnlyNotice\([\s\S]*?\nconst formatListValue/,
    );

    expect(readOnlyNoticeMatch?.[0]).toContain(
      "HISTORICAL_CLIENT_RELATIONSHIP_COPY",
    );
    expect(source).toContain(
      "This client relationship is no longer active. History is preserved for reference.",
    );
  });
});

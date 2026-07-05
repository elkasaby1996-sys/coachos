import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const readRepoFile = (...parts: string[]) =>
  readFileSync(resolve(process.cwd(), ...parts), "utf8").replace(/\r\n/g, "\n");

const clientStatusDisplaySource = readRepoFile(
  "src",
  "lib",
  "client-status-display.ts",
);
const ptHubClientTableSource = readRepoFile(
  "src",
  "features",
  "pt-hub",
  "components",
  "pt-hub-client-table.tsx",
);
const workspaceClientsSource = readRepoFile("src", "pages", "pt", "clients.tsx");
const clientDetailSource = readRepoFile(
  "src",
  "pages",
  "pt",
  "client-detail.tsx",
);
const clientPortalSource = [
  readRepoFile("src", "pages", "client", "home.tsx"),
  readRepoFile("src", "pages", "client", "checkin.tsx"),
  readRepoFile("src", "pages", "client", "nutrition.tsx"),
].join("\n");

describe("final badge and status regression", () => {
  it("keeps the central helper as the only global row badge taxonomy", () => {
    expect(clientStatusDisplaySource).toContain("getClientGlobalStatusDisplay");
    expect(clientStatusDisplaySource).toContain('label: "Needs attention"');
    expect(clientStatusDisplaySource).toContain('label: "Removed"');
    expect(clientStatusDisplaySource).toContain('label: "Transferred out"');
    expect(clientStatusDisplaySource).toContain("globalBadges: [relationshipBadge]");
    expect(clientStatusDisplaySource).toContain(
      "[lifecycleBadge, attentionBadge].filter",
    );
  });

  it("keeps PT Hub rows helper-driven without direct risk or workflow badge piles", () => {
    expect(ptHubClientTableSource).toContain(
      "getClientGlobalStatusDisplay(client)",
    );
    expect(ptHubClientTableSource).toContain("statusDisplay.globalBadges.map");
    expect(ptHubClientTableSource).not.toContain("<RiskBadge");
    expect(ptHubClientTableSource).not.toContain("<LifecycleBadge");
    expect(ptHubClientTableSource).not.toContain("clientRiskFlags.slice");
    expect(ptHubClientTableSource).not.toContain("onboardingStatusMeta");
  });

  it("keeps client detail centralized without duplicate global status chips", () => {
    expect(clientDetailSource).toContain("<ClientDetailInlineStatusBadges");
    expect(clientDetailSource).toContain("client-detail-header-name-row");
    expect(clientDetailSource).toContain("client-detail-header-status-badges");
    expect(clientDetailSource).toContain("clientGlobalStatusDisplay");
    expect(clientDetailSource).toContain("Historical client relationship");
    expect(clientDetailSource).not.toContain("function ClientDetailStatusSummary");
    expect(clientDetailSource).not.toContain("clientAttentionReasons");
    expect(clientDetailSource).not.toContain("<RiskBadge");
    expect(clientDetailSource).not.toContain("<LifecycleBadge");
    expect(clientDetailSource).not.toContain("clientRiskFlags.slice");
  });

  it("keeps client portal free of internal coach lifecycle and risk labels", () => {
    for (const label of [
      "At risk",
      "Churned",
      "Removed",
      "Transferred out",
      "No recent reply",
      "Low adherence trend",
      "Inactive client",
      "Manual risk",
      "lifecycle_state",
      "relationship_status",
      "risk_flags",
    ]) {
      expect(clientPortalSource).not.toContain(label);
    }
  });

  it("keeps client-facing task statuses and no-assignment copy visible", () => {
    expect(clientPortalSource).toContain(
      "Your coach has not assigned a workout plan yet.",
    );
    expect(clientPortalSource).toContain(
      "Your coach has not assigned a nutrition plan yet.",
    );
    expect(clientPortalSource).toContain(
      "Your coach has not assigned a check-in schedule yet.",
    );
    expect(clientPortalSource).toContain("Check-in overdue");
    expect(clientPortalSource).toContain("Check-in submitted");
    expect(clientPortalSource).toContain("Check-in reviewed");
    expect(clientPortalSource).toContain("Workout planned");
  });

  it("keeps lifecycle and segment filters exposed while badges stay simplified", () => {
    for (const source of [workspaceClientsSource, ptHubClientTableSource]) {
      expect(source).not.toContain("<RiskBadge");
      expect(source).not.toContain("<LifecycleBadge");
    }

    expect(workspaceClientsSource).toContain("lifecycleFilter");
    expect(workspaceClientsSource).toContain("segmentFilter");
    expect(workspaceClientsSource).toContain('<option value="onboarding">');
    expect(workspaceClientsSource).toContain('<option value="paused">');
    expect(workspaceClientsSource).toContain('<option value="at_risk">');
    expect(workspaceClientsSource).toContain(
      "relationshipScope: clientListView",
    );
  });
});

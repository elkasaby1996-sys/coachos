import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { PtHubClientTable } from "../../src/features/pt-hub/components/pt-hub-client-table";
import type { PTClientSummary } from "../../src/features/pt-hub/types";
import { I18nContext } from "../../src/lib/i18n-context";

const readRepoFile = (...parts: string[]) =>
  readFileSync(resolve(process.cwd(), ...parts), "utf8").replace(/\r\n/g, "\n");

const ptHubClientsPageSource = readRepoFile("src", "pages", "pt-hub", "clients.tsx");
const workspaceClientsPageSource = readRepoFile("src", "pages", "pt", "clients.tsx");
const ptHubClientTableSource = readRepoFile(
  "src",
  "features",
  "pt-hub",
  "components",
  "pt-hub-client-table.tsx",
);

const i18nValue = {
  dir: "ltr" as const,
  language: "en" as const,
  locale: "en-US",
  region: "US" as const,
  setLanguage: vi.fn(),
  setRegion: vi.fn(),
  t: (_key: string, fallback?: string) => fallback ?? _key,
};

function makeClient(
  overrides: Partial<PTClientSummary> = {},
): PTClientSummary {
  return {
    id: "client-1",
    urlKey: "client-one",
    workspaceId: "workspace-1",
    workspaceSlug: "workspace-one",
    workspaceName: "Main workspace",
    displayName: "Client One",
    status: "active",
    relationshipStatus: "active",
    lifecycleState: "active",
    manualRiskFlag: false,
    lifecycleChangedAt: null,
    pausedReason: null,
    churnReason: null,
    goal: null,
    createdAt: null,
    updatedAt: null,
    onboardingStatus: null,
    onboardingIncomplete: false,
    lastActivityAt: null,
    lastClientReplyAt: null,
    hasOverdueCheckin: false,
    overdueCheckinsCount: 0,
    riskFlags: [],
    recentActivityLabel: "today",
    ...overrides,
  };
}

function renderTable(clients: PTClientSummary[]) {
  return renderToStaticMarkup(
    React.createElement(
      I18nContext.Provider,
      { value: i18nValue },
      React.createElement(PtHubClientTable, {
        clients,
        onOpen: vi.fn(),
        showWorkspaceColumn: false,
      }),
    ),
  );
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function countVisibleText(markup: string, text: string) {
  return [...markup.matchAll(new RegExp(`>${escapeRegExp(text)}<`, "g"))]
    .length;
}

describe("PT Hub client table badge cleanup", () => {
  it("renders only the lifecycle badge for an active normal client row", () => {
    const markup = renderTable([makeClient()]);

    expect(countVisibleText(markup, "Active")).toBe(1);
    expect(markup).not.toContain("Needs attention");
    expect(markup).not.toContain("At risk");
  });

  it("renders one Needs attention badge for active rows with multiple risk flags", () => {
    const markup = renderTable([
      makeClient({
        manualRiskFlag: true,
        hasOverdueCheckin: true,
        overdueCheckinsCount: 4,
        riskFlags: [
          "missed_checkins",
          "no_recent_reply",
          "low_adherence_trend",
          "inactive_client",
        ],
      }),
    ]);

    expect(countVisibleText(markup, "Active")).toBe(1);
    expect(countVisibleText(markup, "Needs attention")).toBe(1);
    expect(markup).not.toContain("At risk");
    expect(markup).not.toContain("Missed check-ins");
    expect(markup).not.toContain("No reply");
    expect(markup).not.toContain("Low adherence");
    expect(markup).not.toContain("Inactive");
    expect(markup).not.toContain("overdue");
  });

  it("uses the central attention badge description for PT Hub and workspace client rows", () => {
    expect(ptHubClientTableSource).toContain(
      "return badge.description ?? attentionReasons.map",
    );
    expect(ptHubClientTableSource).toContain(
      "Attention signal detected, but the reason could not be resolved.",
    );
    expect(ptHubClientTableSource).not.toContain(
      "This client has one or more existing coaching attention signals.",
    );
    expect(ptHubClientsPageSource).toContain("<PtHubClientTable");
    expect(workspaceClientsPageSource).toContain("<PtHubClientTable");
  });

  it("renders only Removed for a removed relationship row", () => {
    const markup = renderTable([
      makeClient({
        relationshipStatus: "removed",
        manualRiskFlag: true,
        hasOverdueCheckin: true,
        riskFlags: ["missed_checkins"],
      }),
    ]);

    expect(countVisibleText(markup, "Removed")).toBe(1);
    expect(markup).not.toContain("Active");
    expect(markup).not.toContain("Needs attention");
    expect(markup).not.toContain("At risk");
  });

  it("renders only Transferred out for a transferred-out relationship row", () => {
    const markup = renderTable([
      makeClient({
        relationshipStatus: "transferred_out",
        lifecycleState: "paused",
        riskFlags: ["no_recent_reply"],
      }),
    ]);

    expect(countVisibleText(markup, "Transferred out")).toBe(1);
    expect(markup).not.toContain("Paused");
    expect(markup).not.toContain("Needs attention");
    expect(markup).not.toContain("No reply");
  });

  it("keeps PT Hub lifecycle and segment filter controls unchanged", () => {
    expect(ptHubClientsPageSource).toContain(
      'value={lifecycleFilter}\n            onChange={(event) => setLifecycleFilter(event.target.value)}',
    );
    expect(ptHubClientsPageSource).toContain(
      'value={segmentFilter}\n            onChange={(event) =>\n              setSegmentFilter(event.target.value as ClientSegmentKey)',
    );
    expect(ptHubClientsPageSource).toContain(
      '<option value="checkin_overdue">',
    );
    expect(ptHubClientsPageSource).toContain('<option value="at_risk">');
  });

  it("keeps workspace client active and archived tab behavior unchanged", () => {
    expect(workspaceClientsPageSource).toContain('viewParam === "archived"');
    expect(workspaceClientsPageSource).toContain(
      "relationshipScope: clientListView",
    );
    expect(workspaceClientsPageSource).toContain(
      'setClientListView("active")',
    );
    expect(workspaceClientsPageSource).toContain(
      'setClientListView("archived")',
    );
    expect(workspaceClientsPageSource).toContain(
      'value={lifecycleFilter}\n              onChange={(event) => setLifecycleFilter(event.target.value)}',
    );
    expect(workspaceClientsPageSource).toContain(
      'value={segmentFilter}\n              onChange={(event) =>\n                setSegmentFilter(event.target.value as ClientSegmentKey)',
    );
  });
});

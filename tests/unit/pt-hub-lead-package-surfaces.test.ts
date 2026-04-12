import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { PtHubLeadDetailView } from "../../src/features/pt-hub/components/pt-hub-lead-detail-view";
import type { PTLead, PTPackage } from "../../src/features/pt-hub/types";

const baseLead: PTLead = {
  id: "lead-1",
  applicantUserId: "applicant-1",
  fullName: "Alex Applicant",
  email: "alex@example.com",
  phone: "+966500000000",
  goalSummary: "Build strength and improve body composition.",
  trainingExperience: "Intermediate",
  budgetInterest: null,
  packageInterest: null,
  packageInterestId: null,
  packageInterestLabelSnapshot: null,
  status: "new",
  submittedAt: "2026-04-01T12:00:00.000Z",
  notesPreview: null,
  leadConversationId: "conversation-1",
  leadConversationStatus: "open",
  leadConversationArchivedReason: null,
  leadLastMessagePreview: null,
  leadLastMessageAt: null,
  leadUnreadCount: 0,
  notes: [],
  source: "public_profile",
  sourceLabel: "Public profile",
  sourceSlug: "coach-prime",
  convertedAt: null,
  convertedWorkspaceId: null,
  convertedClientId: null,
};

const baseCurrentPackage: PTPackage = {
  id: "pkg-1",
  ptUserId: "coach-1",
  title: "Strength Build v2",
  subtitle: null,
  description: null,
  priceLabel: null,
  billingCadenceLabel: null,
  ctaLabel: null,
  features: null,
  status: "active",
  isPublic: true,
  sortOrder: 0,
  currencyCode: null,
  archivedAt: null,
  createdAt: "2026-04-01T12:00:00.000Z",
  updatedAt: "2026-04-11T12:00:00.000Z",
};

const archivedCurrentPackage: PTPackage = {
  ...baseCurrentPackage,
  title: "Strength Build (Archived)",
  status: "archived",
  isPublic: false,
  archivedAt: "2026-04-12T12:00:00.000Z",
};

function renderLeadDetail(params: {
  lead: PTLead;
  currentPackage?: PTPackage | null;
  currentPackageLookupLoading?: boolean;
}) {
  return renderToStaticMarkup(
    createElement(
      MemoryRouter,
      undefined,
      createElement(PtHubLeadDetailView, {
        lead: params.lead,
        currentPackage: params.currentPackage ?? null,
        currentPackageLookupLoading: params.currentPackageLookupLoading ?? false,
        workspaces: [],
        currentUserId: "coach-1",
        leadChatMessages: [],
        leadChatStatus: "open",
        leadChatArchivedReason: null,
        sendingLeadMessage: false,
        saving: false,
        onUpdateStatus: async () => {},
        onApprove: async () => {},
        onDecline: async () => {},
        onSendLeadMessage: async () => {},
        onAddNote: async () => {},
      }),
    ),
  );
}

describe("pt hub lead package context surfaces", () => {
  it("keeps snapshot as primary when current package resolves with a different title", () => {
    const html = renderLeadDetail({
      lead: {
        ...baseLead,
        packageInterestId: "pkg-1",
        packageInterestLabelSnapshot: "Strength Build",
      },
      currentPackage: baseCurrentPackage,
    });

    expect(html).toMatch(/Selected at application[\s\S]*Strength Build/);
    expect(html).toMatch(/Current package[\s\S]*Strength Build v2/);
  });

  it("shows a clean no-package state in lead detail", () => {
    const html = renderLeadDetail({
      lead: {
        ...baseLead,
        packageInterestId: null,
        packageInterestLabelSnapshot: null,
        packageInterest: null,
      },
      currentPackage: null,
    });

    expect(html).toContain("No package selected");
  });

  it("stays readable when snapshot exists but current package is unresolved", () => {
    const html = renderLeadDetail({
      lead: {
        ...baseLead,
        packageInterestId: "pkg-missing",
        packageInterestLabelSnapshot: "Legacy Strength Sprint",
      },
      currentPackage: null,
    });

    expect(html).toMatch(
      /Selected at application[\s\S]*Legacy Strength Sprint/,
    );
    expect(html).toContain("Current package record is unavailable");
  });

  it("keeps snapshot readable when package id is missing but snapshot exists", () => {
    const html = renderLeadDetail({
      lead: {
        ...baseLead,
        packageInterestId: null,
        packageInterestLabelSnapshot: "Foundations Plan",
      },
      currentPackage: null,
    });

    expect(html).toMatch(/Selected at application[\s\S]*Foundations Plan/);
    expect(html).not.toContain("Current package");
  });

  it("keeps snapshot primary even when current package is archived later", () => {
    const html = renderLeadDetail({
      lead: {
        ...baseLead,
        packageInterestId: "pkg-1",
        packageInterestLabelSnapshot: "Strength Build",
      },
      currentPackage: archivedCurrentPackage,
    });

    expect(html).toMatch(/Selected at application[\s\S]*Strength Build/);
    expect(html).toMatch(
      /Current package[\s\S]*Strength Build \(Archived\)/,
    );
    expect(html).toMatch(/Current state[\s\S]*Archived/);
  });

  it("keeps lead package context read-only without package-management actions", () => {
    const html = renderLeadDetail({
      lead: {
        ...baseLead,
        packageInterestLabelSnapshot: "Strength Build",
      },
      currentPackage: baseCurrentPackage,
    });

    expect(html).not.toContain("Create package");
    expect(html).not.toContain("Archive package");
    expect(html).not.toContain("Manage packages");
  });
});

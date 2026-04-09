import { describe, expect, it } from "vitest";
import { getPtHubOverviewDashboardModel } from "../../src/features/pt-hub/lib/overview-dashboard";
import type {
  PTClientSummary,
  PTLead,
  PTProfile,
  PTProfileReadiness,
  PTPublicationState,
  PTWorkspaceSummary,
} from "../../src/features/pt-hub/types";

function createReadiness(
  overrides: Partial<PTProfileReadiness> = {},
): PTProfileReadiness {
  return {
    completionPercent: 40,
    readyForPublish: false,
    statusLabel: "Not ready",
    missingItems: ["Profile photo", "Banner image", "Headline"],
    checklist: [
      {
        key: "profile_photo",
        label: "Profile photo",
        complete: false,
        href: "/pt-hub/profile",
        guidance: "Add a clear profile image.",
      },
      {
        key: "banner",
        label: "Banner image",
        complete: false,
        href: "/pt-hub/profile",
        guidance: "Add a banner image.",
      },
      {
        key: "headline",
        label: "Headline",
        complete: false,
        href: "/pt-hub/profile",
        guidance: "Summarize who you help.",
      },
    ],
    ...overrides,
  };
}

function createPublicationState(
  overrides: Partial<PTPublicationState> = {},
): PTPublicationState {
  return {
    canPublish: false,
    isPublished: false,
    blockers: ["Profile photo", "Banner image"],
    publicUrl: null,
    marketplaceStatus: "Draft only",
    ...overrides,
  };
}

function createProfile(overrides: Partial<PTProfile> = {}): PTProfile {
  return {
    id: "profile-1",
    workspaceId: null,
    fullName: "Alex Coach",
    displayName: "Alex Coach",
    slug: "alex-coach",
    headline: "",
    searchableHeadline: "",
    shortBio: "",
    specialties: [],
    certifications: [],
    coachingStyle: "",
    coachingModes: ["one_on_one"],
    availabilityModes: ["online"],
    locationLabel: "",
    marketplaceVisible: false,
    isPublished: false,
    publishedAt: null,
    profilePhotoUrl: null,
    bannerImageUrl: null,
    socialLinks: [],
    testimonials: [],
    transformations: [],
    publicUrl: null,
    completionPercent: 40,
    updatedAt: null,
    ...overrides,
  };
}

function createWorkspace(
  overrides: Partial<PTWorkspaceSummary> = {},
): PTWorkspaceSummary {
  return {
    id: "workspace-1",
    name: "Peak Performance",
    status: "active",
    clientCount: 0,
    lastUpdated: "2026-04-02T12:00:00.000Z",
    ownerUserId: "user-1",
    role: "owner",
    createdAt: "2026-03-30T12:00:00.000Z",
    ...overrides,
  };
}

function createLead(overrides: Partial<PTLead> = {}): PTLead {
  return {
    id: "lead-1",
    fullName: "Jordan Lead",
    email: "jordan@example.com",
    phone: null,
    goalSummary: "Build strength and lose body fat",
    trainingExperience: "Intermediate",
    budgetInterest: null,
    packageInterest: null,
    status: "new",
    submittedAt: "2026-04-03T12:00:00.000Z",
    notesPreview: null,
    notes: [],
    source: "public_profile",
    sourceLabel: "Public profile",
    sourceSlug: "alex-coach",
    convertedAt: null,
    convertedWorkspaceId: null,
    convertedClientId: null,
    ...overrides,
  };
}

function createClient(
  overrides: Partial<PTClientSummary> = {},
): PTClientSummary {
  return {
    id: "client-1",
    workspaceId: "workspace-1",
    workspaceName: "Peak Performance",
    displayName: "Taylor Client",
    status: "active",
    lifecycleState: "active",
    manualRiskFlag: false,
    lifecycleChangedAt: null,
    pausedReason: null,
    churnReason: null,
    goal: "Drop 10kg",
    createdAt: "2026-03-25T12:00:00.000Z",
    updatedAt: "2026-04-03T12:00:00.000Z",
    onboardingStatus: null,
    onboardingIncomplete: false,
    lastActivityAt: "2026-04-03T12:00:00.000Z",
    lastClientReplyAt: null,
    hasOverdueCheckin: false,
    overdueCheckinsCount: 0,
    riskFlags: [],
    recentActivityLabel: "yesterday",
    ...overrides,
  };
}

describe("PT Hub overview dashboard model", () => {
  it("switches into activation mode when the coach has no business activity and low readiness", () => {
    const model = getPtHubOverviewDashboardModel({
      stats: {
        activeWorkspaces: 0,
        activeClients: 0,
        applicationsThisWeek: 0,
        applicationsThisMonth: 0,
        applicationsPreviousWindow: 0,
        profileCompletionPercent: 40,
        subscriptionStatus: "Billing placeholder",
        latestWorkspaceId: null,
        latestWorkspaceName: null,
        lastProfileUpdate: null,
        readyForPublish: false,
        missingSetupItems: ["Profile photo"],
        businessHealthLabel: "Setup in progress",
      },
      analytics: null,
      readiness: createReadiness(),
      profile: createProfile(),
      publicationState: createPublicationState(),
      workspaces: [],
      leads: [],
      clients: [],
      subscription: {
        planName: "Repsync Pro",
        billingStatus: "Billing placeholder",
        renewalDate: null,
        paymentMethodLabel: null,
        packagePricingLabel: null,
        billingConnected: false,
      },
      revenue: {
        monthlyRevenueLabel: "Not connected",
        trailingRevenueLabel: "Not connected",
        activePayingClientsLabel: "Not connected",
        packagePricingLabel: "Not connected",
        revenueConnected: false,
        potentialActiveClients: 0,
      },
    });

    expect(model.mode).toBe("activation");
    expect(model.metrics.map((metric) => metric.label)).toEqual([
      "Monthly earnings",
      "Active clients",
      "New leads",
      "Check-ins due",
      "Onboarding in progress",
    ]);
    expect(model.actionItems[0]?.id).toBe("profile-blockers");
    expect(model.actionItems.map((item) => item.id)).toContain(
      "start-lead-flow",
    );
    expect(
      model.launchChecklist.some((item) => item.id === "publish-profile"),
    ).toBe(true);
  });

  it("switches into operating mode once the coach has real activity and prioritizes the most urgent actions", () => {
    const model = getPtHubOverviewDashboardModel({
      stats: {
        activeWorkspaces: 1,
        activeClients: 2,
        applicationsThisWeek: 2,
        applicationsThisMonth: 4,
        applicationsPreviousWindow: 1,
        profileCompletionPercent: 100,
        subscriptionStatus: "Manual",
        latestWorkspaceId: "workspace-1",
        latestWorkspaceName: "Peak Performance",
        lastProfileUpdate: "2026-04-03T12:00:00.000Z",
        readyForPublish: true,
        missingSetupItems: [],
        businessHealthLabel: "Healthy momentum",
      },
      analytics: {
        profileViewsLabel: "Not live yet",
        profileViewsConnected: false,
        totalApplications: 4,
        applicationsThisWeek: 2,
        applicationsThisMonth: 4,
        applicationsPreviousWindow: 1,
        applicationConversionRate: 25,
        activeClients: 2,
        profileCompletionPercent: 100,
        testimonialCountLabel: "Placeholder",
        transformationsCountLabel: "Placeholder",
        growthTrendLabel: "Lead flow is up vs prior 30 days",
        clientsByWorkspace: [
          {
            workspaceId: "workspace-1",
            workspaceName: "Peak Performance",
            clientCount: 2,
          },
        ],
      },
      readiness: createReadiness({
        completionPercent: 100,
        readyForPublish: true,
        statusLabel: "Ready for publish",
        missingItems: [],
        checklist: [],
      }),
      profile: createProfile({
        completionPercent: 100,
        isPublished: true,
        profilePhotoUrl: "https://example.com/photo.jpg",
        bannerImageUrl: "https://example.com/banner.jpg",
      }),
      publicationState: createPublicationState({
        canPublish: true,
        isPublished: true,
        blockers: [],
        publicUrl: "https://example.com/coach/alex-coach",
        marketplaceStatus: "Published privately from marketplace",
      }),
      workspaces: [createWorkspace({ clientCount: 2 })],
      leads: [
        createLead({ id: "lead-new", status: "new" }),
        createLead({ id: "lead-contacted", status: "contacted" }),
      ],
      clients: [
        createClient({
          id: "client-overdue",
          hasOverdueCheckin: true,
          overdueCheckinsCount: 2,
        }),
        createClient({
          id: "client-risk",
          lifecycleState: "active",
          manualRiskFlag: true,
          riskFlags: ["missed_checkins"],
        }),
      ],
      subscription: {
        planName: "Repsync Pro",
        billingStatus: "Manual",
        renewalDate: null,
        paymentMethodLabel: null,
        packagePricingLabel: null,
        billingConnected: false,
      },
      revenue: {
        monthlyRevenueLabel: "Not connected",
        trailingRevenueLabel: "Not connected",
        activePayingClientsLabel: "Not connected",
        packagePricingLabel: "Not connected",
        revenueConnected: false,
        potentialActiveClients: 2,
      },
    });

    expect(model.mode).toBe("operating");
    expect(model.metrics.map((metric) => metric.label)).toEqual([
      "Monthly earnings",
      "Active clients",
      "New leads",
      "Check-ins due",
      "Onboarding in progress",
    ]);
    expect(model.actionItems[0]?.id).toBe("unreplied-leads");
    expect(model.actionItems.map((item) => item.id)).toEqual(
      expect.arrayContaining([
        "overdue-checkins",
        "at-risk-clients",
        "billing-manual",
      ]),
    );
    expect(model.clientsNeedingAttentionCount).toBe(2);
  });
});

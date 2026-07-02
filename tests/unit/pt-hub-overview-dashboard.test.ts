import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  getPtHubActivationChecklistModel,
  getPtHubFirstClientApplicationPath,
  getPtHubOverviewDashboardModel,
  shouldShowPtHubActivationChecklist,
} from "../../src/features/pt-hub/lib/overview-dashboard";
import type {
  PTActivationSummary,
  PTClientSummary,
  PTLead,
  PTProfile,
  PTProfileReadiness,
  PTPublicationState,
  PTWorkspaceSummary,
} from "../../src/features/pt-hub/types";

const overviewSectionsSource = readFileSync(
  "src/features/pt-hub/components/pt-hub-overview-sections.tsx",
  "utf8",
);

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
    applicantUserId: "applicant-1",
    fullName: "Jordan Lead",
    email: "jordan@example.com",
    phone: null,
    goalSummary: "Build strength and lose body fat",
    trainingExperience: "Intermediate",
    budgetInterest: null,
    packageInterest: null,
    packageInterestId: null,
    packageInterestLabelSnapshot: null,
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

function createActivationSummary(
  overrides: Partial<PTActivationSummary> = {},
): PTActivationSummary {
  return {
    workspaceExists: true,
    activationWorkspaceId: "workspace-1",
    activationWorkspaceSlug: "peak-performance",
    profileComplete: false,
    profilePublished: false,
    hasFirstClient: false,
    firstClientId: null,
    hasWorkoutAssigned: false,
    hasNutritionAssigned: false,
    hasCheckInAssigned: false,
    hasCoCoachInvitedOrActive: false,
    clientCount: 0,
    coreCompletedCount: 1,
    coreTotalCount: 7,
    ...overrides,
  };
}

describe("PT Hub overview dashboard model", () => {
  it("maps activation summary into checklist items and selects the next incomplete core step", () => {
    const checklist = getPtHubActivationChecklistModel(
      createActivationSummary({
        profileComplete: true,
        profilePublished: false,
        hasFirstClient: false,
        coreCompletedCount: 2,
      }),
    );

    expect(checklist?.coreCompletedCount).toBe(2);
    expect(checklist?.coreTotalCount).toBe(7);
    expect(checklist?.nextItem?.id).toBe("publish");
    expect(
      checklist?.items.find((item) => item.id === "workspace")?.status,
    ).toBe("complete");
    expect(checklist?.items.find((item) => item.id === "profile")?.status).toBe(
      "complete",
    );
    expect(checklist?.items.find((item) => item.id === "publish")?.status).toBe(
      "next",
    );
  });

  it("keeps optional co-coach outside core completion", () => {
    const checklist = getPtHubActivationChecklistModel(
      createActivationSummary({
        profileComplete: true,
        profilePublished: true,
        hasFirstClient: true,
        firstClientId: "client-1",
        hasWorkoutAssigned: true,
        hasNutritionAssigned: true,
        hasCheckInAssigned: true,
        hasCoCoachInvitedOrActive: false,
        coreCompletedCount: 7,
      }),
    );

    expect(checklist?.coreComplete).toBe(true);
    expect(checklist?.nextItem).toBeNull();
    expect(checklist?.optionalItem.status).toBe("optional");
    expect(checklist?.optionalItem.optional).toBe(true);
    expect(shouldShowPtHubActivationChecklist(checklist)).toBe(false);
  });

  it("shows the activation checklist while core setup is incomplete", () => {
    const checklist = getPtHubActivationChecklistModel(
      createActivationSummary({
        profileComplete: true,
        profilePublished: false,
        coreCompletedCount: 2,
      }),
    );

    expect(checklist?.coreComplete).toBe(false);
    expect(checklist?.nextItem?.id).toBe("publish");
    expect(shouldShowPtHubActivationChecklist(checklist)).toBe(true);
  });

  it("wires the activation card as a compact collapsed UI by default", () => {
    expect(overviewSectionsSource).toContain("useState(false)");
    expect(overviewSectionsSource).toContain("View full checklist");
    expect(overviewSectionsSource).toContain("Collapse checklist");
    expect(overviewSectionsSource).toContain("aria-expanded={isExpanded}");
    expect(overviewSectionsSource).toContain("aria-controls={checklistRowsId}");
  });

  it("keeps full checklist rows behind the expanded state", () => {
    expect(overviewSectionsSource).toContain(
      'aria-label="Full activation checklist"',
    );
    expect(overviewSectionsSource).toContain("isExpanded ? (");
    expect(overviewSectionsSource).toContain("visibleItems.map((item)");
    expect(overviewSectionsSource.indexOf("isExpanded ? (")).toBeLessThan(
      overviewSectionsSource.indexOf("visibleItems.map((item)"),
    );
  });

  it("keeps optional co-coach out of the compact default activation card", () => {
    const checklist = getPtHubActivationChecklistModel(
      createActivationSummary({
        profileComplete: true,
        profilePublished: true,
        hasFirstClient: false,
        hasCoCoachInvitedOrActive: false,
        coreCompletedCount: 3,
      }),
    );

    expect(checklist?.optionalItem.optional).toBe(true);
    expect(checklist?.optionalItem.status).toBe("optional");
    expect(overviewSectionsSource).toContain("{isExpanded ? (");
  });

  it("hides the activation checklist when all core setup is complete", () => {
    const checklist = getPtHubActivationChecklistModel(
      createActivationSummary({
        profileComplete: true,
        profilePublished: true,
        hasFirstClient: true,
        firstClientId: "client-1",
        hasWorkoutAssigned: true,
        hasNutritionAssigned: true,
        hasCheckInAssigned: true,
        hasCoCoachInvitedOrActive: true,
        coreCompletedCount: 7,
      }),
    );

    expect(checklist?.coreComplete).toBe(true);
    expect(shouldShowPtHubActivationChecklist(checklist)).toBe(false);
  });

  it("does not generate client-detail routes before a first client exists", () => {
    const checklist = getPtHubActivationChecklistModel(
      createActivationSummary({
        hasFirstClient: false,
        firstClientId: null,
      }),
    );

    expect(checklist?.items.find((item) => item.id === "workout")?.href).toBe(
      "/pt/templates/workouts",
    );
    expect(checklist?.items.find((item) => item.id === "nutrition")?.href).toBe(
      "/pt/nutrition-programs",
    );
    expect(checklist?.items.find((item) => item.id === "check-in")?.href).toBe(
      "/pt/checkins/templates",
    );
  });

  it("renders first-client guidance while the coach has no clients", () => {
    const checklist = getPtHubActivationChecklistModel(
      createActivationSummary({
        profileComplete: true,
        profilePublished: true,
        hasFirstClient: false,
        coreCompletedCount: 3,
      }),
    );

    expect(
      checklist?.items.find((item) => item.id === "first-client"),
    ).toMatchObject({
      ctaLabel: "Choose client path",
      description:
        "Choose whether to invite someone you already coach or collect new applications.",
      status: "next",
    });
    expect(checklist?.firstClientGuidance?.invite).toMatchObject({
      title: "Invite an existing client",
      ctaLabel: "Invite client",
    });
    expect(checklist?.firstClientGuidance?.applications).toMatchObject({
      title: "Get new applications",
      href: "/pt-hub/leads",
      ctaLabel: "Review leads",
    });
  });

  it("only renders first-client chooser when first-client is the next recommended step", () => {
    const checklist = getPtHubActivationChecklistModel(
      createActivationSummary({
        profileComplete: false,
        profilePublished: false,
        hasFirstClient: false,
        coreCompletedCount: 1,
      }),
    );

    expect(checklist?.nextItem?.id).toBe("profile");
    expect(checklist?.firstClientGuidance).not.toBeNull();
    expect(overviewSectionsSource).toContain(
      'checklist.nextItem?.id === "first-client"',
    );
  });

  it("removes first-client guidance after the first client exists", () => {
    const checklist = getPtHubActivationChecklistModel(
      createActivationSummary({
        profileComplete: true,
        profilePublished: true,
        hasFirstClient: true,
        firstClientId: "client-1",
        coreCompletedCount: 4,
      }),
    );

    expect(checklist?.firstClientGuidance).toBeNull();
    expect(
      checklist?.items.find((item) => item.id === "first-client"),
    ).toMatchObject({
      status: "complete",
      ctaLabel: "Open client",
    });
    expect(shouldShowPtHubActivationChecklist(checklist)).toBe(true);
  });

  it("routes the public application path to profile completion when incomplete", () => {
    expect(
      getPtHubFirstClientApplicationPath({
        profileComplete: false,
        profilePublished: false,
      }),
    ).toMatchObject({
      href: "/pt-hub/profile",
      ctaLabel: "Complete profile",
    });
  });

  it("routes the public application path to profile publishing when complete but unpublished", () => {
    expect(
      getPtHubFirstClientApplicationPath({
        profileComplete: true,
        profilePublished: false,
      }),
    ).toMatchObject({
      href: "/pt-hub/profile",
      ctaLabel: "Publish profile",
    });
  });

  it("routes the public application path to lead review when published", () => {
    expect(
      getPtHubFirstClientApplicationPath({
        profileComplete: true,
        profilePublished: true,
      }),
    ).toMatchObject({
      href: "/pt-hub/leads",
      ctaLabel: "Review leads",
    });
  });

  it("preserves activation loading and error state without requiring checklist data", () => {
    const model = getPtHubOverviewDashboardModel({
      stats: null,
      analytics: null,
      readiness: createReadiness(),
      profile: createProfile(),
      publicationState: createPublicationState(),
      workspaces: [],
      leads: [],
      clients: [],
      subscription: null,
      revenue: null,
      activationSummary: null,
      activationSummaryLoading: true,
      activationSummaryError: true,
    });

    expect(model.activationChecklist).toBeNull();
    expect(model.activationChecklistLoading).toBe(true);
    expect(model.activationChecklistError).toBe(true);
  });

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
      activationSummary: createActivationSummary(),
    });

    expect(model.mode).toBe("activation");
    expect(model.metrics.map((metric) => metric.label)).toEqual([
      "Monthly earnings",
      "Active clients",
      "New leads",
      "Check-ins due",
      "Onboarding in progress",
    ]);
    expect(model.activationChecklist?.nextItem?.id).toBe("profile");
    expect(model.actionItems.map((item) => item.id)).not.toContain(
      "profile-blockers",
    );
    expect(model.actionItems.map((item) => item.id)).not.toContain(
      "publish-profile",
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

  it("keeps normal action center content available after completed activation hides", () => {
    const model = getPtHubOverviewDashboardModel({
      stats: {
        activeWorkspaces: 1,
        activeClients: 1,
        applicationsThisWeek: 0,
        applicationsThisMonth: 0,
        applicationsPreviousWindow: 0,
        profileCompletionPercent: 100,
        subscriptionStatus: "Manual",
        latestWorkspaceId: "workspace-1",
        latestWorkspaceName: "Peak Performance",
        lastProfileUpdate: "2026-04-03T12:00:00.000Z",
        readyForPublish: true,
        missingSetupItems: [],
        businessHealthLabel: "Healthy momentum",
      },
      analytics: null,
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
      workspaces: [createWorkspace({ clientCount: 1 })],
      leads: [],
      clients: [createClient()],
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
        potentialActiveClients: 1,
      },
      activationSummary: createActivationSummary({
        profileComplete: true,
        profilePublished: true,
        hasFirstClient: true,
        firstClientId: "client-1",
        hasWorkoutAssigned: true,
        hasNutritionAssigned: true,
        hasCheckInAssigned: true,
        hasCoCoachInvitedOrActive: false,
        coreCompletedCount: 7,
      }),
    });

    expect(shouldShowPtHubActivationChecklist(model.activationChecklist)).toBe(
      false,
    );
    expect(model.actionItems.map((item) => item.id)).toContain(
      "billing-manual",
    );
    expect(model.actionItems.map((item) => item.id)).not.toContain(
      "start-lead-flow",
    );
  });
});

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getPtPublicationState } from "../../src/features/pt-hub/lib/pt-hub";
import type {
  PTAccountSettingsDraft,
  PTProfile,
  PTProfileReadiness,
} from "../../src/features/pt-hub/types";

const profileEditorSource = readFileSync(
  "src/features/pt-hub/components/pt-hub-profile-editor.tsx",
  "utf8",
);
const publicationPanelSource = readFileSync(
  "src/features/pt-hub/components/pt-hub-publication-panel.tsx",
  "utf8",
);

function createProfile(overrides: Partial<PTProfile> = {}): PTProfile {
  return {
    id: "profile-1",
    workspaceId: null,
    fullName: "Alex Coach",
    displayName: "Alex Coach",
    slug: "alex-coach",
    headline: "Strength coach",
    searchableHeadline: "strength coach",
    shortBio: "I help clients build strong habits.",
    specialties: ["Strength"],
    certifications: ["CPT"],
    coachingStyle: "Structured and accountable.",
    coachingModes: ["one_on_one"],
    availabilityModes: ["online"],
    locationLabel: "Riyadh",
    marketplaceVisible: false,
    isPublished: false,
    publishedAt: null,
    profilePhotoUrl: "https://example.com/photo.jpg",
    bannerImageUrl: "https://example.com/banner.jpg",
    socialLinks: [
      { platform: "instagram", label: "Instagram", url: "https://example.com" },
    ],
    testimonials: [],
    transformations: [],
    publicUrl: "/coach/alex-coach",
    completionPercent: 100,
    updatedAt: null,
    ...overrides,
  };
}

function createReadiness(
  overrides: Partial<PTProfileReadiness> = {},
): PTProfileReadiness {
  return {
    completionPercent: 100,
    readyForPublish: true,
    statusLabel: "Ready for publish",
    missingItems: [],
    checklist: [],
    ...overrides,
  };
}

function createSettings(
  overrides: Partial<PTAccountSettingsDraft> = {},
): PTAccountSettingsDraft {
  return {
    fullName: "Alex Coach",
    contactEmail: "alex@example.com",
    supportEmail: "",
    phone: "",
    country: "",
    timezone: "",
    city: "",
    clientAlerts: true,
    weeklyDigest: true,
    productUpdates: false,
    profileVisibility: "draft",
    subscriptionPlan: "Repsync Pro",
    subscriptionStatus: "Manual",
    ...overrides,
  };
}

describe("PT Hub publication simplification", () => {
  it("blocks publishing when readiness is incomplete", () => {
    const state = getPtPublicationState({
      profile: createProfile(),
      settings: createSettings({ profileVisibility: "listed" }),
      readiness: createReadiness({
        completionPercent: 80,
        readyForPublish: false,
        statusLabel: "Not ready",
        missingItems: ["Profile photo"],
      }),
    });

    expect(state.canPublish).toBe(false);
    expect(state.blockers).toEqual(["Profile photo"]);
  });

  it("allows publishing when profile is complete even without a separate listed state", () => {
    const state = getPtPublicationState({
      profile: createProfile({ isPublished: false }),
      settings: createSettings({ profileVisibility: "draft" }),
      readiness: createReadiness(),
    });

    expect(state.canPublish).toBe(true);
    expect(state.isPublished).toBe(false);
    expect(state.blockers).not.toContain(
      "Profile visibility must be set to Ready to list",
    );
  });

  it("blocks publishing when the public slug is invalid", () => {
    const state = getPtPublicationState({
      profile: createProfile({ slug: "Bad Slug" }),
      settings: createSettings({ profileVisibility: "listed" }),
      readiness: createReadiness(),
    });

    expect(state.canPublish).toBe(false);
    expect(state.blockers.join(" ")).toMatch(/lowercase letters/i);
  });

  it("maps published profiles to a public profile URL state", () => {
    const state = getPtPublicationState({
      profile: createProfile({ isPublished: true, marketplaceVisible: true }),
      settings: createSettings({ profileVisibility: "draft" }),
      readiness: createReadiness(),
    });

    expect(state.isPublished).toBe(true);
    expect(state.canPublish).toBe(true);
    expect(state.publicUrl).toBe("/p/alex-coach");
  });

  it("presents the simplified primary actions in the profile launch UI", () => {
    expect(profileEditorSource).toContain("Finish profile");
    expect(profileEditorSource).toContain("Publish profile");
    expect(profileEditorSource).toContain("View public profile");
    expect(profileEditorSource).toContain("Copy link");
  });

  it("keeps unpublish available as a low-emphasis published profile action", () => {
    expect(profileEditorSource).toContain("Unpublish profile");
    expect(profileEditorSource).toContain("onTogglePublish(false)");
    expect(profileEditorSource).toContain('variant="ghost"');
  });

  it("does not present ready to list as a separate profile publish action", () => {
    expect(profileEditorSource).not.toContain("Ready to list");
    expect(publicationPanelSource).not.toContain("Ready to list");
    expect(profileEditorSource).not.toContain("Profile visibility must be set");
    expect(publicationPanelSource).not.toContain(
      "Profile visibility must be set",
    );
  });
});

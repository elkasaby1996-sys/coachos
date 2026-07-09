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
const globalsSource = readFileSync("src/styles/globals.css", "utf8");

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

  it("restores profile cleanup without changing the editor grid flow", () => {
    expect(profileEditorSource).toContain(
      'className="pt-hub-work-grid xl:grid-cols-[minmax(0,1.36fr)_360px]"',
    );
    expect(profileEditorSource).toContain(
      '<Tabs value={activeTab} onValueChange={setActiveTab} className="min-w-0">',
    );
    expect(profileEditorSource).toContain(
      'className="xl:sticky xl:top-28 xl:col-start-2 xl:row-start-1 xl:self-start"',
    );
    expect(profileEditorSource).not.toContain(
      'className="min-w-0 xl:contents"',
    );
  });

  it("keeps profile step navigation free of helper descriptions", () => {
    expect(profileEditorSource).not.toContain("{step.description}");
    expect(profileEditorSource).toContain(
      '"min-w-[6.75rem] gap-2 sm:min-w-[7.25rem] xl:min-w-0 xl:flex-1"',
    );
  });

  it("keeps profile step navigation centered with stable dimensions", () => {
    expect(profileEditorSource).toContain(
      "xl:justify-center xl:overflow-visible",
    );
    expect(profileEditorSource).toContain(
      "pt-hub-profile-step-trigger group flex items-center justify-center",
    );
    expect(profileEditorSource).toContain(
      '"relative z-10 min-w-0 text-center"',
    );
    expect(globalsSource).toContain(
      "@apply relative inline-flex h-[3rem] shrink-0 items-center justify-center",
    );
    expect(profileEditorSource).not.toContain("xl:flex-[1.15]");
  });

  it("uses a single-layer check icon for completed profile steps", () => {
    const stepRailStart = profileEditorSource.indexOf(
      "profileBuilderSteps.map",
    );
    const launchPrioritiesStart = profileEditorSource.indexOf(
      "{showLaunchPriorities ? (",
    );
    const stepRailSource = profileEditorSource.slice(
      stepRailStart,
      launchPrioritiesStart,
    );

    expect(stepRailSource).toContain("<CheckCircle2");
    expect(stepRailSource).toContain(
      'className="relative z-10 h-4.5 w-4.5 shrink-0 text-success"',
    );
    expect(stepRailSource).not.toContain(
      'isComplete\n                      ? "border-success/40 bg-success/12 text-success"',
    );
  });

  it("hides launch priorities once the profile is complete and published", () => {
    expect(profileEditorSource).toContain("showLaunchPriorities");
    expect(profileEditorSource).toContain("!publicationState.isPublished");
    expect(profileEditorSource).toContain("!readiness.readyForPublish");
    expect(profileEditorSource).toContain("{showLaunchPriorities ? (");
  });

  it("does not duplicate publish state inside the mini live preview", () => {
    const livePreviewStart = profileEditorSource.indexOf(
      "function PtHubLiveProfilePreview",
    );
    const createDraftStart = profileEditorSource.indexOf(
      "function createDraft",
    );
    const livePreviewSource = profileEditorSource.slice(
      livePreviewStart,
      createDraftStart,
    );

    expect(livePreviewSource).not.toContain("form.isPublished");
    expect(livePreviewSource).not.toContain(
      '<Badge variant={form.isPublished ? "success" : "secondary"}>',
    );
    expect(livePreviewSource).not.toContain(
      '{form.isPublished ? "Published" : "Draft"}',
    );
  });

  it("keeps profile form helper copy compact", () => {
    expect(profileEditorSource).not.toContain(
      "Use the name clients should recognize on your public profile.",
    );
    expect(profileEditorSource).not.toContain(
      "Name the audience, the outcome, and the training edge",
    );
    expect(profileEditorSource).not.toContain(
      "Keep this focused on your method, client fit, and proof.",
    );
    expect(profileEditorSource).not.toContain(
      "Add focused lanes prospects can scan quickly.",
    );
    expect(profileEditorSource).not.toContain(
      "Add credentials that support your authority.",
    );
  });

  it("keeps long proof guidance behind click-friendly info hints", () => {
    expect(profileEditorSource).toContain(
      '<InfoHint label="Coaching style guidance">',
    );
    expect(profileEditorSource).toContain(
      '<InfoHint label="Transformation proof guidance">',
    );
    expect(profileEditorSource).toContain("function InfoHint");
    expect(profileEditorSource).toContain("aria-expanded={open}");
    expect(profileEditorSource).toContain('role="tooltip"');
    expect(profileEditorSource).toContain("<Info");
    expect(profileEditorSource).not.toContain("<TooltipContent");
  });

  it("uses tag entry for profile locations", () => {
    expect(profileEditorSource).toContain(
      'const [locationInput, setLocationInput] = useState("");',
    );
    expect(profileEditorSource).toContain(
      "const locationValues = inputToList(form.locationLabel);",
    );
    expect(profileEditorSource).toContain('label="Location"');
    expect(profileEditorSource).toContain("values={locationValues}");
    expect(profileEditorSource).toContain("value={locationInput}");
    expect(profileEditorSource).toContain("onValueChange={setLocationInput}");
    expect(profileEditorSource).toContain(
      "locationLabel: listToInput(nextValues)",
    );
    expect(profileEditorSource).not.toContain(
      "locationLabel: event.target.value",
    );
  });

  it("uses the full profile preview inside the existing preview tab", () => {
    expect(profileEditorSource).toContain("getDraftProfilePreviewData");
    expect(profileEditorSource).toContain("usePtPackages");
    expect(profileEditorSource).toContain(
      "mapPublicPtPackageOptionsFromPackages",
    );
    expect(profileEditorSource).toContain("<PtHubProfilePreview");
    expect(profileEditorSource).toContain("profile={previewData}");
    expect(profileEditorSource).toContain("packageOptions={packageOptions}");
    expect(profileEditorSource).not.toContain("Public profile preview");
    expect(profileEditorSource).not.toContain("Draft preview");
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

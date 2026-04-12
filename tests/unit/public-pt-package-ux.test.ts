import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { PublicPtProfileView } from "../../src/features/pt-public/components/public-pt-profile-view";
import {
  resolvePublicPackageSelection,
  shouldRenderPublicPackagesSection,
} from "../../src/features/pt-public/lib/public-pt-package-ux";
import type {
  PTPublicApplicantIdentity,
  PTPublicPackageOption,
  PTPublicProfile,
} from "../../src/features/pt-hub/types";

const baseProfile: PTPublicProfile = {
  userId: "coach-1",
  fullName: "Coach Prime",
  displayName: "Coach Prime",
  slug: "coach-prime",
  headline: "Strength and conditioning coach",
  searchableHeadline: "Strength and conditioning coach",
  shortBio: "Helping clients build strength sustainably.",
  specialties: ["Strength"],
  certifications: ["CSCS"],
  coachingStyle: "Structured, progressive, and measurable.",
  coachingModes: ["programming"],
  availabilityModes: ["online"],
  locationLabel: "Riyadh",
  marketplaceVisible: true,
  publishedAt: new Date().toISOString(),
  profilePhotoUrl: null,
  bannerImageUrl: null,
  socialLinks: [],
  testimonials: [],
  transformations: [],
  publicUrl: "/coach/coach-prime",
};

const applicantIdentity: PTPublicApplicantIdentity = {
  isAuthenticated: true,
  email: "applicant@example.com",
  fullName: "Applicant",
  phone: "",
};

function makePackage(id: string, label: string): PTPublicPackageOption {
  return {
    id,
    label,
    subtitle: "Personalized training",
    description: "Weekly programming\nCoach check-ins",
    priceLabel: "$250",
    billingCadenceLabel: "every 4 weeks",
    features: ["Weekly programming", "Coach check-ins"],
    ctaLabel: "Apply now",
  };
}

describe("public PT package UX helpers", () => {
  it("marks package section visible only when packages exist", () => {
    expect(shouldRenderPublicPackagesSection([])).toBe(false);
    expect(
      shouldRenderPublicPackagesSection([makePackage("pkg-1", "Strength")]),
    ).toBe(true);
  });

  it("resolves CTA preselection into the apply field payload", () => {
    const resolution = resolvePublicPackageSelection({
      packageOptions: [makePackage("pkg-1", "Strength Build")],
      currentPackageId: "",
      requestedPackageId: "pkg-1",
    });

    expect(resolution).toMatchObject({
      packageInterestId: "pkg-1",
      packageInterestLabelSnapshot: "Strength Build",
      selectedLabel: "Strength Build",
      notice: null,
    });
  });

  it("returns a clean notice when selected package is stale", () => {
    const resolution = resolvePublicPackageSelection({
      packageOptions: [makePackage("pkg-1", "Strength Build")],
      currentPackageId: "pkg-old",
    });

    expect(resolution.packageInterestId).toBe("");
    expect(resolution.packageInterestLabelSnapshot).toBe("");
    expect(resolution.notice).toMatch(/no longer available/i);
  });

  it("keeps package selection optional when no public packages exist", () => {
    const resolution = resolvePublicPackageSelection({
      packageOptions: [],
      currentPackageId: "",
      requestedPackageId: "pkg-any",
    });

    expect(resolution).toMatchObject({
      packageInterestId: "",
      packageInterestLabelSnapshot: "",
      selectedLabel: null,
      notice: null,
    });
  });
});

describe("public profile package section rendering", () => {
  it("renders package sections when packages exist and places mobile packages before apply form", () => {
    const html = renderToStaticMarkup(
      createElement(PublicPtProfileView, {
        profile: baseProfile,
        applicantIdentity,
        packageOptions: [
          makePackage("pkg-1", "Strength Build"),
          makePackage("pkg-2", "Performance Boost"),
        ],
      }),
    );

    expect(html).toContain('data-testid="packages-section-desktop"');
    expect(html).toContain('data-testid="packages-section-mobile"');

    const mobileSectionIndex = html.indexOf('data-testid="packages-section-mobile"');
    const applyFormIndex = html.indexOf('id="public-pt-apply-form"');
    expect(mobileSectionIndex).toBeGreaterThan(-1);
    expect(applyFormIndex).toBeGreaterThan(-1);
    expect(mobileSectionIndex).toBeLessThan(applyFormIndex);
  });

  it("hides package sections when no packages exist", () => {
    const html = renderToStaticMarkup(
      createElement(PublicPtProfileView, {
        profile: baseProfile,
        applicantIdentity,
        packageOptions: [],
      }),
    );

    expect(html).not.toContain('data-testid="packages-section-desktop"');
    expect(html).not.toContain('data-testid="packages-section-mobile"');
  });
});

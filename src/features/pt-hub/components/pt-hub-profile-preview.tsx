import { getPublicCoachUrl } from "../lib/pt-hub";
import type { PTProfilePreviewData, PTPublicProfile } from "../types";
import { PublicPtProfileView } from "../../pt-public/components/public-pt-profile-view";

export function PtHubProfilePreview({
  profile,
  statusBadges,
}: {
  profile: PTProfilePreviewData;
  statusBadges?: Array<{
    label: string;
    tone?: "success" | "secondary";
  }>;
}) {
  const publicProfile: PTPublicProfile = {
    userId: "preview",
    fullName: profile.fullName,
    displayName: profile.displayName,
    slug: profile.slug || "preview-coach",
    headline: profile.headline,
    searchableHeadline: profile.searchableHeadline,
    shortBio: profile.shortBio,
    specialties: profile.specialties,
    certifications: profile.certifications,
    coachingStyle: profile.coachingStyle,
    coachingModes: profile.coachingModes,
    availabilityModes: profile.availabilityModes,
    locationLabel: profile.locationLabel,
    marketplaceVisible: profile.marketplaceVisible,
    publishedAt: profile.isPublished ? new Date().toISOString() : null,
    profilePhotoUrl: profile.profilePhotoUrl,
    bannerImageUrl: profile.bannerImageUrl,
    socialLinks: profile.socialLinks.filter((link) => link.url.trim()),
    testimonials: profile.testimonials,
    transformations: profile.transformations,
    publicUrl:
      profile.publicUrl ??
      getPublicCoachUrl(profile.slug || "preview-coach") ??
      `/coach/${profile.slug || "preview-coach"}`,
  };

  return (
    <PublicPtProfileView
      profile={publicProfile}
      preview
      previewStatusBadges={statusBadges}
    />
  );
}

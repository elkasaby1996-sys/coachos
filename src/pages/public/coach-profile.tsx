import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "../../components/ui/button";
import { AppShellBackgroundLayer } from "../../components/common/app-shell-background";
import { EmptyState } from "../../components/ui/coachos/empty-state";
import { PublicPtProfileView } from "../../features/pt-public/components/public-pt-profile-view";
import {
  submitPublicPtApplication,
  usePublicPtPackageOptions,
  usePublicPtProfile,
} from "../../features/pt-hub/lib/pt-hub";
import { useBootstrapAuth, useSessionAuth } from "../../lib/auth";
import { PublicLayout } from "./public-site-shell";

function setPublicProfileMeta(params: {
  title: string;
  description: string;
  canonicalPath: string;
  robots: string;
  imageUrl?: string | null;
}) {
  const ensureMeta = (selector: string, create: () => HTMLMetaElement) => {
    const existing = document.head.querySelector<HTMLMetaElement>(selector);
    if (existing) return existing;
    const tag = create();
    document.head.appendChild(tag);
    return tag;
  };
  const ensureLink = (selector: string, create: () => HTMLLinkElement) => {
    const existing = document.head.querySelector<HTMLLinkElement>(selector);
    if (existing) return existing;
    const tag = create();
    document.head.appendChild(tag);
    return tag;
  };

  const origin = window.location.origin;
  const imageUrl = params.imageUrl || `${origin}/og-repsync.png`;
  document.documentElement.lang = "en";
  document.title = params.title;
  ensureMeta('meta[name="description"]', () => {
    const tag = document.createElement("meta");
    tag.name = "description";
    return tag;
  }).content = params.description;
  ensureMeta('meta[name="robots"]', () => {
    const tag = document.createElement("meta");
    tag.name = "robots";
    return tag;
  }).content = params.robots;
  ensureMeta('meta[property="og:title"]', () => {
    const tag = document.createElement("meta");
    tag.setAttribute("property", "og:title");
    return tag;
  }).content = params.title;
  ensureMeta('meta[property="og:description"]', () => {
    const tag = document.createElement("meta");
    tag.setAttribute("property", "og:description");
    return tag;
  }).content = params.description;
  ensureMeta('meta[property="og:url"]', () => {
    const tag = document.createElement("meta");
    tag.setAttribute("property", "og:url");
    return tag;
  }).content = `${origin}${params.canonicalPath}`;
  ensureMeta('meta[property="og:image"]', () => {
    const tag = document.createElement("meta");
    tag.setAttribute("property", "og:image");
    return tag;
  }).content = imageUrl;
  ensureMeta('meta[property="og:type"]', () => {
    const tag = document.createElement("meta");
    tag.setAttribute("property", "og:type");
    return tag;
  }).content = "profile";
  ensureMeta('meta[name="twitter:card"]', () => {
    const tag = document.createElement("meta");
    tag.name = "twitter:card";
    return tag;
  }).content = "summary_large_image";
  ensureMeta('meta[name="twitter:title"]', () => {
    const tag = document.createElement("meta");
    tag.name = "twitter:title";
    return tag;
  }).content = params.title;
  ensureMeta('meta[name="twitter:description"]', () => {
    const tag = document.createElement("meta");
    tag.name = "twitter:description";
    return tag;
  }).content = params.description;
  ensureMeta('meta[name="twitter:image"]', () => {
    const tag = document.createElement("meta");
    tag.name = "twitter:image";
    return tag;
  }).content = imageUrl;
  ensureLink('link[rel="canonical"]', () => {
    const tag = document.createElement("link");
    tag.rel = "canonical";
    return tag;
  }).href = `${origin}${params.canonicalPath}`;

  let structuredData = document.head.querySelector<HTMLScriptElement>(
    "#repsync-public-structured-data",
  );
  if (!structuredData) {
    structuredData = document.createElement("script");
    structuredData.id = "repsync-public-structured-data";
    structuredData.type = "application/ld+json";
    document.head.appendChild(structuredData);
  }
  structuredData.text = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "ProfilePage",
    name: params.title,
    description: params.description,
    url: `${origin}${params.canonicalPath}`,
    primaryImageOfPage: imageUrl,
    isPartOf: { "@type": "WebSite", name: "RepSync", url: origin },
  });
}

export function PublicCoachProfilePage() {
  const { slug, ptSlug } = useParams<{ slug: string; ptSlug: string }>();
  const resolvedSlug = ptSlug ?? slug;
  const { session } = useSessionAuth();
  const { clientProfile } = useBootstrapAuth();
  const profileQuery = usePublicPtProfile(resolvedSlug);
  const packageOptionsQuery = usePublicPtPackageOptions(
    profileQuery.data?.userId,
  );
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setSuccess(false);
    setError(null);
  }, [resolvedSlug]);

  useEffect(() => {
    if (profileQuery.isLoading) {
      setPublicProfileMeta({
        title: "Loading coach profile | RepSync",
        description: "Loading a RepSync public coach profile.",
        canonicalPath: resolvedSlug ? `/p/${resolvedSlug}` : "/coaches",
        robots: "noindex,nofollow",
      });
      return;
    }

    if (profileQuery.error || !profileQuery.data) {
      setPublicProfileMeta({
        title: "Coach profile unavailable | RepSync",
        description:
          "This RepSync public coach profile is unavailable, unpublished, or no longer valid.",
        canonicalPath: resolvedSlug ? `/p/${resolvedSlug}` : "/coaches",
        robots: "noindex,nofollow",
      });
      return;
    }

    const profile = profileQuery.data;
    const displayName =
      profile.displayName || profile.fullName || "RepSync coach";
    const description =
      profile.headline?.trim() ||
      profile.shortBio?.trim() ||
      `View ${displayName}'s published RepSync coach profile and application.`;
    setPublicProfileMeta({
      title: `${displayName} | RepSync Coach Profile`,
      description: description.slice(0, 155),
      canonicalPath: `/p/${profile.slug}`,
      robots: "index,follow",
      imageUrl: profile.bannerImageUrl || profile.profilePhotoUrl,
    });
  }, [
    profileQuery.data,
    profileQuery.error,
    profileQuery.isLoading,
    resolvedSlug,
  ]);

  if (profileQuery.isLoading) {
    return (
      <PublicLayout>
        <div className="theme-shell-canvas relative isolate min-h-screen overflow-hidden px-4 pb-10 pt-32 text-foreground">
          <AppShellBackgroundLayer />
          <div className="relative z-10 mx-auto max-w-5xl">
            <EmptyState
              title="Loading coach profile"
              description="Rendering the public coach page..."
            />
          </div>
        </div>
      </PublicLayout>
    );
  }

  if (profileQuery.error || !profileQuery.data) {
    return (
      <PublicLayout>
        <div className="theme-shell-canvas relative isolate min-h-screen overflow-hidden px-4 pb-10 pt-32 text-foreground">
          <AppShellBackgroundLayer />
          <div className="relative z-10 mx-auto max-w-3xl space-y-4">
            <Button asChild variant="ghost">
              <Link to="/coaches">
                <ArrowLeft className="h-4 w-4" />
                Back to coach marketplace
              </Link>
            </Button>
            <EmptyState
              title="Coach profile not found"
              description="This public coach page is either unpublished or the link is no longer valid."
            />
          </div>
        </div>
      </PublicLayout>
    );
  }

  const userMetadata = session?.user?.user_metadata ?? {};
  const metadataFullName =
    typeof userMetadata.full_name === "string" && userMetadata.full_name.trim()
      ? userMetadata.full_name.trim()
      : typeof userMetadata.name === "string" && userMetadata.name.trim()
        ? userMetadata.name.trim()
        : "";
  const identityFullName =
    clientProfile?.full_name?.trim() ||
    clientProfile?.display_name?.trim() ||
    metadataFullName;
  const identityPhone = clientProfile?.phone?.trim() || "";
  const identityEmail = session?.user?.email?.trim().toLowerCase() || "";
  const packageOptions = packageOptionsQuery.data ?? [];

  return (
    <PublicLayout>
      <div className="relative min-h-screen overflow-x-hidden bg-[#FBF9F1] pt-[74px] text-foreground">
        {error ? (
          <div className="fixed inset-x-0 top-24 z-50 px-4 sm:px-6">
            <div className="mx-auto max-w-xl rounded-[8px] border border-warning/30 bg-[#FBF9F1] px-4 py-3 text-sm text-warning shadow-lg">
              {error}
            </div>
          </div>
        ) : null}

        <PublicPtProfileView
          profile={profileQuery.data}
          submitting={submitting}
          success={success}
          applicantIdentity={{
            isAuthenticated: Boolean(session?.user),
            email: identityEmail,
            fullName: identityFullName,
            phone: identityPhone,
          }}
          packageOptions={packageOptions}
          onSubmitApplication={async (input) => {
            setSubmitting(true);
            setError(null);
            try {
              await submitPublicPtApplication(input);
              setSuccess(true);
            } catch (submissionError) {
              setError(
                submissionError instanceof Error
                  ? submissionError.message
                  : "Unable to submit your application right now.",
              );
            } finally {
              setSubmitting(false);
            }
          }}
        />
      </div>
    </PublicLayout>
  );
}

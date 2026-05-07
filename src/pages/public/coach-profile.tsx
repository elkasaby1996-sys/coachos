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

export function PublicCoachProfilePage() {
  const { slug } = useParams<{ slug: string }>();
  const { session } = useSessionAuth();
  const { clientProfile } = useBootstrapAuth();
  const profileQuery = usePublicPtProfile(slug);
  const packageOptionsQuery = usePublicPtPackageOptions(profileQuery.data?.userId);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setSuccess(false);
    setError(null);
  }, [slug]);

  if (profileQuery.isLoading) {
    return (
      <div className="theme-shell-canvas relative isolate min-h-screen overflow-hidden px-4 py-10 text-foreground">
        <AppShellBackgroundLayer />
        <div className="relative z-10 mx-auto max-w-5xl">
          <EmptyState
            title="Loading coach profile"
            description="Rendering the public coach page..."
          />
        </div>
      </div>
    );
  }

  if (profileQuery.error || !profileQuery.data) {
    return (
      <div className="theme-shell-canvas relative isolate min-h-screen overflow-hidden px-4 py-10 text-foreground">
        <AppShellBackgroundLayer />
        <div className="relative z-10 mx-auto max-w-3xl space-y-4">
          <Button asChild variant="ghost">
            <Link to="/">
              <ArrowLeft className="h-4 w-4" />
              Back to Repsync
            </Link>
          </Button>
          <EmptyState
            title="Coach profile not found"
            description="This public coach page is either unpublished or the link is no longer valid."
          />
        </div>
      </div>
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
    <div className="theme-shell-canvas relative isolate min-h-screen overflow-hidden text-foreground">
      <AppShellBackgroundLayer />
      <div className="relative z-10">
        <div className="absolute left-0 right-0 top-0 z-10 px-4 pt-4 sm:px-6">
          <div className="mx-auto max-w-7xl">
            <Button
              asChild
              variant="secondary"
              className="rounded-full border border-border/70 bg-card/72 backdrop-blur-xl"
            >
              <Link to="/">
                <ArrowLeft className="h-4 w-4" />
                Repsync
              </Link>
            </Button>
          </div>
        </div>

        {error ? (
          <div className="absolute inset-x-0 top-20 z-10 px-4 sm:px-6">
            <div className="mx-auto max-w-xl rounded-[22px] border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning backdrop-blur-xl">
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
    </div>
  );
}

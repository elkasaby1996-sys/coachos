import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "../../components/ui/button";
import { EmptyState } from "../../components/ui/coachos/empty-state";
import { PublicPtProfileView } from "../../features/pt-public/components/public-pt-profile-view";
import {
  submitPublicPtApplication,
  usePublicPtProfile,
} from "../../features/pt-hub/lib/pt-hub";

export function PublicCoachProfilePage() {
  const { slug } = useParams<{ slug: string }>();
  const profileQuery = usePublicPtProfile(slug);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setSuccess(false);
    setError(null);
  }, [slug]);

  if (profileQuery.isLoading) {
    return (
      <div className="min-h-screen bg-background px-4 py-10 text-foreground">
        <div className="mx-auto max-w-5xl">
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
      <div className="min-h-screen bg-background px-4 py-10 text-foreground">
        <div className="mx-auto max-w-3xl space-y-4">
          <Button asChild variant="ghost">
            <Link to="/">
              <ArrowLeft className="h-4 w-4" />
              Back to CoachOS
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

  return (
    <div className="relative">
      <div className="absolute left-0 right-0 top-0 z-10 px-4 pt-4 sm:px-6">
        <div className="mx-auto max-w-7xl">
          <Button asChild variant="ghost" className="bg-background/40 backdrop-blur">
            <Link to="/">
              <ArrowLeft className="h-4 w-4" />
              CoachOS
            </Link>
          </Button>
        </div>
      </div>

      {error ? (
        <div className="absolute inset-x-0 top-20 z-10 px-4 sm:px-6">
          <div className="mx-auto max-w-xl rounded-2xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning">
            {error}
          </div>
        </div>
      ) : null}

      <PublicPtProfileView
        profile={profileQuery.data}
        submitting={submitting}
        success={success}
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
  );
}

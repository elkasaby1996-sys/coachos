import { Link } from "react-router-dom";
import { Button } from "../../components/ui/button";
import { PtHubPageHeader } from "../../features/pt-hub/components/pt-hub-page-header";
import { PtHubProfilePreview } from "../../features/pt-hub/components/pt-hub-profile-preview";
import {
  getPtProfilePreviewData,
  usePtHubPublicationState,
  usePtHubProfile,
  usePtHubProfileReadiness,
} from "../../features/pt-hub/lib/pt-hub";

export function PtHubProfilePreviewPage() {
  const profileQuery = usePtHubProfile();
  const readinessQuery = usePtHubProfileReadiness();
  const publicationQuery = usePtHubPublicationState();
  const previewData = getPtProfilePreviewData(profileQuery.data);

  return (
    <section className="space-y-6">
      <PtHubPageHeader
        eyebrow="Profile Preview"
        title="Preview your public profile"
        description="See how your public trainer page will look before you share it."
        actions={
          <>
            {publicationQuery.data?.publicUrl ? (
              <Button asChild variant="ghost">
                <a
                  href={publicationQuery.data.publicUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open public page
                </a>
              </Button>
            ) : null}
            <Button asChild variant="secondary">
              <Link to="/pt-hub/profile">Back to editor</Link>
            </Button>
          </>
        }
      />

      {previewData ? (
        <div className="space-y-6">
          <PtHubProfilePreview
            profile={previewData}
            statusBadges={[
              {
                label: publicationQuery.data?.isPublished
                  ? "Published"
                  : "Unpublished",
                tone: publicationQuery.data?.isPublished ? "success" : "secondary",
              },
              ...(readinessQuery.data
                ? [
                    {
                      label: `${readinessQuery.data.completionPercent}% ready`,
                      tone: "secondary" as const,
                    },
                  ]
                : []),
            ]}
          />
        </div>
      ) : (
        <div className="rounded-[28px] border border-border/70 bg-card/80 p-8 text-sm text-muted-foreground">
          No profile data yet. Add profile details first to see the preview.
        </div>
      )}
    </section>
  );
}

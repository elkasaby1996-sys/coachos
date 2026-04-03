import { Link } from "react-router-dom";
import { Button } from "../../components/ui/button";
import { PtHubPageHeader } from "../../features/pt-hub/components/pt-hub-page-header";
import { PtHubProfilePreview } from "../../features/pt-hub/components/pt-hub-profile-preview";
import { PtHubReadinessPanel } from "../../features/pt-hub/components/pt-hub-readiness-panel";
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
          {readinessQuery.data ? (
            <div className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
              <PtHubReadinessPanel readiness={readinessQuery.data} compact />
              <div className="rounded-[24px] border border-border/70 bg-background/30 px-5 py-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                  Preview context
                </p>
                <p className="mt-2 text-base font-medium text-foreground">
                  This uses the same public profile layout potential clients will see.
                </p>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  Use it to check your messaging, proof, and calls to action before sharing your page.
                </p>
              </div>
            </div>
          ) : null}
          <PtHubProfilePreview profile={previewData} />
        </div>
      ) : (
        <div className="rounded-[28px] border border-border/70 bg-card/80 p-8 text-sm text-muted-foreground">
          No profile data yet. Add profile details first to see the preview.
        </div>
      )}
    </section>
  );
}

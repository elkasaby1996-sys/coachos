import { AlertTriangle, ExternalLink, EyeOff, Globe } from "lucide-react";
import { Link } from "react-router-dom";
import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import type { PTPublicationState } from "../types";
import { PtHubSectionCard } from "./pt-hub-section-card";

export function PtHubPublicationPanel({
  publicationState,
  publishing,
  onTogglePublish,
}: {
  publicationState: PTPublicationState;
  publishing: boolean;
  onTogglePublish: (nextPublished: boolean) => Promise<void>;
}) {
  return (
    <PtHubSectionCard
      title="Publishing controls"
      description="Control whether this trainer profile is publicly reachable and ready for future marketplace inclusion."
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={publicationState.isPublished ? "default" : "muted"}>
            {publicationState.isPublished ? "Published" : "Unpublished"}
          </Badge>
          <Badge variant="secondary">{publicationState.marketplaceStatus}</Badge>
        </div>

        <div className="space-y-2">
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
            Public URL
          </p>
          <p className="mt-2 break-all text-sm text-foreground">
            {publicationState.publicUrl ?? "Add a slug to generate a public URL."}
          </p>
          {publicationState.publicUrl ? (
            <div className="mt-3 flex flex-wrap gap-2">
              <Button asChild size="sm" variant="secondary">
                <a href={publicationState.publicUrl} target="_blank" rel="noreferrer">
                  Open public page
                  <ExternalLink className="h-4 w-4" />
                </a>
              </Button>
              <Button asChild size="sm" variant="ghost">
                <Link to="/pt-hub/profile/preview">Internal preview</Link>
              </Button>
            </div>
          ) : null}
        </div>

        {!publicationState.canPublish && !publicationState.isPublished ? (
          <div className="rounded-[22px] bg-warning/10 p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 text-warning" />
              <div className="space-y-2">
                <p className="text-sm font-medium text-foreground">
                  Publishing is blocked
                </p>
                <div className="flex flex-wrap gap-2">
                  {publicationState.blockers.map((blocker) => (
                    <Badge key={blocker} variant="muted">
                      {blocker}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ) : null}

        <Button
          className="w-full justify-between"
          disabled={publishing || (!publicationState.canPublish && !publicationState.isPublished)}
          onClick={() => onTogglePublish(!publicationState.isPublished)}
        >
          {publicationState.isPublished ? (
            <>
              Unpublish profile
              <EyeOff className="h-4 w-4" />
            </>
          ) : (
            <>
              Publish profile
              <Globe className="h-4 w-4" />
            </>
          )}
        </Button>
      </div>
    </PtHubSectionCard>
  );
}

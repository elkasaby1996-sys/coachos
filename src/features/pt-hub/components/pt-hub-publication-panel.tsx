import { AlertTriangle, ExternalLink, EyeOff, Globe } from "lucide-react";
import { Link } from "react-router-dom";
import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import { getSemanticBadgeVariant } from "../../../lib/semantic-status";
import type {
  PTAccountSettingsDraft,
  PTProfileReadiness,
  PTPublicationState,
} from "../types";
import { PtHubSectionCard } from "./pt-hub-section-card";

export function PtHubPublicationPanel({
  publicationState,
  readiness,
  profileVisibility,
  publishing,
  updatingVisibility,
  onProfileVisibilityChange,
  onTogglePublish,
}: {
  publicationState: PTPublicationState;
  readiness: PTProfileReadiness;
  profileVisibility: PTAccountSettingsDraft["profileVisibility"];
  publishing: boolean;
  updatingVisibility: boolean;
  onProfileVisibilityChange: (
    nextVisibility: PTAccountSettingsDraft["profileVisibility"],
  ) => Promise<void>;
  onTogglePublish: (nextPublished: boolean) => Promise<void>;
}) {
  return (
    <PtHubSectionCard
      title="Publish status"
      actions={
        <Badge
          variant={getSemanticBadgeVariant(
            publicationState.isPublished ? "Published" : "Unpublished",
          )}
        >
          {publicationState.isPublished ? "Published" : "Unpublished"}
        </Badge>
      }
      contentClassName="space-y-4"
    >
      <div className="space-y-4">
        <div className="space-y-3 rounded-[24px] border border-border/60 bg-background/34 px-4 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={getSemanticBadgeVariant(readiness.statusLabel)}>
                {readiness.statusLabel}
              </Badge>
              <Badge variant="info">{readiness.completionPercent}% ready</Badge>
            </div>
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Profile readiness
            </p>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div
              className={
                readiness.readyForPublish ? "h-full rounded-full bg-success" : "h-full rounded-full bg-warning"
              }
              style={{ width: `${readiness.completionPercent}%` }}
            />
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
            Profile visibility
          </p>
          <div className="flex flex-wrap gap-2">
            {([
              { value: "draft", label: "Draft" },
              { value: "private", label: "Private" },
              { value: "listed", label: "Ready to list" },
            ] as const).map((option) => (
              <Button
                key={option.value}
                type="button"
                size="sm"
                variant={
                  profileVisibility === option.value ? "default" : "secondary"
                }
                disabled={publishing || updatingVisibility}
                onClick={() => void onProfileVisibilityChange(option.value)}
              >
                {option.label}
              </Button>
            ))}
          </div>
          <p className="text-sm text-muted-foreground">
            Profile visibility must be set to Ready to list.
          </p>
        </div>

        <div className="space-y-2">
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
            Public URL
          </p>
          {publicationState.publicUrl ? (
            <div className="space-y-3">
              <a
                href={publicationState.publicUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 break-all text-sm text-primary transition-colors hover:text-foreground"
              >
                {publicationState.publicUrl}
                <ExternalLink className="h-3.5 w-3.5 shrink-0" />
              </a>
              <div className="flex flex-wrap gap-2">
                <Button asChild size="sm" variant="secondary">
                  <Link to="/pt-hub/profile/preview">Internal view</Link>
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Add a slug to create the public URL.
            </p>
          )}
        </div>

        {!publicationState.canPublish && !publicationState.isPublished ? (
          <div className="space-y-2 rounded-[22px] border border-warning/22 bg-warning/12 p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 text-warning" />
              <p className="text-sm font-medium text-foreground">
                Finish these before publishing.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {publicationState.blockers.map((blocker) => (
                <Badge key={blocker} variant="warning">
                  {blocker}
                </Badge>
              ))}
            </div>
          </div>
        ) : null}

        <Button
          className="w-full justify-between"
          disabled={
            publishing ||
            updatingVisibility ||
            (!publicationState.canPublish && !publicationState.isPublished)
          }
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

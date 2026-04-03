import {
  CheckCircle2,
  CircleAlert,
  CircleDashed,
  Sparkles,
} from "lucide-react";
import { Link } from "react-router-dom";
import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import type { PTProfileReadiness } from "../types";
import { PtHubSectionCard } from "./pt-hub-section-card";

export function PtHubReadinessPanel({
  readiness,
  compact = false,
}: {
  readiness: PTProfileReadiness;
  compact?: boolean;
}) {
  const missingChecklist = readiness.checklist.filter((item) => !item.complete);
  const topGuidance = missingChecklist.slice(0, compact ? 2 : 4);

  return (
    <PtHubSectionCard
      title={compact ? "Profile readiness" : "Public profile readiness"}
      description={
        compact
          ? "How close your public trainer page is to being ready to share."
          : "A checklist for getting your public trainer page ready to share."
      }
    >
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                variant={readiness.readyForPublish ? "success" : "warning"}
              >
                {readiness.statusLabel}
              </Badge>
              <Badge variant="secondary">
                {readiness.completionPercent}% complete
              </Badge>
            </div>
            <p className="mt-3 text-4xl font-semibold tracking-tight text-foreground">
              {readiness.completionPercent}%
            </p>
          </div>
          <div className="rounded-2xl border border-border/60 bg-background/40 p-3 text-primary">
            <Sparkles className="h-5 w-5 [stroke-width:1.7]" />
          </div>
        </div>

        <div className="h-2 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-[width]"
            style={{ width: `${readiness.completionPercent}%` }}
          />
        </div>

        {compact ? (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              {readiness.readyForPublish
                ? "Your profile has the key details needed to go live."
                : `${readiness.missingItems.length} item(s) still need attention before you share it.`}
            </p>
            {!readiness.readyForPublish ? (
              <div className="flex flex-wrap gap-2">
                {readiness.missingItems.slice(0, 3).map((item) => (
                  <Badge key={item} variant="muted">
                    {item}
                  </Badge>
                ))}
              </div>
            ) : null}
          </div>
        ) : (
          <>
            <div className="grid gap-3">
              {readiness.checklist.map((item) => (
                <div
                  key={item.key}
                  className="flex items-start justify-between gap-3 rounded-2xl border border-border/60 bg-background/40 px-4 py-3"
                >
                  <div className="flex items-start gap-3">
                    {item.complete ? (
                      <CheckCircle2 className="mt-0.5 h-4 w-4 text-success [stroke-width:1.7]" />
                    ) : (
                      <CircleDashed className="mt-0.5 h-4 w-4 text-warning [stroke-width:1.7]" />
                    )}
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {item.label}
                      </p>
                      {!item.complete ? (
                        <p className="mt-1 text-xs text-muted-foreground">
                          {item.guidance}
                        </p>
                      ) : null}
                    </div>
                  </div>
                  <Badge variant={item.complete ? "success" : "muted"}>
                    {item.complete ? "Done" : "Missing"}
                  </Badge>
                </div>
              ))}
            </div>

            {!readiness.readyForPublish ? (
              <div className="space-y-3 rounded-[24px] border border-warning/30 bg-warning/10 p-4">
                <div className="flex items-start gap-3">
                  <CircleAlert className="mt-0.5 h-4 w-4 text-warning [stroke-width:1.7]" />
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      Fastest upgrades
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Work through these first to get your public profile ready faster.
                    </p>
                  </div>
                </div>
                <div className="grid gap-3">
                  {topGuidance.map((item) => (
                    <div
                      key={item.key}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/50 bg-background/50 px-4 py-3"
                    >
                      <div>
                        <p className="text-sm font-medium text-foreground">
                          {item.label}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {item.guidance}
                        </p>
                      </div>
                      <Button asChild size="sm" variant="secondary">
                        <Link to={item.href}>Fix now</Link>
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </>
        )}
      </div>
    </PtHubSectionCard>
  );
}

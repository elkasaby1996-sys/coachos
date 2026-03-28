import { ArrowRight, ClipboardCheck, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import { Card, CardContent } from "../../../components/ui/card";
import {
  getOnboardingStatusMeta,
  getOnboardingStepHref,
} from "../lib/client-onboarding";
import type { ClientOnboardingSummary } from "../types";

export function ClientOnboardingSoftGate({
  summary,
  compact = false,
}: {
  summary: ClientOnboardingSummary;
  compact?: boolean;
}) {
  if (summary.onboarding.status === "completed") return null;

  const statusMeta = getOnboardingStatusMeta(summary.onboarding.status);
  const primaryHref = getOnboardingStepHref(summary.resumeStep);

  return (
    <Card className="border-border/70 bg-[linear-gradient(135deg,oklch(var(--card)/0.98),oklch(var(--card)/0.92))] shadow-[0_24px_60px_-42px_rgba(0,0,0,0.75)]">
      <CardContent
        className={
          compact
            ? "flex flex-col gap-4 px-4 py-4 sm:flex-row sm:items-center sm:justify-between"
            : "space-y-4 px-5 py-5 sm:px-6"
        }
      >
        <div className="flex min-w-0 gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary">
            {summary.awaitingReview ? (
              <ClipboardCheck className="h-5 w-5" />
            ) : (
              <Sparkles className="h-5 w-5" />
            )}
          </div>
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={statusMeta.variant}>{statusMeta.label}</Badge>
              {!summary.awaitingReview ? (
                <Badge variant="secondary">
                  {summary.completionPercent}% complete
                </Badge>
              ) : null}
            </div>
            <div className="space-y-1">
              <p className="text-sm font-semibold text-foreground sm:text-base">
                {summary.awaitingReview
                  ? "Your onboarding is with your coach now."
                  : "Finish onboarding to help your coach build your plan."}
              </p>
              <p className="text-sm leading-6 text-muted-foreground">
                {statusMeta.description}
              </p>
            </div>
            {!summary.awaitingReview ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs uppercase tracking-[0.18em] text-muted-foreground">
                  <span>Progress</span>
                  <span>{summary.completionPercent}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary transition-[width]"
                    style={{ width: `${summary.completionPercent}%` }}
                  />
                </div>
              </div>
            ) : null}
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap gap-2">
          <Button asChild>
            <Link to={primaryHref}>
              {summary.awaitingReview
                ? "View onboarding"
                : "Continue onboarding"}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

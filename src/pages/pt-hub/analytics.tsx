import { Globe, MessageSquarePlus, Sparkles, TrendingUp, UsersRound } from "lucide-react";
import { EmptyState } from "../../components/ui/coachos/empty-state";
import { StatCard } from "../../components/ui/coachos/stat-card";
import { Badge } from "../../components/ui/badge";
import { PtHubPageHeader } from "../../features/pt-hub/components/pt-hub-page-header";
import { PtHubReadinessPanel } from "../../features/pt-hub/components/pt-hub-readiness-panel";
import { PtHubSectionCard } from "../../features/pt-hub/components/pt-hub-section-card";
import {
  usePtHubAnalytics,
  usePtHubProfileReadiness,
} from "../../features/pt-hub/lib/pt-hub";

const buildMetricDelta = (delta: number | null | undefined, suffix = "") => {
  if (typeof delta !== "number" || Number.isNaN(delta)) return null;
  const rounded = Math.round(delta);
  return {
    value: `${rounded > 0 ? "+" : rounded < 0 ? "-" : ""}${Math.abs(rounded)}${suffix}`,
    tone:
      rounded === 0 ? "neutral" : rounded > 0 ? "positive" : "negative",
  } as const;
};

export function PtHubAnalyticsPage() {
  const analyticsQuery = usePtHubAnalytics();
  const readinessQuery = usePtHubProfileReadiness();
  const analytics = analyticsQuery.data;

  return (
    <section className="space-y-6">
      <PtHubPageHeader
        eyebrow="Analytics"
        title="Track business performance"
        description="See how your profile, leads, and clients are performing."
      />

      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
        <StatCard
          surface="pt-hub"
          label="Profile Reach"
          value={analytics?.profileViewsLabel ?? "Not live yet"}
          helper={
            analytics?.profileViewsConnected
              ? "Visits to your public profile"
              : "Profile traffic not connected"
          }
          icon={Globe}
          accent
        />
        <StatCard
          surface="pt-hub"
          label="Leads"
          value={analytics?.applicationsThisMonth ?? 0}
          helper="Received in the last 30 days"
          icon={MessageSquarePlus}
          delta={buildMetricDelta(
            (analytics?.applicationsThisMonth ?? 0) -
              (analytics?.applicationsPreviousWindow ?? 0),
          )}
        />
        <StatCard
          surface="pt-hub"
          label="Conversion Rate"
          value={`${analytics?.applicationConversionRate ?? 0}%`}
          helper="Accepted applications / total applications"
          icon={TrendingUp}
        />
        <StatCard
          surface="pt-hub"
          label="Active Clients"
          value={analytics?.activeClients ?? 0}
          helper="Across all coaching spaces"
          icon={UsersRound}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.3fr)_380px]">
        <PtHubSectionCard
          title="Performance Summary"
          description="The most useful business signals in one place."
        >
          <div className="grid gap-4 md:grid-cols-2">
            <MetricBox
              label="Leads this week"
              value={String(analytics?.applicationsThisWeek ?? 0)}
            />
            <MetricBox
              label="Leads this month"
              value={String(analytics?.applicationsThisMonth ?? 0)}
            />
            <MetricBox
              label="Trend"
              value={analytics?.growthTrendLabel ?? "No growth signal yet"}
              detail="Compared with the previous 30 days"
            />
            <MetricBox
              label="Proof assets"
              value={analytics?.testimonialCountLabel ?? "Placeholder"}
              detail="Testimonials and transformations are still placeholder data"
            />
          </div>
        </PtHubSectionCard>

        <div className="space-y-6">
          {readinessQuery.data ? (
            <PtHubReadinessPanel readiness={readinessQuery.data} compact />
          ) : null}

          <PtHubSectionCard
            title="Clients by Coaching Space"
            description="How your clients are spread across spaces."
          >
            {analytics?.clientsByWorkspace.length ? (
              <div className="space-y-3">
                {analytics.clientsByWorkspace.map((item) => {
                  const maxCount =
                    analytics.clientsByWorkspace[0]?.clientCount ?? 1;
                  const width = Math.max(
                    12,
                    Math.round((item.clientCount / maxCount) * 100),
                  );
                  return (
                    <div
                      key={item.workspaceId}
                      className="rounded-2xl border border-border/60 bg-background/34 p-4"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium text-foreground">
                            {item.workspaceName}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {item.clientCount} client(s)
                          </p>
                        </div>
                        <Badge variant="secondary">{item.clientCount}</Badge>
                      </div>
                      <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-primary"
                          style={{ width: `${width}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <EmptyState
                title="No client breakdown yet"
                description="Once clients are added, PT Hub will show how they are distributed across your coaching spaces."
              />
            )}
          </PtHubSectionCard>
        </div>
      </div>
    </section>
  );
}

function MetricBox({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail?: string;
}) {
  return (
    <div className="rounded-2xl border border-border/60 bg-background/34 p-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
        {label}
        </p>
        <span className="flex h-8 w-8 items-center justify-center text-primary">
          <Sparkles className="h-3.5 w-3.5 [stroke-width:1.7]" />
        </span>
      </div>
      <p className="mt-2 text-xl font-semibold tracking-tight text-foreground">{value}</p>
      {detail ? (
        <p className="mt-2 text-sm text-muted-foreground">{detail}</p>
      ) : null}
    </div>
  );
}

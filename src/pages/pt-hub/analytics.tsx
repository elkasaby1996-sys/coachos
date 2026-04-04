import { BarChart3, Eye, TrendingUp, Users2 } from "lucide-react";
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
    tone: rounded === 0 ? "neutral" : rounded > 0 ? "positive" : "negative",
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
        title="Track business-level performance"
        description="PT Hub analytics focus on trainer business signals, not workspace task execution. Where public-marketplace metrics are not live yet, the page stays explicit about placeholders."
      />

      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
        <StatCard
          surface="pt-hub"
          label="Profile Views"
          value={analytics?.profileViewsLabel ?? "Not live yet"}
          helper={
            analytics?.profileViewsConnected
              ? "Live public traffic"
              : "Public page not connected"
          }
          icon={Eye}
          accent
        />
        <StatCard
          surface="pt-hub"
          label="Applications"
          value={analytics?.applicationsThisMonth ?? 0}
          helper="Received in the last 30 days"
          icon={BarChart3}
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
          helper="Across all owned workspaces"
          icon={Users2}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.3fr)_380px]">
        <div className="space-y-6">
          <PtHubSectionCard
            title="Business metrics"
            description="Current trainer-level analytics from the PT Hub."
          >
            <div className="grid gap-4 md:grid-cols-2">
              <MetricBox
                label="Applications this week"
                value={String(analytics?.applicationsThisWeek ?? 0)}
              />
              <MetricBox
                label="Applications this month"
                value={String(analytics?.applicationsThisMonth ?? 0)}
              />
              <MetricBox
                label="Testimonials"
                value={analytics?.testimonialCountLabel ?? "Placeholder"}
              />
              <MetricBox
                label="Transformations"
                value={analytics?.transformationsCountLabel ?? "Placeholder"}
              />
            </div>
          </PtHubSectionCard>

          <PtHubSectionCard
            title="Clients by workspace"
            description="Cross-workspace client distribution inside the PT Hub."
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
                      className="rounded-2xl border border-border/60 bg-background/40 p-4"
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
                title="No workspace client breakdown yet"
                description="Once clients exist across your owned workspaces, the PT Hub will summarize their distribution here."
              />
            )}
          </PtHubSectionCard>

          <PtHubSectionCard
            title="Recent growth trend"
            description="A simple trend read based on current lead flow."
          >
            <div className="rounded-2xl border border-border/60 bg-background/40 p-5">
              <p className="text-lg font-semibold text-foreground">
                {analytics?.growthTrendLabel ?? "No growth signal yet"}
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                This compares recent application flow against the previous
                30-day window. It stays intentionally lightweight until deeper
                analytics instrumentation exists.
              </p>
            </div>
          </PtHubSectionCard>
        </div>

        <div className="space-y-6">
          {readinessQuery.data ? (
            <PtHubReadinessPanel readiness={readinessQuery.data} compact />
          ) : null}

          <PtHubSectionCard
            title="Analytics notes"
            description="What is real today versus placeholder."
          >
            <div className="space-y-3 text-sm text-muted-foreground">
              <p>
                Applications, conversion rate, active clients, and workspace
                breakdown are derived from real PT Hub and CoachOS data.
              </p>
              <p>
                Profile views, testimonials, and transformations remain
                placeholder metrics until the public website and proof surfaces
                exist.
              </p>
            </div>
          </PtHubSectionCard>
        </div>
      </div>
    </section>
  );
}

function MetricBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border/60 bg-background/40 p-4">
      <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-2 text-xl font-semibold tracking-tight text-foreground">
        {value}
      </p>
    </div>
  );
}

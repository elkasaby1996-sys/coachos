import {
  ArrowRight,
  Building2,
  ClipboardList,
  CreditCard,
  Sparkles,
  Settings,
  UserCircle2,
  Users2,
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { EmptyState } from "../../components/ui/coachos/empty-state";
import { StatCard } from "../../components/ui/coachos/stat-card";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { PtHubSectionCard } from "../../features/pt-hub/components/pt-hub-section-card";
import {
  usePtHubAnalytics,
  usePtHubOverview,
  usePtHubPayments,
  usePtHubProfile,
  usePtHubProfileReadiness,
  usePtHubWorkspaces,
} from "../../features/pt-hub/lib/pt-hub";
import { formatRelativeTime } from "../../lib/relative-time";
import { useWorkspace } from "../../lib/use-workspace";

const buildMetricDelta = (delta: number | null | undefined, suffix = "") => {
  if (typeof delta !== "number" || Number.isNaN(delta)) return null;
  const rounded = Math.round(delta);
  return {
    value: `${rounded > 0 ? "+" : rounded < 0 ? "-" : ""}${Math.abs(rounded)}${suffix}`,
    tone:
      rounded === 0 ? "neutral" : rounded > 0 ? "positive" : "negative",
  } as const;
};

export function PtHubOverviewPage() {
  const navigate = useNavigate();
  const { switchWorkspace } = useWorkspace();
  const overviewQuery = usePtHubOverview();
  const workspacesQuery = usePtHubWorkspaces();
  const profileQuery = usePtHubProfile();
  const readinessQuery = usePtHubProfileReadiness();
  const paymentsQuery = usePtHubPayments();
  const analyticsQuery = usePtHubAnalytics();

  const stats = overviewQuery.data;
  const latestWorkspace = workspacesQuery.data?.[0] ?? null;
  const readiness = readinessQuery.data;
  const quickFixes =
    readiness?.checklist.filter((item) => !item.complete).slice(0, 3) ?? [];

  const openLatestWorkspace = () => {
    if (!latestWorkspace) return;
    switchWorkspace(latestWorkspace.id);
    navigate("/pt/dashboard");
  };

  const recentItems = [
    latestWorkspace
      ? {
          title: "Workspace ready for coaching operations",
          description: `${latestWorkspace.name} was updated ${formatRelativeTime(latestWorkspace.lastUpdated)}.`,
          meta: "Workspace",
        }
      : null,
    stats?.applicationsThisMonth
      ? {
          title: "Application flow is active",
          description: `${stats.applicationsThisMonth} application(s) arrived in the last 30 days, including ${stats.applicationsThisWeek} this week.`,
          meta: "Leads",
        }
      : null,
    profileQuery.data
      ? {
          title: "Public profile is progressing",
          description: `${readiness?.completionPercent ?? profileQuery.data.completionPercent}% of publish readiness is complete.`,
          meta: profileQuery.data.updatedAt
            ? `Updated ${formatRelativeTime(profileQuery.data.updatedAt)}`
            : "Draft",
        }
      : null,
  ].filter(Boolean) as Array<{
    title: string;
    description: string;
    meta: string;
  }>;

  return (
    <section className="space-y-6">
      <div className="rounded-[28px] border border-border/70 bg-[linear-gradient(180deg,rgba(17,23,36,0.88),rgba(11,15,24,0.82))] px-5 py-5 sm:px-6">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">PT Hub Overview</Badge>
              <Badge variant="muted">
                {stats?.businessHealthLabel ?? "Setup in progress"}
              </Badge>
            </div>
            <div className="space-y-1.5">
              <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-[2rem]">
                Business command center
              </h1>
              <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
                Monitor demand, profile readiness, and workspace portfolio
                health before stepping into coaching operations.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button asChild variant="secondary">
              <Link to="/pt-hub/profile">Edit profile</Link>
            </Button>
            <Button asChild variant="secondary">
              <Link to="/pt-hub/workspaces">View workspaces</Link>
            </Button>
            <Button
              variant="secondary"
              onClick={openLatestWorkspace}
              disabled={!latestWorkspace}
            >
              Open workspace
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-4">
        <StatCard
          surface="pt-hub"
          label="Active Workspaces"
          value={stats?.activeWorkspaces ?? 0}
          helper="Owned workspaces"
          icon={Building2}
          accent
        />
        <StatCard
          surface="pt-hub"
          label="Active Clients"
          value={stats?.activeClients ?? 0}
          helper="Across all workspaces"
          icon={Users2}
        />
        <StatCard
          surface="pt-hub"
          label="Applications"
          value={stats?.applicationsThisMonth ?? 0}
          helper={`${stats?.applicationsThisWeek ?? 0} this week`}
          icon={ClipboardList}
          delta={buildMetricDelta(
            (stats?.applicationsThisMonth ?? 0) -
              (stats?.applicationsPreviousWindow ?? 0),
          )}
        />
        <StatCard
          surface="pt-hub"
          label="Profile Readiness"
          value={`${readiness?.completionPercent ?? stats?.profileCompletionPercent ?? 0}%`}
          helper={
            readiness?.readyForPublish
              ? "Ready for publish"
              : "Still in progress"
          }
          icon={UserCircle2}
        />
      </div>

      <div className="grid gap-8 xl:grid-cols-[minmax(0,1.2fr)_340px]">
        <div className="space-y-8">
          <section className="space-y-4">
            <div className="space-y-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                Primary
              </p>
              <h2 className="text-lg font-semibold tracking-tight text-foreground">
                Recent activity
              </h2>
            </div>
            <div className="rounded-[28px] border border-border/70 bg-[linear-gradient(180deg,rgba(17,23,36,0.72),rgba(11,15,24,0.7))] p-5">
              {recentItems.length > 0 ? (
                <div className="space-y-4">
                  {recentItems.map((item, index) => (
                    <div
                      key={`${item.title}-${item.meta}`}
                      className="flex gap-4"
                    >
                      <div className="flex flex-col items-center">
                        <div className="mt-1 h-2.5 w-2.5 rounded-full bg-primary" />
                        {index < recentItems.length - 1 ? (
                          <div className="mt-2 h-full min-h-10 w-px bg-border/70" />
                        ) : null}
                      </div>
                      <div className="min-w-0 flex-1 pb-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <p className="text-sm font-medium text-foreground">
                            {item.title}
                          </p>
                          <span className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                            {item.meta}
                          </span>
                        </div>
                        <p className="mt-1 text-sm leading-6 text-muted-foreground">
                          {item.description}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState
                  title="Business activity will collect here"
                  description="As profile updates, leads, and workspace movement pick up, this feed will highlight the highest-signal changes."
                  icon={<ClipboardList className="h-5 w-5" />}
                />
              )}
            </div>
          </section>

          <section className="space-y-4">
            <div className="space-y-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                Secondary
              </p>
              <h2 className="text-lg font-semibold tracking-tight text-foreground">
                Quick actions
              </h2>
            </div>
            <PtHubSectionCard
              title="Move the business forward"
              description="Use PT Hub to progress the business layer before you jump into coaching operations."
            >
              <div className="grid gap-3 sm:grid-cols-2">
                <Button asChild className="justify-between">
                  <Link to="/pt-hub/profile">
                    Edit Public Profile
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
                <Button asChild variant="secondary" className="justify-between">
                  <Link to="/pt-hub/leads">
                    Review Leads
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
                <Button asChild variant="secondary" className="justify-between">
                  <Link to="/pt-hub/clients">
                    View Client Base
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
                <Button asChild variant="secondary" className="justify-between">
                  <Link to="/pt-hub/settings">
                    Update Settings
                    <Settings className="h-4 w-4" />
                  </Link>
                </Button>
              </div>
            </PtHubSectionCard>
          </section>
        </div>

        <div className="space-y-8">
          <section className="space-y-4">
            <div className="space-y-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                Status
              </p>
              <h2 className="text-lg font-semibold tracking-tight text-foreground">
                Business status
              </h2>
            </div>
            <PtHubSectionCard
              title="Profile and platform status"
              description="A compact read on publish readiness, billing state, and workspace entry."
              contentClassName="space-y-5"
            >
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge
                        variant={
                          readiness?.readyForPublish ? "success" : "warning"
                        }
                      >
                        {readiness?.statusLabel ?? "Not ready"}
                      </Badge>
                      <Badge variant="secondary">
                        {readiness?.completionPercent ?? 0}% complete
                      </Badge>
                    </div>
                    <p className="mt-3 text-sm leading-6 text-muted-foreground">
                      {readiness?.readyForPublish
                        ? "Your public-facing setup is in strong shape for future publishing."
                        : `${quickFixes.length > 0 ? quickFixes.length : (readiness?.missingItems.length ?? 0)} area(s) still need attention before publish readiness feels complete.`}
                    </p>
                  </div>
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-border/70 bg-background/45 text-primary">
                    <Sparkles className="h-5 w-5" />
                  </div>
                </div>

                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary transition-[width]"
                    style={{ width: `${readiness?.completionPercent ?? 0}%` }}
                  />
                </div>
              </div>

              {!readiness?.readyForPublish && quickFixes.length > 0 ? (
                <div className="space-y-3">
                  {quickFixes.map((item) => (
                    <div
                      key={item.key}
                      className="flex items-start justify-between gap-3"
                    >
                      <div>
                        <p className="text-sm font-medium text-foreground">
                          {item.label}
                        </p>
                        <p className="mt-1 text-xs leading-5 text-muted-foreground">
                          {item.guidance}
                        </p>
                      </div>
                      <Button asChild size="sm" variant="secondary">
                        <Link to={item.href}>Complete</Link>
                      </Button>
                    </div>
                  ))}
                </div>
              ) : null}

              <div className="space-y-4 border-t border-border/60 pt-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                    Subscription
                  </p>
                  <p className="mt-2 text-sm font-medium text-foreground">
                    {paymentsQuery.data?.subscription.planName ?? "CoachOS Pro"}
                  </p>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    {paymentsQuery.data?.subscription.billingConnected
                      ? "Live billing connection is active."
                      : "Billing remains intentionally lightweight here until full live integrations are connected."}
                  </p>
                </div>

                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                    Workspace layer
                  </p>
                  <p className="mt-2 text-sm font-medium text-foreground">
                    {latestWorkspace?.name ?? "No workspace yet"}
                  </p>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    {latestWorkspace
                      ? "Enter coaching operations only when you need execution detail."
                      : "Create a workspace to begin coaching operations."}
                  </p>
                </div>
              </div>
            </PtHubSectionCard>
          </section>
        </div>
      </div>
    </section>
  );
}

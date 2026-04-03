import {
  ArrowRight,
  Building,
  MessageSquarePlus,
  Wallet,
  Sparkles,
  type LucideIcon,
  UserRound,
  UsersRound,
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { EmptyState } from "../../components/ui/coachos/empty-state";
import { StatCard } from "../../components/ui/coachos/stat-card";
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
  const analytics = analyticsQuery.data;
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
          title: "Coaching space updated",
          description: `${latestWorkspace.name} moved ${formatRelativeTime(latestWorkspace.lastUpdated)}.`,
        }
      : null,
    stats?.applicationsThisMonth
      ? {
          title: "New inquiries are coming in",
          description: `${stats.applicationsThisMonth} inquiry(s) came in over the last 30 days, including ${stats.applicationsThisWeek} this week.`,
        }
      : null,
    profileQuery.data
      ? {
          title: "Profile setup is moving forward",
          description: `${readiness?.completionPercent ?? profileQuery.data.completionPercent}% of your public profile is complete.`,
        }
      : null,
  ].filter(Boolean) as Array<{
    title: string;
    description: string;
  }>;

  return (
    <section className="space-y-6">
      <div className="grid gap-4 xl:grid-cols-4">
        <StatCard
          surface="pt-hub"
          label="Active Spaces"
          value={stats?.activeWorkspaces ?? 0}
          icon={Building}
          accent
        />
        <StatCard
          surface="pt-hub"
          label="Active Clients"
          value={stats?.activeClients ?? 0}
          icon={UsersRound}
        />
        <StatCard
          surface="pt-hub"
          label="New Leads"
          value={stats?.applicationsThisMonth ?? 0}
          icon={MessageSquarePlus}
          delta={buildMetricDelta(
            (stats?.applicationsThisMonth ?? 0) -
              (stats?.applicationsPreviousWindow ?? 0),
          )}
        />
        <StatCard
          surface="pt-hub"
          label="Profile Completion"
          value={`${readiness?.completionPercent ?? stats?.profileCompletionPercent ?? 0}%`}
          icon={UserRound}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_380px]">
        <div className="surface-panel-strong relative overflow-hidden rounded-[32px] border-border/70 px-5 py-5 backdrop-blur-xl sm:px-6 sm:py-6">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,oklch(var(--accent)/0.18),transparent_32%),radial-gradient(circle_at_bottom_left,oklch(var(--success)/0.12),transparent_28%),linear-gradient(180deg,oklch(var(--bg-surface-elevated)/0.18),transparent_46%,oklch(var(--bg-surface)/0.12))]" />
          <div className="relative space-y-6">
            <div className="flex flex-wrap items-start justify-between gap-5">
              <div className="space-y-2">
                <h1 className="max-w-3xl text-3xl font-semibold uppercase tracking-[0.02em] text-foreground sm:text-[2.5rem]">
                  Run your personal training business from one place.
                </h1>
                <p className="max-w-2xl text-sm leading-5 text-muted-foreground">
                  Check clients, leads, payments, and your public profile without jumping between screens.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button asChild variant="secondary">
                  <Link to="/pt-hub/profile">Edit profile</Link>
                </Button>
                <Button
                  variant="secondary"
                  onClick={openLatestWorkspace}
                  disabled={!latestWorkspace}
                >
                  Open workspace
                  <ArrowRight className="h-4 w-4 [stroke-width:1.7]" />
                </Button>
              </div>
            </div>

            <div className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(280px,0.9fr)]">
              <div className="space-y-3">
                <div className="rounded-[24px] border border-border/70 bg-background/30 p-4 backdrop-blur-xl">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                        Profile status
                      </p>
                      <p className="mt-2 text-xl font-semibold tracking-tight text-foreground">
                        {readiness?.statusLabel ?? "Not ready"}
                      </p>
                      <p className="mt-2 text-sm leading-5 text-muted-foreground">
                        {readiness?.readyForPublish
                          ? "Your public profile is ready to share."
                          : `${quickFixes.length > 0 ? quickFixes.length : (readiness?.missingItems.length ?? 0)} item(s) still need attention.`}
                      </p>
                    </div>
                    <span className="flex h-10 w-10 items-center justify-center rounded-full border border-primary/16 bg-background/18 text-primary backdrop-blur-lg">
                      <Sparkles className="h-4 w-4 [stroke-width:1.7]" />
                    </span>
                  </div>
                  <div className="mt-4 h-2 overflow-hidden rounded-full bg-muted/70">
                    <div
                      className="h-full rounded-full bg-primary transition-[width]"
                      style={{ width: `${readiness?.completionPercent ?? 0}%` }}
                    />
                  </div>
                </div>

                {!readiness?.readyForPublish && quickFixes.length > 0 ? (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {quickFixes.slice(0, 2).map((item) => (
                      <Link
                        key={item.key}
                        to={item.href}
                        className="rounded-[22px] border border-border/70 bg-background/26 px-4 py-4 backdrop-blur-lg transition-colors hover:border-primary/20 hover:bg-background/38"
                      >
                        <p className="text-sm font-medium text-foreground">
                          {item.label}
                        </p>
                        <p className="mt-3 text-sm font-medium text-primary">
                          Complete
                        </p>
                      </Link>
                    ))}
                  </div>
                ) : null}
              </div>

              <div className="space-y-3">
                <SignalLine
                  icon={MessageSquarePlus}
                  label="Leads this week"
                  value={`${stats?.applicationsThisWeek ?? 0}`}
                />
                <SignalLine
                  icon={Building}
                  label="Latest workspace"
                  value={latestWorkspace?.name ?? "No workspace yet"}
                />
                <SignalLine
                  icon={Wallet}
                  label="Billing"
                  value={
                    paymentsQuery.data?.subscription.billingConnected
                      ? "Connected"
                      : "Manual"
                  }
                />
                <SignalLine
                  icon={UsersRound}
                  label="Lead trend"
                  value={analytics?.growthTrendLabel ?? "No growth signal yet"}
                  detail={
                    buildMetricDelta(
                      (stats?.applicationsThisMonth ?? 0) -
                        (stats?.applicationsPreviousWindow ?? 0),
                    )?.value
                      ? `30-day change ${buildMetricDelta(
                          (stats?.applicationsThisMonth ?? 0) -
                            (stats?.applicationsPreviousWindow ?? 0),
                        )?.value}`
                      : undefined
                  }
                />
              </div>
            </div>
          </div>
        </div>

        <PtHubSectionCard
          title="Recent Activity"
          description="Recent updates across your PT Hub."
        >
          {recentItems.length > 0 ? (
            <div className="space-y-3">
              {recentItems.map((item, index) => (
                <div
                  key={`${item.title}-${index}`}
                  className="flex gap-4 rounded-[24px] border border-border/70 bg-background/38 px-4 py-4 backdrop-blur-xl"
                >
                  <div className="flex flex-col items-center">
                    <div className="mt-1 h-2.5 w-2.5 rounded-full bg-primary" />
                    {index < recentItems.length - 1 ? (
                      <div className="mt-2 h-full min-h-12 w-px bg-border/80" />
                    ) : null}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground">
                      {item.title}
                    </p>
                    <p className="mt-2 text-sm leading-5 text-muted-foreground">
                      {item.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              title="Recent activity will show here"
              description="Profile, lead, and workspace updates will appear here as they happen."
              icon={<MessageSquarePlus className="h-5 w-5 [stroke-width:1.7]" />}
            />
          )}
        </PtHubSectionCard>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <PtHubSectionCard
          title="Business Snapshot"
          description="A quick read on the parts of the business that matter most."
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <SignalLine
              icon={Sparkles}
              label="Profile status"
              value={readiness?.statusLabel ?? "Not ready"}
            />
            <SignalLine
              icon={UsersRound}
              label="Active clients"
              value={`${stats?.activeClients ?? analytics?.activeClients ?? 0}`}
            />
            <SignalLine
              icon={MessageSquarePlus}
              label="Leads this month"
              value={`${stats?.applicationsThisMonth ?? 0}`}
              detail={
                buildMetricDelta(
                  (stats?.applicationsThisMonth ?? 0) -
                    (stats?.applicationsPreviousWindow ?? 0),
                )?.value
                  ? `Change vs previous period ${buildMetricDelta(
                      (stats?.applicationsThisMonth ?? 0) -
                        (stats?.applicationsPreviousWindow ?? 0),
                    )?.value}`
                  : undefined
              }
            />
            <SignalLine
              icon={Wallet}
              label="CoachOS plan"
              value={
                paymentsQuery.data?.subscription.planName ?? "CoachOS Pro"
              }
            />
          </div>
        </PtHubSectionCard>

        <PtHubSectionCard
          title="Go To"
          description="The pages you will likely use most."
        >
          <div className="space-y-2">
            <OverviewLinkRow
              to="/pt-hub/leads"
              icon={MessageSquarePlus}
              label="Leads"
              value="Review new inquiries"
            />
            <OverviewLinkRow
              to="/pt-hub/clients"
              icon={UsersRound}
              label="Clients"
              value="Check active and at-risk clients"
            />
            <OverviewLinkRow
              to="/pt-hub/profile"
              icon={UserRound}
              label="Coach profile"
              value="Update your public trainer page"
            />
            <OverviewLinkRow
              to="/pt-hub/workspaces"
              icon={Building}
              label="Coaching spaces"
              value="Open and manage your spaces"
            />
          </div>
        </PtHubSectionCard>
      </div>
    </section>
  );
}

function SignalLine({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  detail?: string;
}) {
  return (
    <div className="flex items-start gap-3 rounded-[22px] border border-border/70 bg-background/34 p-3.5 backdrop-blur-xl">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-primary/16 bg-background/18 text-primary backdrop-blur-lg">
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
          {label}
        </p>
        <p className="mt-1 text-sm font-medium text-foreground">{value}</p>
        {detail ? (
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            {detail}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function OverviewLinkRow({
  to,
  icon: Icon,
  label,
  value,
}: {
  to: string;
  icon: LucideIcon;
  label: string;
  value: string;
}) {
  return (
    <Link
      to={to}
      className="flex items-center gap-3 rounded-[22px] border border-border/70 bg-background/34 px-4 py-4 backdrop-blur-xl transition-colors hover:border-primary/20 hover:bg-background/46"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-primary/16 bg-background/18 text-primary backdrop-blur-lg">
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground">{label}</p>
        <p className="mt-1 text-sm text-muted-foreground">{value}</p>
      </div>
      <ArrowRight className="h-4 w-4 text-muted-foreground" />
    </Link>
  );
}

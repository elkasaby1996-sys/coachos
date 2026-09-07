import { useMemo, useState, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Activity,
  ArrowUpRight,
  BarChart3,
  Building2,
  ChevronDown,
  CircleDollarSign,
  Layers3,
  RefreshCw,
  Users,
} from "lucide-react";
import { Button } from "../../components/ui/button";
import {
  usePtHubWorkspaces,
  usePtPackages,
} from "../../features/pt-hub/lib/pt-hub";
import {
  analyticsWindow,
  buildAcquisitionAnalytics,
  buildDeliveryAnalytics,
  displayRate,
  emptyAnalyticsRecords,
  type AnalyticsRange,
} from "../../features/pt-hub/lib/business-analytics";
import {
  useBusinessAnalyticsRecords,
  useAnalyticsLeads,
} from "../../features/pt-hub/lib/use-business-analytics";
import "../../styles/pt-hub-analytics.css";

const colors = [
  "#0e8c94",
  "#4b77c5",
  "#b98b39",
  "#8a78b8",
  "#5e8c73",
  "#be6870",
  "#7f8b9b",
];
const tooltipStyle = {
  background: "var(--analytics-panel)",
  border: "1px solid var(--analytics-line)",
  borderRadius: 12,
  color: "var(--analytics-ink)",
  fontSize: 12,
};
const lifecycleColor = (name: string) =>
  ({
    Active: colors[0],
    Invited: colors[1],
    Onboarding: colors[2],
    Paused: colors[3],
    Completed: colors[4],
    Churned: colors[5],
    Other: colors[6],
  })[name] || colors[6];
function Panel({
  title,
  subtitle,
  children,
  action,
  className = "",
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <section className={`analytics-panel ${className}`}>
      <header>
        <div>
          <h2>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}
function Metric({
  label,
  value,
  detail,
  icon,
}: {
  label: string;
  value: string | number;
  detail: string;
  icon: ReactNode;
}) {
  return (
    <div className="analytics-metric">
      <div className="analytics-metric-label">
        {label}
        {icon}
      </div>
      <strong>{value}</strong>
      <p>{detail}</p>
    </div>
  );
}
function SelectFilter({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
}) {
  return (
    <label className="analytics-select">
      <span>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {children}
      </select>
    </label>
  );
}
function ChartTable({
  children,
  headers,
}: {
  children: ReactNode;
  headers: string[];
}) {
  return (
    <details className="analytics-data">
      <summary>
        View data table <ChevronDown size={14} />
      </summary>
      <div className="analytics-table-scroll">
        <table>
          <thead>
            <tr>
              {headers.map((h) => (
                <th key={h}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>{children}</tbody>
        </table>
      </div>
    </details>
  );
}
function Empty({ children }: { children: ReactNode }) {
  return <p className="analytics-empty">{children}</p>;
}
function RateBar({
  label,
  count,
  total,
  color = colors[0],
}: {
  label: string;
  count: number;
  total: number;
  color?: string;
}) {
  return (
    <div className="analytics-rate">
      <div>
        <span>{label}</span>
        <strong>{displayRate(total ? (count / total) * 100 : null)}</strong>
      </div>
      <div className="analytics-track">
        <span
          style={{
            width: `${total ? (count / total) * 100 : 0}%`,
            background: color,
          }}
        />
      </div>
      <small>
        {count} of {total}
      </small>
    </div>
  );
}

export function PtHubAnalyticsPage() {
  const [params, setParams] = useSearchParams();
  const view = ["business", "coaching", "workspaces"].includes(
    params.get("view") || "",
  )
    ? params.get("view")!
    : "business";
  const range = (
    ["7d", "30d", "90d", "12m"].includes(params.get("range") || "")
      ? params.get("range")
      : "30d"
  ) as AnalyticsRange;
  const workspaceQuery = usePtHubWorkspaces();
  const leadQuery = useAnalyticsLeads();
  const packageQuery = usePtPackages();
  const workspaces = useMemo(
    () => workspaceQuery.data || [],
    [workspaceQuery.data],
  );
  const leads = useMemo(() => leadQuery.data || [], [leadQuery.data]);
  const requestedWorkspace = params.get("workspace") || "all";
  const workspace = workspaces.some((w) => w.id === requestedWorkspace)
    ? requestedWorkspace
    : "all";
  const packageKey = params.get("package") || "all";
  const source = params.get("source") || "all";
  const recordsQuery = useBusinessAnalyticsRecords(
    workspaces.map((w) => w.id),
    range,
    workspaceQuery.isSuccess,
  );
  const records = recordsQuery.data || emptyAnalyticsRecords;
  const delivery = useMemo(
    () => buildDeliveryAnalytics(records, range, workspace),
    [records, range, workspace],
  );
  const acquisition = useMemo(
    () =>
      buildAcquisitionAnalytics(leads, range, workspace, packageKey, source),
    [leads, range, workspace, packageKey, source],
  );
  const [group, setGroup] = useState<"sources" | "packages">("sources");
  const [showFollowup, setShowFollowup] = useState(false);
  const update = (key: string, value: string) =>
    setParams((current) => {
      const next = new URLSearchParams(current);
      if (value === "all") next.delete(key);
      else next.set(key, value);
      return next;
    });
  const reset = () =>
    setParams((current) => {
      const next = new URLSearchParams(current);
      ["workspace", "package", "source"].forEach((k) => next.delete(k));
      return next;
    });
  const scopedWorkspaces = workspaces.filter(
    (w) => workspace === "all" || w.id === workspace,
  );
  const sources = [
    ...new Map(
      leads.map((l) => [l.source, l.sourceLabel || "Manual"]),
    ).entries(),
  ];
  const packages = [
    ...new Map(
      leads.map((l) => [
        l.packageInterestId || l.packageInterest || "none",
        l.packageInterestLabelSnapshot ||
          l.packageInterest ||
          "No package selected",
      ]),
    ).entries(),
  ].map(([key, label]) => [
    key,
    packageQuery.data?.find((p) => p.id === key)?.title || label,
  ]);
  const loading =
    workspaceQuery.isLoading ||
    (workspaceQuery.isSuccess && recordsQuery.isPending) ||
    leadQuery.isLoading;
  const error = workspaceQuery.error || recordsQuery.error || leadQuery.error;
  const window = analyticsWindow(range);
  const workspaceLabel =
    workspace === "all"
      ? "All workspaces"
      : workspaces.find((w) => w.id === workspace)?.name;
  const quality = acquisition[group];
  const waitingIds = new Set(delivery.waiting.map((c) => c.client_id));
  const overdueIds = new Set(delivery.overdue.map((c) => c.client_id));
  const followup = delivery.clients.filter(
    (c) => waitingIds.has(c.id) || overdueIds.has(c.id),
  );
  const activeFilters =
    workspace !== "all" || packageKey !== "all" || source !== "all";

  return (
    <main className="analytics-page">
      <header className="analytics-heading">
        <div>
          <p className="analytics-eyebrow">
            <Activity size={14} /> YOUR BUSINESS, IN FOCUS
          </p>
          <h1>
            Analytics<span>.</span>
          </h1>
          <p>Growth, coaching, and the spaces that connect them.</p>
        </div>
        <div className="analytics-live">
          <span />
          {workspaces.length} accessible{" "}
          {workspaces.length === 1 ? "workspace" : "workspaces"}
        </div>
      </header>
      <div className="analytics-controls">
        <nav aria-label="Analytics views">
          {[
            {
              id: "business",
              label: "Business",
              icon: <BarChart3 size={16} />,
            },
            { id: "coaching", label: "Coaching", icon: <Activity size={16} /> },
            {
              id: "workspaces",
              label: "Workspaces",
              icon: <Layers3 size={16} />,
            },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              data-no-button-motion="true"
              aria-pressed={view === tab.id}
              onClick={() => update("view", tab.id)}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </nav>
        <div className="analytics-global-filters">
          <SelectFilter
            label="Workspace"
            value={workspace}
            onChange={(v) => update("workspace", v)}
          >
            <option value="all">All workspaces</option>
            {workspaces.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </SelectFilter>
          <SelectFilter
            label="Period · UTC"
            value={range}
            onChange={(v) => update("range", v)}
          >
            {["7d", "30d", "90d", "12m"].map((v) => (
              <option key={v} value={v}>
                {v === "12m" ? "Last 12 months" : `Last ${v.slice(0, -1)} days`}
              </option>
            ))}
          </SelectFilter>
        </div>
      </div>
      <div className="analytics-scope">
        <span>
          {workspaceLabel} <span aria-hidden="true">/</span> {window.start} –{" "}
          {window.end}
          {view !== "business" && " · Client status is current"}
        </span>
        {activeFilters && (
          <button type="button" onClick={reset}>
            Reset filters
          </button>
        )}
      </div>
      {error ? (
        <div className="analytics-error" role="alert">
          <h2>Analytics couldn’t be loaded</h2>
          <p>
            One of the data sources didn’t respond. Retry to load the full
            picture.
          </p>
          <Button
            variant="secondary"
            onClick={() => {
              void workspaceQuery.refetch();
              void leadQuery.refetch();
              void recordsQuery.refetch();
            }}
          >
            <RefreshCw size={16} />
            Retry
          </Button>
        </div>
      ) : loading ? (
        <div className="analytics-loading" role="status">
          Loading analytics across your workspaces…
        </div>
      ) : (
        <>
          {view === "business" && (
            <>
              <div className="analytics-metrics">
                <Metric
                  label="New client accounts"
                  value={delivery.newClients}
                  detail="Unique people added in this period"
                  icon={<Users />}
                />
                <Metric
                  label="Active clients"
                  value={delivery.uniqueActive}
                  detail={`${delivery.active.length} active workspace memberships · now`}
                  icon={<Activity />}
                />
                <Metric
                  label="Applications"
                  value={acquisition.cohort.length}
                  detail="Submitted in the selected period and lead scope"
                  icon={<BarChart3 />}
                />
                <Metric
                  label="Lead conversion"
                  value={displayRate(acquisition.rate)}
                  detail={`${acquisition.converted.length} of ${acquisition.cohort.length} applicants converted · not a payment metric`}
                  icon={<ArrowUpRight />}
                />
              </div>
              <div className="analytics-lead-filters">
                <span>Lead scope</span>
                <SelectFilter
                  label="Package"
                  value={packageKey}
                  onChange={(v) => update("package", v)}
                >
                  <option value="all">All packages</option>
                  {packages.map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </SelectFilter>
                <SelectFilter
                  label="Source"
                  value={source}
                  onChange={(v) => update("source", v)}
                >
                  <option value="all">All sources</option>
                  {sources.map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </SelectFilter>
                <p>Applies to acquisition charts and lead metrics.</p>
              </div>
              {workspace !== "all" && (
                <p className="analytics-note">
                  This workspace includes only attributed leads.{" "}
                  {acquisition.unassigned} unassigned inbound{" "}
                  {acquisition.unassigned === 1 ? "lead is" : "leads are"}{" "}
                  included under All workspaces.
                </p>
              )}
              <div className="analytics-feature-grid">
                <Panel
                  title="Acquisition over time"
                  subtitle="Applications and conversions on the dates they happened."
                  action={
                    <span className="analytics-tag">
                      {range === "12m"
                        ? "30-day"
                        : range === "90d"
                          ? "Weekly"
                          : "Daily"}{" "}
                      totals
                    </span>
                  }
                  className="analytics-trend"
                >
                  <div className="analytics-chart-legend">
                    <span>
                      <i style={{ background: colors[0] }} />
                      Applications
                    </span>
                    <span>
                      <i style={{ background: colors[1] }} />
                      Conversions
                    </span>
                  </div>
                  <div
                    className="analytics-chart"
                    role="img"
                    aria-label="Application and conversion timeline. Exact values are available in the data table below."
                  >
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart
                        data={acquisition.trend}
                        margin={{ top: 20, right: 12, left: -25, bottom: 4 }}
                      >
                        <defs>
                          <linearGradient
                            id="analytics-demand"
                            x1="0"
                            y1="0"
                            x2="0"
                            y2="1"
                          >
                            <stop
                              offset="0%"
                              stopColor={colors[0]}
                              stopOpacity={0.25}
                            />
                            <stop
                              offset="100%"
                              stopColor={colors[0]}
                              stopOpacity={0.01}
                            />
                          </linearGradient>
                        </defs>
                        <CartesianGrid
                          vertical={false}
                          stroke="var(--analytics-line)"
                          strokeDasharray="3 5"
                        />
                        <XAxis
                          dataKey="label"
                          axisLine={false}
                          tickLine={false}
                          minTickGap={35}
                          tick={{
                            fill: "var(--analytics-muted)",
                            fontSize: 11,
                          }}
                        />
                        <YAxis
                          allowDecimals={false}
                          axisLine={false}
                          tickLine={false}
                          tick={{
                            fill: "var(--analytics-muted)",
                            fontSize: 11,
                          }}
                        />
                        <Tooltip contentStyle={tooltipStyle} />
                        <Area
                          type="linear"
                          dataKey="applications"
                          name="Applications"
                          stroke={colors[0]}
                          strokeWidth={2.5}
                          fill="url(#analytics-demand)"
                          isAnimationActive={false}
                        />
                        <Area
                          type="linear"
                          dataKey="conversions"
                          name="Conversions"
                          stroke={colors[1]}
                          strokeWidth={2.5}
                          fill="transparent"
                          isAnimationActive={false}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                  {!acquisition.trend.some(
                    (p) => p.applications || p.conversions,
                  ) && (
                    <p className="analytics-note">
                      No acquisition activity in this period.
                    </p>
                  )}
                  <ChartTable
                    headers={["Period starting", "Applications", "Conversions"]}
                  >
                    {acquisition.trend.map((p) => (
                      <tr key={p.date}>
                        <td>{p.date}</td>
                        <td>{p.applications}</td>
                        <td>{p.conversions}</td>
                      </tr>
                    ))}
                  </ChartTable>
                </Panel>
                <Panel
                  title="Application journey"
                  subtitle="Current outcomes of this period’s applicants."
                  className="analytics-funnel"
                >
                  <div className="analytics-funnel-score">
                    <strong>{displayRate(acquisition.rate)}</strong>
                    <span>converted to clients</span>
                  </div>
                  {[
                    { label: "Submitted", value: acquisition.cohort.length },
                    { label: "Approved", value: acquisition.approved.length },
                    { label: "Converted", value: acquisition.converted.length },
                  ].map((s, i) => (
                    <div className="analytics-funnel-stage" key={s.label}>
                      <div>
                        <span>
                          <small>0{i + 1}</small>
                          {s.label}
                        </span>
                        <strong>{s.value}</strong>
                      </div>
                      <div className="analytics-funnel-track">
                        <span
                          style={{
                            width: `${acquisition.cohort.length ? (s.value / acquisition.cohort.length) * 100 : 0}%`,
                            background: colors[i === 2 ? 1 : 0],
                            opacity: 1 - i * 0.15,
                          }}
                        />
                      </div>
                    </div>
                  ))}
                  <div className="analytics-funnel-foot">
                    <span>
                      <strong>{acquisition.pending.length}</strong> awaiting a
                      decision
                    </span>
                    <span>
                      <strong>{acquisition.declined.length}</strong> declined
                    </span>
                  </div>
                  <p className="analytics-note">
                    Approved includes converted clients. Pending applications
                    remain open opportunities.
                  </p>
                </Panel>
              </div>
              <Panel
                title="Where demand comes from"
                subtitle="Compare volume and outcomes. Small samples are directional."
                action={
                  <div className="analytics-toggle">
                    <button
                      aria-pressed={group === "sources"}
                      onClick={() => setGroup("sources")}
                    >
                      Sources
                    </button>
                    <button
                      aria-pressed={group === "packages"}
                      onClick={() => setGroup("packages")}
                    >
                      Packages
                    </button>
                  </div>
                }
              >
                {quality.length ? (
                  <div className="analytics-quality">
                    {quality.map((row, i) => (
                      <div className="analytics-quality-row" key={row.name}>
                        <span className="analytics-rank">
                          {String(i + 1).padStart(2, "0")}
                        </span>
                        <div>
                          <strong>{row.name}</strong>
                          <div className="analytics-track">
                            <span
                              style={{
                                width: `${(row.leads / Math.max(...quality.map((r) => r.leads))) * 100}%`,
                                background: colors[0],
                              }}
                            />
                          </div>
                        </div>
                        <span>
                          <strong>{row.leads}</strong> applications
                        </span>
                        <span>
                          <strong>
                            {displayRate((row.converted / row.leads) * 100)}
                          </strong>{" "}
                          converted
                          {row.leads < 10 && <small>Small sample</small>}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <Empty>
                    No applications match this lead scope. Change the filters or
                    date range.
                  </Empty>
                )}
              </Panel>
              <Panel
                title="Financial performance"
                subtitle="Revenue, receivables, refunds, and renewals."
                action={<CircleDollarSign className="analytics-panel-icon" />}
              >
                <div className="analytics-connection">
                  <div>
                    <span className="analytics-tag">
                      Payment data not connected
                    </span>
                    <h3>
                      A clear view of your money starts with transactions.
                    </h3>
                    <p>
                      The app does not yet store client payment or renewal
                      records. Package prices and converted leads cannot
                      establish revenue or paying-client conversion.
                    </p>
                  </div>
                  <Link to="/pt-hub/payments" className="analytics-link">
                    Open payments <ArrowUpRight size={16} />
                  </Link>
                </div>
              </Panel>
            </>
          )}
          {view === "coaching" && (
            <>
              <div className="analytics-metrics">
                <Metric
                  label="Workout completion"
                  value={displayRate(delivery.workoutRate)}
                  detail={`${delivery.completed.length} of ${delivery.workouts.length} scheduled workouts · rest days excluded`}
                  icon={<Activity />}
                />
                <Metric
                  label="Check-in submission"
                  value={displayRate(delivery.checkinRate)}
                  detail={`${delivery.submitted.length} of ${delivery.checkins.length} check-ins due in this period`}
                  icon={<BarChart3 />}
                />
                <Metric
                  label="Review turnaround"
                  value={
                    delivery.medianReviewHours === null
                      ? "—"
                      : `${delivery.medianReviewHours.toFixed(1)}h`
                  }
                  detail="Median submission-to-review time · reviews completed in period"
                  icon={<Activity />}
                />
                <Metric
                  label="Awaiting review"
                  value={delivery.waiting.length}
                  detail="Submitted check-ins · all dates"
                  icon={<Layers3 />}
                />
              </div>
              <div className="analytics-feature-grid">
                <Panel
                  title="Coaching delivery"
                  subtitle="Completion against scheduled work in the selected period."
                >
                  <div className="analytics-delivery-bars">
                    <RateBar
                      label="Workouts completed"
                      count={delivery.completed.length}
                      total={delivery.workouts.length}
                    />
                    <RateBar
                      label="Check-ins submitted"
                      count={delivery.submitted.length}
                      total={delivery.checkins.length}
                      color={colors[1]}
                    />
                    <RateBar
                      label="Active clients with recent activity"
                      count={delivery.engaged}
                      total={delivery.uniqueActive}
                      color={colors[3]}
                    />
                  </div>
                  <p className="analytics-note">
                    Includes work due today. Activity means a recorded workout,
                    check-in, or message; it does not measure progress toward a
                    goal.
                  </p>
                </Panel>
                <Panel
                  title="Client mix"
                  subtitle={`${delivery.current.length} current workspace memberships · ${delivery.uniqueClients} unique people`}
                >
                  {delivery.lifecycle.length ? (
                    <div className="analytics-donut-layout">
                      <div
                        className="analytics-donut"
                        role="img"
                        aria-label="Client membership lifecycle breakdown"
                      >
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={delivery.lifecycle}
                              dataKey="value"
                              nameKey="name"
                              innerRadius="65%"
                              outerRadius="88%"
                              paddingAngle={3}
                              stroke="none"
                              isAnimationActive={false}
                            >
                              {delivery.lifecycle.map((s) => (
                                <Cell
                                  key={s.name}
                                  fill={lifecycleColor(s.name)}
                                />
                              ))}
                            </Pie>
                            <Tooltip contentStyle={tooltipStyle} />
                          </PieChart>
                        </ResponsiveContainer>
                        <div className="analytics-donut-center">
                          <strong>{delivery.current.length}</strong>
                          <span>memberships</span>
                        </div>
                      </div>
                      <ul className="analytics-donut-key">
                        {delivery.lifecycle.map((s) => (
                          <li key={s.name}>
                            <i style={{ background: lifecycleColor(s.name) }} />
                            <span>{s.name}</span>
                            <strong>{s.value}</strong>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : (
                    <Empty>No current client memberships in this scope.</Empty>
                  )}
                </Panel>
              </div>
              <Panel
                title="Follow-up queue"
                subtitle="Open the client behind each missed check-in or outstanding review."
                action={
                  <button
                    className="analytics-link"
                    onClick={() => setShowFollowup((v) => !v)}
                    aria-expanded={showFollowup}
                  >
                    {showFollowup ? "Hide clients" : "Show clients"}
                    <ChevronDown size={16} />
                  </button>
                }
              >
                <div className="analytics-inline-stats">
                  <div>
                    <strong>{delivery.atRisk.length}</strong>
                    <span>active memberships at risk</span>
                  </div>
                  <div>
                    <strong>{delivery.overdue.length}</strong>
                    <span>unsubmitted check-ins past due in period</span>
                  </div>
                  <div>
                    <strong>{delivery.waiting.length}</strong>
                    <span>check-ins awaiting review · all dates</span>
                  </div>
                </div>
                {showFollowup &&
                  (followup.length ? (
                    <div className="analytics-followup">
                      {followup.map((c) => (
                        <Link
                          key={c.id}
                          to={`/pt/clients/${c.id}?tab=checkins${waitingIds.has(c.id) ? `&checkin=${delivery.waiting.find((r) => r.client_id === c.id)!.id}` : ""}`}
                        >
                          <div>
                            <strong>{c.display_name || "Client"}</strong>
                            <small>
                              {
                                workspaces.find((w) => w.id === c.workspace_id)
                                  ?.name
                              }
                            </small>
                          </div>
                          <span>
                            {waitingIds.has(c.id)
                              ? "Review submitted check-in"
                              : "Check-in overdue"}
                            <ArrowUpRight size={16} />
                          </span>
                        </Link>
                      ))}
                    </div>
                  ) : (
                    <Empty>
                      No outstanding check-in follow-ups in this scope.
                    </Empty>
                  ))}
              </Panel>
              <Panel
                title="Outcomes & continuity"
                subtitle="Recorded assessments and lifecycle changes, with clear limits."
              >
                <div className="analytics-inline-stats">
                  <div>
                    <strong>{delivery.assessed.length}</strong>
                    <span>assessments submitted in period</span>
                  </div>
                  <div>
                    <strong>{delivery.newClients}</strong>
                    <span>unique client accounts added</span>
                  </div>
                  <div>
                    <strong>{delivery.ended.length}</strong>
                    <span>
                      currently churned memberships last changed in period
                    </span>
                  </div>
                </div>
                <p className="analytics-note">
                  Assessment completion is not goal achievement. Retention
                  cohorts, renewal rates, and comparable goal progress require
                  historical records that are not available here yet.
                </p>
                {delivery.ended.length > 0 && (
                  <ul className="analytics-reasons">
                    {delivery.ended.map((c) => (
                      <li key={c.id}>
                        {c.display_name || "Client"}:{" "}
                        {c.churn_reason || "No reason recorded"}
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
            </>
          )}
          {view === "workspaces" && (
            <>
              <div className="analytics-metrics">
                <Metric
                  label="Workspaces in scope"
                  value={scopedWorkspaces.length}
                  detail="Owned and shared spaces you can access"
                  icon={<Building2 />}
                />
                <Metric
                  label="Unique clients"
                  value={delivery.uniqueClients}
                  detail="People counted once across current memberships"
                  icon={<Users />}
                />
                <Metric
                  label="Active memberships"
                  value={delivery.active.length}
                  detail="Workload counted in each workspace"
                  icon={<Layers3 />}
                />
                <Metric
                  label="Combined completion"
                  value={displayRate(delivery.workoutRate)}
                  detail={`${delivery.completed.length} completed / ${delivery.workouts.length} scheduled · weighted by workouts`}
                  icon={<Activity />}
                />
              </div>
              <Panel
                title="Workspace comparison"
                subtitle="Delivery volume, completion, and current coaching workload."
              >
                <div className="analytics-workspace-list">
                  {scopedWorkspaces.length ? (
                    scopedWorkspaces.map((w, i) => {
                      const d = buildDeliveryAnalytics(records, range, w.id);
                      return (
                        <article key={w.id} className="analytics-workspace">
                          <div className="analytics-workspace-title">
                            <span className="analytics-workspace-number">
                              {String(i + 1).padStart(2, "0")}
                            </span>
                            <div>
                              <h3>{w.name}</h3>
                              <small>
                                {w.relation === "owned"
                                  ? "Owned workspace"
                                  : "Shared workspace"}
                                {w.clientAccessMode === "assigned_clients_only"
                                  ? " · Assigned clients only"
                                  : " · Accessible clients"}
                              </small>
                            </div>
                            <Link
                              className="analytics-link"
                              to={`/w/${w.slug}/overview`}
                              aria-label={`Open ${w.name}`}
                            >
                              <ArrowUpRight size={20} />
                            </Link>
                          </div>
                          <div className="analytics-workspace-stats">
                            <div>
                              <strong>{d.active.length}</strong>
                              <span>active memberships</span>
                            </div>
                            <div>
                              <strong>{d.atRisk.length}</strong>
                              <span>at risk</span>
                            </div>
                            <div>
                              <strong>{d.waiting.length}</strong>
                              <span>awaiting review</span>
                            </div>
                            <div>
                              <strong>{d.newClients}</strong>
                              <span>new client accounts</span>
                            </div>
                          </div>
                          <div className="analytics-workspace-bars">
                            <RateBar
                              label="Workout completion"
                              count={d.completed.length}
                              total={d.workouts.length}
                            />
                            <RateBar
                              label="Check-in submission"
                              count={d.submitted.length}
                              total={d.checkins.length}
                              color={colors[1]}
                            />
                          </div>
                        </article>
                      );
                    })
                  ) : (
                    <Empty>No accessible workspaces yet.</Empty>
                  )}
                </div>
              </Panel>
              <p className="analytics-note">
                Overall rates use combined completed and scheduled counts.
                People are deduplicated by account; workspace memberships remain
                separate to represent workload. Permissions may limit
                shared-workspace coverage.
              </p>
            </>
          )}
          <details className="analytics-coverage">
            <summary>
              About this data <ChevronDown size={15} />
            </summary>
            <div>
              <p>
                Scope: all accessible owned and shared workspaces by default.
                Client access permissions are respected. Archived relationships
                contribute to historical delivery, while current client counts
                use active relationships.
              </p>
              <p>
                Dates use UTC. Acquisition conversion compares the current
                status of leads submitted in the selected period. The timeline
                uses submission and conversion event dates independently. Lead
                package and source filters do not change coaching metrics.
              </p>
              <p>
                Financial transactions, renewals, historical retention, coach
                responsibility, and standardized goal outcomes are not
                connected. No revenue, retention, coach-capacity, or outcome
                estimates are substituted for missing records.
              </p>
            </div>
          </details>
        </>
      )}
    </main>
  );
}

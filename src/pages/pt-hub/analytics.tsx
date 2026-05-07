import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AlertTriangle, RefreshCw, ShieldAlert } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "../../components/ui/alert";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { EmptyState } from "../../components/ui/coachos/empty-state";
import { Skeleton } from "../../components/ui/coachos/skeleton";
import { PtHubPageHeader } from "../../features/pt-hub/components/pt-hub-page-header";
import { PtHubSectionCard } from "../../features/pt-hub/components/pt-hub-section-card";
import {
  buildPtHubAnalyticsSnapshot,
  formatAnalyticsDurationDays,
  formatAnalyticsPercent,
  PT_HUB_ANALYTICS_RANGE_OPTIONS,
  type PtHubAnalyticsFilters,
  type PtHubAnalyticsKpi,
  type PtHubAnalyticsQualityGroup,
  type PtHubAnalyticsQualityRow,
  type PtHubAnalyticsStage,
  type PtHubAnalyticsWorkspaceRow,
} from "../../features/pt-hub/lib/pt-hub-analytics-v1";
import {
  usePtHubClients,
  usePtHubLeads,
  usePtHubWorkspaces,
  usePtPackages,
} from "../../features/pt-hub/lib/pt-hub";
import {
  getSemanticToneClasses,
  type SemanticTone,
} from "../../lib/semantic-status";
import { type ModuleTone } from "../../lib/module-tone";
import { cn } from "../../lib/utils";

const axisColor = "oklch(0.98 0 0 / 0.88)";

type FunnelGap = {
  fromLabel: string;
  toLabel: string;
  dropCount: number;
  dropPercent: number;
  stageId: PtHubAnalyticsStage["id"];
};

function getLargestFunnelGap(stages: PtHubAnalyticsStage[]): FunnelGap | null {
  let largest: FunnelGap | null = null;

  for (let index = 1; index < stages.length; index += 1) {
    const previous = stages[index - 1];
    const current = stages[index];
    if (!previous || !current || previous.count <= 0) continue;
    const dropCount = Math.max(0, previous.count - current.count);
    const dropPercent =
      previous.count > 0 ? (dropCount / previous.count) * 100 : 0;
    if (!largest || dropCount > largest.dropCount) {
      largest = {
        fromLabel: previous.label,
        toLabel: current.label,
        dropCount,
        dropPercent,
        stageId: current.id,
      };
    }
  }

  return largest;
}

const formatMetricDelta = (delta: number | null | undefined, suffix = "") => {
  if (typeof delta !== "number" || Number.isNaN(delta)) return null;
  const rounded = Math.round(delta);
  return `${rounded > 0 ? "+" : rounded < 0 ? "-" : ""}${Math.abs(rounded)}${suffix}`;
};

function rankQualityRows(rows: PtHubAnalyticsQualityRow[]) {
  return [...rows].sort((left, right) => {
    if (left.lowSample !== right.lowSample) {
      return left.lowSample ? 1 : -1;
    }
    const rightScore = right.conversionRate ?? -1;
    const leftScore = left.conversionRate ?? -1;
    if (rightScore !== leftScore) return rightScore - leftScore;
    if (right.leads !== left.leads) return right.leads - left.leads;
    return left.label.localeCompare(right.label);
  });
}

function getMaxConversionRate(rows: Array<{ conversionRate: number | null }>) {
  return rows.reduce((max, row) => {
    if (typeof row.conversionRate !== "number") return max;
    return Math.max(max, row.conversionRate);
  }, 0);
}

function getMaxWorkspaceConversions(rows: PtHubAnalyticsWorkspaceRow[]) {
  return rows.reduce((max, row) => Math.max(max, row.conversions), 0);
}

function AnalyticsLoadingState() {
  return (
    <section className="space-y-4">
      <div className="space-y-3">
        <Skeleton className="h-28 w-full rounded-[30px]" />
        <Skeleton className="ml-auto h-12 w-[15rem] rounded-full" />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.08fr)_minmax(0,0.92fr)]">
        <div className="grid gap-4 md:grid-cols-2">
          {Array.from({ length: 2 }).map((_, index) => (
            <Skeleton
              key={`loading-kpi-left-${index}`}
              className="h-[172px] w-full rounded-[28px]"
            />
          ))}
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {Array.from({ length: 2 }).map((_, index) => (
            <Skeleton
              key={`loading-kpi-right-${index}`}
              className="h-[172px] w-full rounded-[28px]"
            />
          ))}
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.08fr)_minmax(0,0.92fr)]">
        <Skeleton className="h-[22rem] w-full rounded-[30px]" />
        <Skeleton className="h-[22rem] w-full rounded-[30px]" />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.08fr)_minmax(0,0.92fr)]">
        <Skeleton className="h-[20rem] w-full rounded-[30px]" />
        <Skeleton className="h-[20rem] w-full rounded-[30px]" />
      </div>
    </section>
  );
}

function getAnalyticsBarClassName({
  module = "analytics",
  faded = false,
}: {
  module?: ModuleTone;
  faded?: boolean;
}) {
  return faded
    ? `bg-[oklch(var(--module-${module}-text)/0.34)]`
    : `bg-[oklch(var(--module-${module}-text))]`;
}

function TrendLegendItem({
  label,
  colorClassName,
  value,
}: {
  label: string;
  colorClassName: string;
  value: number;
}) {
  return (
    <div className="flex items-center gap-2 rounded-full border border-border/60 bg-background/28 px-3 py-1.5 text-xs text-muted-foreground">
      <span
        aria-hidden
        className={cn("h-2.5 w-2.5 rounded-full", colorClassName)}
      />
      <span className="uppercase tracking-[0.16em]">{label}</span>
      <span className="font-semibold text-foreground">{value}</span>
    </div>
  );
}

function RankedQualityRow({
  row,
  index,
  maxConversionRate,
  selected,
  onClick,
}: {
  row: PtHubAnalyticsQualityRow;
  index: number;
  maxConversionRate: number;
  selected: boolean;
  onClick: () => void;
}) {
  const conversionWidth =
    maxConversionRate > 0 && row.conversionRate !== null
      ? Math.max(14, Math.round((row.conversionRate / maxConversionRate) * 100))
      : 0;

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "pt-hub-interactive grid w-full gap-4 rounded-[22px] border px-4 py-3.5 text-left transition-colors lg:grid-cols-[56px_minmax(0,1.15fr)_84px_128px_128px]",
        selected
          ? "border-primary/32 bg-primary/8"
          : "border-transparent bg-background/28 hover:border-primary/20 hover:bg-background/44",
      )}
    >
      <div className="flex items-center gap-3">
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border/60 bg-background/72 text-sm font-semibold text-foreground">
          {index + 1}
        </span>
      </div>

      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-medium text-foreground">{row.label}</p>
          {row.lowSample ? <Badge variant="muted">Low sample</Badge> : null}
          {selected ? <Badge variant="info">Filtered</Badge> : null}
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-background/72">
          <div
            className={cn(
              "h-full rounded-full",
              row.lowSample ? "bg-muted-foreground/60" : "bg-primary",
            )}
            style={{ width: `${conversionWidth}%` }}
          />
        </div>
      </div>

      <div>
        <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
          Leads
        </p>
        <p className="mt-1 text-sm font-medium text-foreground">{row.leads}</p>
      </div>

      <div>
        <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
          Approval
        </p>
        <p className="mt-1 text-sm font-medium text-foreground">
          {formatAnalyticsPercent(row.approvalRate)}
        </p>
      </div>

      <div>
        <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
          Conversion
        </p>
        <p className="mt-1 text-sm font-medium text-foreground">
          {formatAnalyticsPercent(row.conversionRate)}
        </p>
      </div>
    </button>
  );
}

function SpeedMetric({
  label,
  value,
  detail,
  tone = "neutral",
  action,
}: {
  label: string;
  value: string;
  detail: string;
  tone?: SemanticTone;
  action?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded-[22px] border p-4",
        tone === "neutral"
          ? "border-border/60 bg-background/30"
          : getSemanticToneClasses(tone).surface,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1.5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            {label}
          </p>
          <p className="text-xl font-semibold tracking-tight text-foreground">
            {value}
          </p>
        </div>
        {action}
      </div>
      <span className="sr-only">{detail}</span>
    </div>
  );
}

function AnalysisMetricCard({
  label,
  kpi,
  tone = "analytics",
  suffix,
  onClick,
}: {
  label: string;
  kpi: PtHubAnalyticsKpi;
  tone?: ModuleTone;
  suffix?: string;
  onClick: () => void;
}) {
  const deltaLabel = formatMetricDelta(kpi.delta, suffix);
  const isPositive = typeof kpi.delta === "number" && kpi.delta > 0;
  const isNegative = typeof kpi.delta === "number" && kpi.delta < 0;
  const signalWidth =
    typeof kpi.delta === "number"
      ? Math.max(18, Math.min(100, 52 + Math.abs(Math.round(kpi.delta)) * 6))
      : kpi.unavailable
        ? 24
        : 52;

  return (
    <button
      type="button"
      onClick={onClick}
      className="group rounded-[22px] border border-border/60 bg-background/28 p-4 text-left transition-colors hover:border-primary/24 hover:bg-background/42 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/45"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            {label}
          </p>
          <p className="mt-2 truncate text-xl font-semibold tracking-tight text-foreground">
            {kpi.value}
          </p>
        </div>
        {deltaLabel ? (
          <Badge
            variant={isPositive ? "success" : isNegative ? "warning" : "muted"}
            className="shrink-0"
          >
            {deltaLabel}
          </Badge>
        ) : null}
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-background/70">
        <div
          className={cn(
            "h-full rounded-full transition-[width] duration-300",
            kpi.unavailable && "bg-muted-foreground/45",
          )}
          style={{
            width: `${signalWidth}%`,
            backgroundColor: kpi.unavailable
              ? undefined
              : `oklch(var(--module-${tone}-text))`,
          }}
        />
      </div>
      <span className="sr-only">{kpi.helper}</span>
    </button>
  );
}

function FunnelOverview({
  stages,
  largestGap,
  onStageClick,
}: {
  stages: PtHubAnalyticsStage[];
  largestGap: FunnelGap | null;
  onStageClick: (stage: PtHubAnalyticsStage) => void;
}) {
  const maxCount = stages[0]?.count ?? 0;

  return (
    <div className="flex h-full min-h-[22rem] flex-col rounded-[24px] border border-border/60 bg-background/24 p-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-foreground">
            Conversion map
          </p>
        </div>
        {largestGap ? (
          <Badge variant="warning">
            {largestGap.dropCount} lost after {largestGap.fromLabel}
          </Badge>
        ) : (
          <Badge variant="success">No major leak</Badge>
        )}
      </div>

      <div className="grid flex-1 gap-3">
        {stages.map((stage, index) => {
          const width =
            maxCount > 0
              ? Math.max(18, Math.round((stage.count / maxCount) * 100))
              : 0;
          const previous = index > 0 ? stages[index - 1] : null;
          const dropCount = previous
            ? Math.max(0, previous.count - stage.count)
            : 0;
          const isLargestDropOff = largestGap?.stageId === stage.id;

          return (
            <button
              key={stage.id}
              type="button"
              onClick={() => onStageClick(stage)}
              className={cn(
                "grid min-h-[6.25rem] rounded-[22px] border p-4 text-left transition-colors hover:bg-background/44 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/45 sm:grid-cols-[minmax(0,0.8fr)_minmax(12rem,1fr)_minmax(7rem,auto)] sm:items-center sm:gap-5",
                isLargestDropOff
                  ? "border-warning/35 bg-warning/8"
                  : "border-border/55 bg-background/30",
              )}
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                    {stage.label}
                  </p>
                  {isLargestDropOff ? (
                    <Badge variant="warning" className="shrink-0">
                      Leak
                    </Badge>
                  ) : null}
                </div>
                <p className="mt-2 text-3xl font-semibold text-foreground tabular-nums">
                  {stage.count}
                </p>
              </div>

              <div className="mt-4 min-w-0 sm:mt-0">
                <div className="mb-2 flex items-center justify-between gap-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  <span>
                    {stage.conversionFromPrevious === null
                      ? "Starting volume"
                      : `${Math.round(stage.conversionFromPrevious)}% forward`}
                  </span>
                  {previous ? (
                    <span className={isLargestDropOff ? "text-warning" : ""}>
                      {dropCount} lost
                    </span>
                  ) : null}
                </div>
                <div className="h-6 overflow-hidden rounded-full bg-background/70">
                  <div
                    className={cn(
                      "flex h-full items-center rounded-full px-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-primary-foreground",
                      isLargestDropOff
                        ? "bg-warning"
                        : getAnalyticsBarClassName({}),
                    )}
                    style={{ width: `${width}%` }}
                  >
                    {width >= 36 ? `${width}%` : ""}
                  </div>
                </div>
              </div>

              <div className="mt-4 flex items-center justify-between gap-3 sm:mt-0 sm:justify-end">
                <Badge
                  variant={
                    stage.conversionFromPrevious === null
                      ? "muted"
                      : isLargestDropOff
                        ? "warning"
                        : "info"
                  }
                >
                  {stage.conversionFromPrevious === null
                    ? "Start"
                    : `${Math.round(stage.conversionFromPrevious)}%`}
                </Badge>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function HealthMetric({
  label,
  value,
  detail,
  onClick,
}: {
  label: string;
  value: string;
  detail: string;
  onClick?: (() => void) | null;
}) {
  const content = (
    <div className="space-y-2 rounded-[22px] border border-border/60 bg-background/28 p-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </p>
      <p className="text-xl font-semibold tracking-tight text-foreground">
        {value}
      </p>
      <span className="sr-only">{detail}</span>
    </div>
  );

  if (!onClick) return content;

  return (
    <button
      type="button"
      className="block h-full w-full text-left"
      onClick={onClick}
    >
      {content}
    </button>
  );
}

function AnalyticsRangeRail({
  rangeKey,
  previousRangeLabel,
  onChange,
}: {
  rangeKey: PtHubAnalyticsFilters["rangeKey"];
  previousRangeLabel: string;
  onChange: (rangeKey: PtHubAnalyticsFilters["rangeKey"]) => void;
}) {
  return (
    <div className="w-full min-w-[16rem] max-w-[18rem] space-y-1 overflow-hidden">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[0.68rem] font-semibold leading-none text-muted-foreground">
          Date range
        </p>
        <p className="truncate text-right text-[0.68rem] font-medium leading-none text-muted-foreground">
          vs {previousRangeLabel}
        </p>
      </div>
      <nav
        className="pt-hub-tab-rail pt-hub-analytics-range-rail h-9 w-full justify-center overflow-hidden"
        aria-label="Date range for all analytics"
      >
        {PT_HUB_ANALYTICS_RANGE_OPTIONS.map((option) => {
          const selected = rangeKey === option.value;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onChange(option.value)}
              data-state={selected ? "active" : "inactive"}
              className={cn(
                "pt-hub-tab-trigger pt-hub-analytics-range-trigger group flex-1 uppercase tracking-[0.14em]",
                selected ? "text-foreground" : "text-muted-foreground",
              )}
              aria-pressed={selected}
            >
              {selected ? (
                <span className="pt-hub-tab-active-pill absolute inset-0 rounded-[18px] border" />
              ) : null}
              <span className="relative z-10">{option.label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}

function TrendDataSummary({
  rangeLabel,
  bucketLabel,
  totals,
  points,
}: {
  rangeLabel: string;
  bucketLabel: string;
  totals: {
    leadsCreated: number;
    approvedLeads: number;
    convertedClients: number;
  };
  points: Array<{
    label: string;
    leadsCreated: number;
    approvedLeads: number;
    convertedClients: number;
  }>;
}) {
  return (
    <div className="rounded-[22px] border border-border/60 bg-background/28 p-4">
      <p className="text-sm font-medium text-foreground">
        {rangeLabel}: {totals.leadsCreated} leads, {totals.approvedLeads}{" "}
        approved, {totals.convertedClients} converted.
      </p>
      <span className="sr-only">
        The chart uses {bucketLabel.toLowerCase()} buckets. The table contains
        the same data for keyboard and screen-reader review.
      </span>
      <details className="mt-3">
        <summary className="cursor-pointer text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          View trend data table
        </summary>
        <div className="mt-3 max-h-44 overflow-auto rounded-2xl border border-border/55">
          <table className="w-full min-w-[32rem] text-left text-sm">
            <caption className="sr-only">
              {bucketLabel} lead trend data for {rangeLabel}
            </caption>
            <thead className="bg-background/44 text-xs text-muted-foreground">
              <tr>
                <th scope="col" className="px-3 py-2 font-semibold">
                  Period
                </th>
                <th scope="col" className="px-3 py-2 font-semibold">
                  Leads
                </th>
                <th scope="col" className="px-3 py-2 font-semibold">
                  Approved
                </th>
                <th scope="col" className="px-3 py-2 font-semibold">
                  Converted
                </th>
              </tr>
            </thead>
            <tbody>
              {points.map((point) => (
                <tr key={point.label} className="border-t border-border/45">
                  <th
                    scope="row"
                    className="px-3 py-2 font-medium text-foreground"
                  >
                    {point.label}
                  </th>
                  <td className="px-3 py-2 text-muted-foreground">
                    {point.leadsCreated}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {point.approvedLeads}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {point.convertedClients}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}

function WorkspaceComparisonRow({
  row,
  maxConversions,
  selected,
  onClick,
}: {
  row: PtHubAnalyticsWorkspaceRow;
  maxConversions: number;
  selected: boolean;
  onClick: () => void;
}) {
  const conversionWidth =
    maxConversions > 0
      ? Math.max(12, Math.round((row.conversions / maxConversions) * 100))
      : 0;

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "pt-hub-interactive grid w-full gap-4 rounded-[22px] border px-4 py-3.5 text-left transition-colors lg:grid-cols-[minmax(0,1.1fr)_90px_110px_120px_120px]",
        selected
          ? "border-primary/32 bg-primary/8"
          : "border-transparent bg-background/28 hover:border-primary/20 hover:bg-background/44",
      )}
    >
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-medium text-foreground">
            {row.workspaceName}
          </p>
          {selected ? <Badge variant="info">Selected</Badge> : null}
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-background/72">
          <div
            className="h-full rounded-full bg-primary"
            style={{ width: `${conversionWidth}%` }}
          />
        </div>
      </div>

      <div>
        <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
          Leads
        </p>
        <p className="mt-1 text-sm font-medium text-foreground">{row.leads}</p>
      </div>

      <div>
        <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
          Conversions
        </p>
        <p className="mt-1 text-sm font-medium text-foreground">
          {row.conversions}
        </p>
      </div>

      <div>
        <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
          Active clients
        </p>
        <p className="mt-1 text-sm font-medium text-foreground">
          {row.activeClients}
        </p>
      </div>

      <div>
        <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
          At-risk rate
        </p>
        <p className="mt-1 text-sm font-medium text-foreground">
          {formatAnalyticsPercent(row.atRiskRate)}
        </p>
      </div>
    </button>
  );
}

export function PtHubAnalyticsPage() {
  const navigate = useNavigate();
  const leadsQuery = usePtHubLeads();
  const clientsQuery = usePtHubClients();
  const workspacesQuery = usePtHubWorkspaces();
  const packagesQuery = usePtPackages();
  const [qualityGroup, setQualityGroup] =
    useState<PtHubAnalyticsQualityGroup>("source");
  const [filters, setFilters] = useState<PtHubAnalyticsFilters>({
    rangeKey: "30d",
    workspaceId: "all",
    packageKey: "all",
    sourceKey: "all",
  });

  const leads = useMemo(() => leadsQuery.data ?? [], [leadsQuery.data]);
  const clients = useMemo(() => clientsQuery.data ?? [], [clientsQuery.data]);
  const workspaces = useMemo(
    () => workspacesQuery.data ?? [],
    [workspacesQuery.data],
  );
  const packages = useMemo(
    () => packagesQuery.data ?? [],
    [packagesQuery.data],
  );

  const snapshot = useMemo(
    () =>
      buildPtHubAnalyticsSnapshot({
        leads,
        clients,
        workspaces,
        packages,
        filters,
      }),
    [clients, filters, leads, packages, workspaces],
  );

  const isLoading =
    (leadsQuery.isLoading && !leadsQuery.data) ||
    (clientsQuery.isLoading && !clientsQuery.data) ||
    (workspacesQuery.isLoading && !workspacesQuery.data) ||
    (packagesQuery.isLoading && !packagesQuery.data);
  const error =
    leadsQuery.error ||
    clientsQuery.error ||
    workspacesQuery.error ||
    packagesQuery.error;

  const largestGap = useMemo(
    () => getLargestFunnelGap(snapshot.funnel),
    [snapshot.funnel],
  );
  const qualityRows = useMemo(
    () =>
      rankQualityRows(
        qualityGroup === "source"
          ? snapshot.quality.bySource
          : snapshot.quality.byPackage,
      ),
    [qualityGroup, snapshot.quality.byPackage, snapshot.quality.bySource],
  );
  const maxQualityConversion = useMemo(
    () => getMaxConversionRate(qualityRows),
    [qualityRows],
  );
  const maxWorkspaceConversions = useMemo(
    () => getMaxWorkspaceConversions(snapshot.workspacePerformance),
    [snapshot.workspacePerformance],
  );
  const trendTotals = useMemo(
    () =>
      snapshot.trend.reduce(
        (accumulator, point) => ({
          leadsCreated: accumulator.leadsCreated + point.leadsCreated,
          approvedLeads: accumulator.approvedLeads + point.approvedLeads,
          convertedClients:
            accumulator.convertedClients + point.convertedClients,
        }),
        { leadsCreated: 0, approvedLeads: 0, convertedClients: 0 },
      ),
    [snapshot.trend],
  );
  const activeTrendBucketCount = useMemo(
    () =>
      snapshot.trend.filter(
        (point) =>
          point.leadsCreated > 0 ||
          point.approvedLeads > 0 ||
          point.convertedClients > 0,
      ).length,
    [snapshot.trend],
  );
  if (isLoading) {
    return <AnalyticsLoadingState />;
  }

  if (error) {
    return (
      <section className="space-y-4">
        <PtHubPageHeader
          eyebrow="Analytics"
          title="Business health"
          description="Demand, leaks, response, and risk."
        />

        <PtHubSectionCard
          title="Analytics unavailable"
          description="One or more PT Hub queries could not be loaded right now."
          actions={
            <Button
              variant="secondary"
              onClick={() => {
                void leadsQuery.refetch();
                void clientsQuery.refetch();
                void workspacesQuery.refetch();
                void packagesQuery.refetch();
              }}
            >
              <RefreshCw className="h-4 w-4 [stroke-width:1.7]" />
              Retry
            </Button>
          }
        >
          <Alert tone="danger">
            <AlertTitle>
              We could not assemble the PT Hub analytics view
            </AlertTitle>
            <AlertDescription>
              {error instanceof Error
                ? error.message
                : "A PT Hub data dependency failed while building the business-health page."}
            </AlertDescription>
          </Alert>
        </PtHubSectionCard>
      </section>
    );
  }

  return (
    <section className="pt-hub-page-stack">
      <PtHubPageHeader
        eyebrow="Analytics"
        title="Business health"
        description="Demand, leaks, response, and client risk."
      />

      <div className="grid gap-5">
        <PtHubSectionCard
          title="Business Command Center"
          description="Current performance at a glance."
          module="analytics"
          contentClassName="space-y-5"
          actions={
            <AnalyticsRangeRail
              rangeKey={filters.rangeKey}
              previousRangeLabel={snapshot.previousRangeLabel}
              onChange={(rangeKey) =>
                setFilters((current) => ({
                  ...current,
                  rangeKey,
                }))
              }
            />
          }
        >
          <div className="max-w-3xl space-y-2">
            <p className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
              {largestGap
                ? `${largestGap.dropCount} leads are leaking between ${largestGap.fromLabel.toLowerCase()} and ${largestGap.toLabel.toLowerCase()}.`
                : snapshot.emptyStates.hasAnyRangeLeads
                  ? "The funnel is holding steady in this range."
                  : "No submitted demand landed in this range yet."}
            </p>
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <AnalysisMetricCard
              label="Submitted demand"
              kpi={snapshot.topKpis.newLeads}
              tone="leads"
              onClick={() => navigate("/pt-hub/leads")}
            />
            <AnalysisMetricCard
              label="Conversion"
              kpi={snapshot.topKpis.conversion}
              tone="leads"
              suffix="%"
              onClick={() => navigate("/pt-hub/leads?status=converted")}
            />
            <AnalysisMetricCard
              label="Median response"
              kpi={snapshot.topKpis.medianFirstResponse}
              tone="leads"
              onClick={() =>
                navigate("/pt-hub/leads?status=new&attention=waiting24h")
              }
            />
            <AnalysisMetricCard
              label="Active clients"
              kpi={snapshot.topKpis.activeClients}
              tone="clients"
              onClick={() => navigate("/pt-hub/clients?lifecycle=active")}
            />
          </div>
        </PtHubSectionCard>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.08fr)_minmax(0,0.92fr)]">
        <PtHubSectionCard
          title="Lead funnel"
          description="Volume, conversion, and drop-off."
          contentClassName="space-y-4"
        >
          {snapshot.emptyStates.hasAnyRangeLeads ? (
            <>
              <FunnelOverview
                stages={snapshot.funnel}
                largestGap={largestGap}
                onStageClick={(stage) => navigate(stage.href)}
              />
            </>
          ) : (
            <EmptyState
              title="No submitted demand in this range"
              description={
                snapshot.emptyStates.hasAnyLeads
                  ? "There are PT Hub leads overall, but none fall inside the selected date range or filter mix."
                  : "New inquiries will appear here."
              }
              className="rounded-[24px] border-border/70 bg-background/28"
            />
          )}
        </PtHubSectionCard>

        <PtHubSectionCard
          title="Lead trend"
          description={`${snapshot.bucketLabel} demand and outcomes.`}
          contentClassName="space-y-4"
        >
          {snapshot.trend.length > 0 ? (
            <>
              {activeTrendBucketCount <= 1 ? (
                <Alert tone="info" className="border-info/20 bg-info/6">
                  <AlertTitle>Low activity range</AlertTitle>
                  <AlertDescription>
                    {activeTrendBucketCount === 0
                      ? "No active periods"
                      : "One active period"}{" "}
                    in this range.
                  </AlertDescription>
                </Alert>
              ) : null}

              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap gap-2">
                  <TrendLegendItem
                    label="Leads"
                    colorClassName="bg-[oklch(var(--chart-1))]"
                    value={trendTotals.leadsCreated}
                  />
                  <TrendLegendItem
                    label="Approved"
                    colorClassName="bg-[oklch(var(--chart-3))]"
                    value={trendTotals.approvedLeads}
                  />
                  <TrendLegendItem
                    label="Converted"
                    colorClassName="bg-[oklch(var(--chart-2))]"
                    value={trendTotals.convertedClients}
                  />
                </div>
                <Badge variant="muted">{snapshot.bucketLabel}</Badge>
              </div>

              <TrendDataSummary
                rangeLabel={snapshot.rangeLabel}
                bucketLabel={snapshot.bucketLabel}
                totals={trendTotals}
                points={snapshot.trend}
              />

              <div className="h-[16rem] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={snapshot.trend}
                    margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="oklch(0.35 0.02 260 / 0.35)"
                    />
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 11, fill: axisColor }}
                      axisLine={{ stroke: axisColor }}
                      tickLine={{ stroke: axisColor }}
                    />
                    <YAxis
                      allowDecimals={false}
                      width={32}
                      tick={{ fontSize: 11, fill: axisColor }}
                      axisLine={{ stroke: axisColor }}
                      tickLine={{ stroke: axisColor }}
                    />
                    <Tooltip
                      contentStyle={{
                        borderRadius: 18,
                        border: "1px solid oklch(var(--border-strong)/0.45)",
                        background:
                          "linear-gradient(180deg, oklch(var(--bg-surface-elevated)/0.92), oklch(var(--bg-surface)/0.88))",
                        boxShadow: "0 24px 60px -42px rgba(0,0,0,0.85)",
                      }}
                    />
                    <Legend wrapperStyle={{ display: "none" }} />
                    <Line
                      type="monotone"
                      dataKey="leadsCreated"
                      stroke="oklch(var(--chart-1))"
                      strokeWidth={2.6}
                      dot={false}
                      activeDot={{ r: 4 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="approvedLeads"
                      stroke="oklch(var(--chart-3))"
                      strokeWidth={2.3}
                      dot={false}
                      activeDot={{ r: 4 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="convertedClients"
                      stroke="oklch(var(--chart-2))"
                      strokeWidth={2.3}
                      dot={false}
                      activeDot={{ r: 4 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </>
          ) : (
            <EmptyState
              title="No trend to chart yet"
              description="Leads in this range will chart here."
              className="rounded-[24px] border-border/70 bg-background/28"
            />
          )}
        </PtHubSectionCard>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.08fr)_minmax(0,0.92fr)]">
        <PtHubSectionCard
          title="Lead quality"
          description="Ranked sources and packages."
          actions={
            <div className="flex flex-wrap gap-2">
              <Button
                variant={qualityGroup === "source" ? "default" : "secondary"}
                size="sm"
                onClick={() => setQualityGroup("source")}
              >
                By source
              </Button>
              <Button
                variant={qualityGroup === "package" ? "default" : "secondary"}
                size="sm"
                onClick={() => setQualityGroup("package")}
              >
                By package
              </Button>
            </div>
          }
          contentClassName="space-y-4"
        >
          {qualityRows.length > 0 ? (
            <div className="space-y-2 rounded-[26px] border border-border/70 bg-background/24 p-2">
              <div className="hidden grid-cols-[56px_minmax(0,1.15fr)_84px_128px_128px] gap-4 rounded-[20px] border border-border/60 bg-background/48 px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground lg:grid">
                <span>Rank</span>
                <span>{qualityGroup === "source" ? "Source" : "Package"}</span>
                <span>Leads</span>
                <span>Approval</span>
                <span>Conversion</span>
              </div>
              {qualityRows.map((row, index) => {
                const selected =
                  qualityGroup === "source"
                    ? filters.sourceKey === row.key
                    : filters.packageKey === row.key;
                return (
                  <RankedQualityRow
                    key={row.key}
                    row={row}
                    index={index}
                    maxConversionRate={maxQualityConversion}
                    selected={selected}
                    onClick={() => {
                      if (qualityGroup === "source") {
                        setFilters((current) => ({
                          ...current,
                          sourceKey: row.key,
                        }));
                      } else {
                        setFilters((current) => ({
                          ...current,
                          packageKey: row.key,
                        }));
                      }
                    }}
                  />
                );
              })}
            </div>
          ) : (
            <EmptyState
              title="No quality breakdown yet"
              description="Lead volume will rank here."
              className="rounded-[24px] border-border/70 bg-background/28"
            />
          )}
        </PtHubSectionCard>

        <PtHubSectionCard
          title="Speed to action"
          description="Response timing."
          contentClassName="space-y-3"
        >
          <SpeedMetric
            label="Median first response"
            value={snapshot.topKpis.medianFirstResponse.value}
            detail={
              snapshot.topKpis.medianFirstResponse.unavailable
                ? "Unavailable until dedicated response events are stored."
                : "Median time from submission to first PT response."
            }
            tone={
              snapshot.topKpis.medianFirstResponse.unavailable
                ? "warning"
                : "neutral"
            }
          />
          <SpeedMetric
            label="Leads waiting >24h"
            value={String(snapshot.speed.leadsWaitingMoreThan24h)}
            detail="Open new leads older than 24 hours."
            tone={
              snapshot.speed.leadsWaitingMoreThan24h > 0 ? "danger" : "neutral"
            }
            action={
              <Button
                variant="secondary"
                size="sm"
                onClick={() =>
                  navigate("/pt-hub/leads?status=new&attention=waiting24h")
                }
              >
                Open
              </Button>
            }
          />
          <div className="grid gap-3 md:grid-cols-2">
            <SpeedMetric
              label="Avg days new -> approved"
              value={formatAnalyticsDurationDays(
                snapshot.speed.averageDaysNewToApproved,
              )}
              detail="Unavailable until approval events are timestamped."
              tone="warning"
            />
            <SpeedMetric
              label="Avg days approved -> converted"
              value={formatAnalyticsDurationDays(
                snapshot.speed.averageDaysApprovedToConverted,
              )}
              detail="Unavailable until approval timing is explicit."
              tone="warning"
            />
          </div>
        </PtHubSectionCard>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.08fr)_minmax(0,0.92fr)]">
        <PtHubSectionCard
          title="Client risk and delivery health"
          description="Risk and check-in coverage."
          contentClassName="space-y-4"
        >
          <div className="rounded-[24px] border border-border/60 bg-background/24 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border/60 bg-background/44 text-warning">
                  <ShieldAlert
                    className="h-4 w-4 [stroke-width:1.7]"
                    aria-hidden="true"
                  />
                </span>
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    {snapshot.clientHealth.atRiskClients > 0
                      ? `${snapshot.clientHealth.atRiskClients} clients need stability review`
                      : "No client risk exceptions are active"}
                  </p>
                </div>
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => navigate("/pt-hub/clients?segment=at_risk")}
              >
                Open clients
              </Button>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <HealthMetric
              label="Active at risk"
              value={String(snapshot.clientHealth.atRiskActiveClients)}
              detail="Active clients currently flagged for coaching risk."
              onClick={() => navigate("/pt-hub/clients?segment=at_risk")}
            />
            <HealthMetric
              label="Overdue check-ins"
              value={String(snapshot.clientHealth.overdueCheckinClients)}
              detail="Clients with overdue delivery follow-up."
              onClick={() =>
                navigate("/pt-hub/clients?segment=checkin_overdue")
              }
            />
            <HealthMetric
              label={`Paused in ${filters.rangeKey.toUpperCase()}`}
              value={String(snapshot.clientHealth.pausedInPeriod)}
              detail="Current paused clients whose latest lifecycle change landed in the selected range."
              onClick={() => navigate("/pt-hub/clients?lifecycle=paused")}
            />
            <HealthMetric
              label={`Churned in ${filters.rangeKey.toUpperCase()}`}
              value={String(snapshot.clientHealth.churnedInPeriod)}
              detail="Current churned clients whose latest lifecycle change landed in the selected range."
              onClick={() => navigate("/pt-hub/clients?lifecycle=churned")}
            />
          </div>
        </PtHubSectionCard>

        <PtHubSectionCard
          title="Workspace performance"
          description="Space-by-space comparison."
          contentClassName="space-y-4"
        >
          {snapshot.workspacePerformance.length > 1 ? (
            <div className="space-y-2 rounded-[26px] border border-border/70 bg-background/24 p-2">
              <div className="hidden grid-cols-[minmax(0,1.1fr)_90px_110px_120px_120px] gap-4 rounded-[20px] border border-border/60 bg-background/48 px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground lg:grid">
                <span>Workspace</span>
                <span>Leads</span>
                <span>Conversions</span>
                <span>Active clients</span>
                <span>At-risk rate</span>
              </div>
              {snapshot.workspacePerformance.map((row) => (
                <WorkspaceComparisonRow
                  key={row.workspaceId}
                  row={row}
                  maxConversions={maxWorkspaceConversions}
                  selected={filters.workspaceId === row.workspaceId}
                  onClick={() =>
                    setFilters((current) => ({
                      ...current,
                      workspaceId: row.workspaceId,
                    }))
                  }
                />
              ))}
            </div>
          ) : snapshot.workspacePerformance.length === 1 ? (
            <div className="space-y-3 rounded-[24px] border border-border/60 bg-background/24 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="muted">Single workspace</Badge>
                <p className="text-sm text-muted-foreground">
                  Add another space to compare.
                </p>
              </div>
              <div className="grid gap-3 md:grid-cols-4">
                <HealthMetric
                  label="Workspace"
                  value={snapshot.workspacePerformance[0]!.workspaceName}
                  detail="Current coaching space"
                />
                <HealthMetric
                  label="Attributed leads"
                  value={String(snapshot.workspacePerformance[0]!.leads)}
                  detail="Leads already attached to this space"
                />
                <HealthMetric
                  label="Conversions"
                  value={String(snapshot.workspacePerformance[0]!.conversions)}
                  detail="Converted in the selected range"
                />
                <HealthMetric
                  label="At-risk rate"
                  value={formatAnalyticsPercent(
                    snapshot.workspacePerformance[0]!.atRiskRate,
                  )}
                  detail="Across active clients in this space"
                />
              </div>
            </div>
          ) : (
            <EmptyState
              title="No workspace comparison yet"
              description="Multiple spaces will compare here."
              className="rounded-[24px] border-border/70 bg-background/28"
            />
          )}
        </PtHubSectionCard>
      </div>

      <PtHubSectionCard
        title="Tracking coverage"
        description="Current analytics limits."
        contentClassName="space-y-3"
      >
        <Alert tone="info" className="border-info/20 bg-info/6">
          <AlertTitle>Instrumentation is still partial</AlertTitle>
          <AlertDescription>
            Unavailable metrics stay labeled instead of estimated.
          </AlertDescription>
        </Alert>

        <div className="grid gap-3 md:grid-cols-3">
          {snapshot.setupItems.map((item) => (
            <div
              key={item.id}
              className="rounded-[20px] border border-border/55 bg-background/24 p-3.5"
            >
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 text-warning [stroke-width:1.7]" />
                <div className="space-y-1">
                  <p className="text-sm font-medium text-foreground">
                    {item.label}
                  </p>
                  <span className="sr-only">{item.detail}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </PtHubSectionCard>
    </section>
  );
}

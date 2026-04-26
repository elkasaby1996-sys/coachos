import { useMemo, useState, type ComponentType } from "react";
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
import {
  AlertTriangle,
  ArrowRight,
  Clock3,
  MessageSquarePlus,
  RefreshCw,
  ShieldAlert,
  TrendingUp,
  UsersRound,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "../../components/ui/alert";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { EmptyState } from "../../components/ui/coachos/empty-state";
import { Skeleton } from "../../components/ui/coachos/skeleton";
import { StatCard } from "../../components/ui/coachos/stat-card";
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

const buildMetricDelta = (
  delta: number | null | undefined,
  suffix = "",
): { value: string; tone: "positive" | "negative" | "neutral" } | null => {
  if (typeof delta !== "number" || Number.isNaN(delta)) return null;
  const rounded = Math.round(delta);
  return {
    value: `${rounded > 0 ? "+" : rounded < 0 ? "-" : ""}${Math.abs(rounded)}${suffix}`,
    tone: rounded === 0 ? "neutral" : rounded > 0 ? "positive" : "negative",
  };
};

function getLargestFunnelGap(stages: PtHubAnalyticsStage[]): FunnelGap | null {
  let largest: FunnelGap | null = null;

  for (let index = 1; index < stages.length; index += 1) {
    const previous = stages[index - 1];
    const current = stages[index];
    if (!previous || !current || previous.count <= 0) continue;
    const dropCount = Math.max(0, previous.count - current.count);
    const dropPercent = previous.count > 0 ? (dropCount / previous.count) * 100 : 0;
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
            <Skeleton key={`loading-kpi-left-${index}`} className="h-[172px] w-full rounded-[28px]" />
          ))}
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {Array.from({ length: 2 }).map((_, index) => (
            <Skeleton key={`loading-kpi-right-${index}`} className="h-[172px] w-full rounded-[28px]" />
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

function AnalyticsKpiCard({
  label,
  icon,
  kpi,
  suffix,
  onClick,
  module,
}: {
  label: string;
  icon: ComponentType<{ className?: string }>;
  kpi: PtHubAnalyticsKpi;
  suffix?: string;
  onClick: () => void;
  module: ModuleTone;
}) {
  const unavailable = Boolean(kpi.unavailable);

  return (
    <StatCard
      surface="pt-hub"
      module={module}
      label={label}
      value={kpi.value}
      helper={kpi.helper}
      icon={icon}
      accent={!unavailable}
      onClick={onClick}
      className={cn(
        "min-h-[172px]",
        unavailable && "border-border/60 opacity-90 shadow-[var(--surface-shadow)]",
      )}
      delta={buildMetricDelta(kpi.delta, suffix)}
    />
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

function FunnelStageRow({
  stage,
  previousCount,
  maxCount,
  isLargestDropOff,
  onClick,
}: {
  stage: PtHubAnalyticsStage;
  previousCount: number | null;
  maxCount: number;
  isLargestDropOff: boolean;
  onClick: () => void;
}) {
  const width = maxCount > 0 ? Math.max(18, Math.round((stage.count / maxCount) * 100)) : 0;
  const dropCount =
    previousCount !== null ? Math.max(0, previousCount - stage.count) : 0;
  const acceptedPercent =
    previousCount && previousCount > 0
      ? Math.max(0, Math.min(100, Math.round((stage.count / previousCount) * 100)))
      : 100;
  const lostPercent =
    previousCount && previousCount > 0 ? Math.max(0, 100 - acceptedPercent) : 0;

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "pt-hub-interactive group w-full rounded-[24px] border px-4 py-4 text-left transition-colors",
        isLargestDropOff
          ? "border-warning/35 bg-warning/6 hover:border-warning/45 hover:bg-warning/10"
          : "border-border/60 bg-background/34 hover:border-primary/24 hover:bg-background/48",
      )}
    >
      <div className="grid gap-4 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.2fr)_140px] lg:items-center">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              {stage.label}
            </p>
            {isLargestDropOff ? <Badge variant="warning">Biggest drop-off</Badge> : null}
          </div>
          <p className="text-[1.95rem] font-semibold uppercase tracking-[0.04em] text-foreground">
            {stage.count}
          </p>
        </div>

        <div className="space-y-2.5">
          {stage.conversionFromPrevious === null ? (
            <>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  <span>Submitted demand</span>
                  <span>{stage.count}</span>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-background/75">
                  <div
                    className={cn(
                      "h-full rounded-full",
                      getAnalyticsBarClassName({}),
                    )}
                    style={{ width: `${width}%` }}
                  />
                </div>
              </div>
              <p className="text-sm text-muted-foreground">
                Base submitted demand in the selected range.
              </p>
            </>
          ) : (
            <>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  <span>Accepted vs lost</span>
                  <span>{acceptedPercent}% / {lostPercent}%</span>
                </div>
                <div className="h-3 overflow-hidden rounded-full bg-background/75">
                  <div className="flex h-full w-full">
                    <div
                      className="h-full bg-[var(--state-success-text)]"
                      style={{ width: `${acceptedPercent}%` }}
                    />
                    <div
                      className="h-full bg-[var(--state-danger-text)]"
                      style={{ width: `${lostPercent}%` }}
                    />
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                <span>{stage.count} accepted</span>
                <span>{dropCount} lost</span>
              </div>
              <p className="text-sm text-muted-foreground">
                {Math.round(stage.conversionFromPrevious)}% moved forward from the previous stage.
              </p>
            </>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 lg:flex-col lg:items-end">
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
          {previousCount !== null ? (
            <p
              className={cn(
                "text-xs font-medium uppercase tracking-[0.16em]",
                isLargestDropOff ? "text-warning" : "text-muted-foreground",
              )}
            >
              {dropCount} lost
            </p>
          ) : null}
        </div>
      </div>
    </button>
  );
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
      <span aria-hidden className={cn("h-2.5 w-2.5 rounded-full", colorClassName)} />
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
      <p className="mt-3 text-sm leading-6 text-muted-foreground">{detail}</p>
    </div>
  );
}

function AttentionItem({
  label,
  value,
  detail,
  tone,
  ctaLabel,
  onClick,
}: {
  label: string;
  value: string;
  detail: string;
  tone: SemanticTone;
  ctaLabel: string;
  onClick: () => void;
}) {
  const toneStyles = getSemanticToneClasses(tone);

  return (
    <button
      type="button"
      onClick={onClick}
      className="pt-hub-interactive group w-full rounded-[22px] border border-transparent bg-background/30 px-4 py-4 text-left transition-colors hover:border-primary/18 hover:bg-background/46"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 gap-3">
          <span
            aria-hidden
            className={cn("mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full", toneStyles.marker)}
          />
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={tone}>{label}</Badge>
              <span className="text-sm font-medium text-foreground">{value}</span>
            </div>
            <p className="text-sm leading-6 text-muted-foreground">{detail}</p>
          </div>
        </div>
        <span className="inline-flex items-center gap-1 text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
          {ctaLabel}
          <ArrowRight className="h-3.5 w-3.5 [stroke-width:1.7]" />
        </span>
      </div>
    </button>
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
      <p className="text-xl font-semibold tracking-tight text-foreground">{value}</p>
      <p className="text-sm leading-6 text-muted-foreground">{detail}</p>
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

type AttentionListItem = {
  id: string;
  label: string;
  value: string;
  detail: string;
  tone: SemanticTone;
  ctaLabel: string;
  onClick: () => void;
};

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
          <p className="text-sm font-medium text-foreground">{row.workspaceName}</p>
          {selected ? <Badge variant="info">Selected</Badge> : null}
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-background/72">
          <div className="h-full rounded-full bg-primary" style={{ width: `${conversionWidth}%` }} />
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
        <p className="mt-1 text-sm font-medium text-foreground">{row.conversions}</p>
      </div>

      <div>
        <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
          Active clients
        </p>
        <p className="mt-1 text-sm font-medium text-foreground">{row.activeClients}</p>
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

  const largestGap = useMemo(() => getLargestFunnelGap(snapshot.funnel), [snapshot.funnel]);
  const maxFunnelCount = snapshot.funnel[0]?.count ?? 0;
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
          convertedClients: accumulator.convertedClients + point.convertedClients,
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
  const attentionItems = useMemo(
    (): AttentionListItem[] => [
      {
        id: "waiting",
        label: "Leads waiting >24h",
        value: String(snapshot.speed.leadsWaitingMoreThan24h),
        detail: "These new leads are the fastest current leak in the PT Hub pipeline.",
        tone:
          snapshot.speed.leadsWaitingMoreThan24h > 0 ? "danger" : "neutral",
        ctaLabel: "Open leads",
        onClick: () => navigate("/pt-hub/leads?status=new&attention=waiting24h"),
      },
      {
        id: "risk",
        label: "At-risk clients",
        value: String(snapshot.clientHealth.atRiskClients),
        detail: "Risk stays independent from lifecycle so the PT can spot instability early.",
        tone:
          snapshot.clientHealth.atRiskClients > 0 ? "danger" : "neutral",
        ctaLabel: "Open clients",
        onClick: () => navigate("/pt-hub/clients?segment=at_risk"),
      },
      {
        id: "overdue",
        label: "Overdue check-ins",
        value: String(snapshot.clientHealth.overdueCheckinClients),
        detail: "A compact delivery-health exception list keeps overdue follow-up visible.",
        tone:
          snapshot.clientHealth.overdueCheckinClients > 0 ? "warning" : "neutral",
        ctaLabel: "Review",
        onClick: () => navigate("/pt-hub/clients?segment=checkin_overdue"),
      },
    ],
    [
      navigate,
      snapshot.clientHealth.atRiskClients,
      snapshot.clientHealth.overdueCheckinClients,
      snapshot.speed.leadsWaitingMoreThan24h,
    ],
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
          description="Track where demand is growing, where business is leaking, and what needs action today."
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
            <AlertTitle>We could not assemble the PT Hub analytics view</AlertTitle>
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
    <section className="space-y-4">
      <PtHubPageHeader
        eyebrow="Analytics"
        title="Business health"
        description="See where demand is growing, where business is leaking, and what needs coach attention today."
      />

      <div className="flex justify-center py-2">
        <nav
          className="pt-hub-tab-rail mx-auto h-auto min-h-[3.75rem] w-full max-w-xl justify-center"
          aria-label="Analytics date range"
        >
          {PT_HUB_ANALYTICS_RANGE_OPTIONS.map((option) => {
            const selected = filters.rangeKey === option.value;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() =>
                  setFilters((current) => ({
                    ...current,
                    rangeKey: option.value,
                  }))
                }
                data-state={selected ? "active" : "inactive"}
                className={cn(
                  "pt-hub-tab-trigger group flex-1 uppercase tracking-[0.18em]",
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

      <div className="page-kpi-block grid gap-4 xl:grid-cols-[minmax(0,1.08fr)_minmax(0,0.92fr)]">
        <div className="grid gap-4 md:grid-cols-2">
          <AnalyticsKpiCard
            label="New leads"
            icon={MessageSquarePlus}
            kpi={snapshot.topKpis.newLeads}
            onClick={() => navigate("/pt-hub/leads")}
            module="leads"
          />
          <AnalyticsKpiCard
            label="Lead-to-client conversion"
            icon={TrendingUp}
            kpi={snapshot.topKpis.conversion}
            suffix="%"
            onClick={() => navigate("/pt-hub/leads?status=converted")}
            module="leads"
          />
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <AnalyticsKpiCard
            label="Median first response"
            icon={Clock3}
            kpi={snapshot.topKpis.medianFirstResponse}
            onClick={() => navigate("/pt-hub/leads?status=new&attention=waiting24h")}
            module="leads"
          />
          <AnalyticsKpiCard
            label="Active clients"
            icon={UsersRound}
            kpi={snapshot.topKpis.activeClients}
            onClick={() => navigate("/pt-hub/clients?lifecycle=active")}
            module="clients"
          />
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.08fr)_minmax(0,0.92fr)]">
        <PtHubSectionCard
          title="Lead funnel"
          description="Stage conversion and drop-off. The strongest leak is visually promoted so the PT can spot it first."
          contentClassName="space-y-4"
        >
          {snapshot.emptyStates.hasAnyRangeLeads ? (
            <>
              {largestGap ? (
                <div className="rounded-[22px] border border-warning/30 bg-warning/8 px-4 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="space-y-1">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-warning">
                        Biggest drop-off
                      </p>
                      <p className="text-sm font-medium text-foreground">
                        {largestGap.fromLabel} to {largestGap.toLabel}
                      </p>
                    </div>
                    <Badge variant="warning">
                      {largestGap.dropCount} lost ({Math.round(largestGap.dropPercent)}%)
                    </Badge>
                  </div>
                </div>
              ) : null}

              <div className="space-y-3">
                {snapshot.funnel.map((stage, index) => (
                  <FunnelStageRow
                    key={stage.id}
                    stage={stage}
                    previousCount={index > 0 ? snapshot.funnel[index - 1]?.count ?? null : null}
                    maxCount={maxFunnelCount}
                    isLargestDropOff={largestGap?.stageId === stage.id}
                    onClick={() => navigate(stage.href)}
                  />
                ))}
              </div>
            </>
          ) : (
            <EmptyState
              title="No submitted demand in this range"
              description={
                snapshot.emptyStates.hasAnyLeads
                  ? "There are PT Hub leads overall, but none fall inside the selected date range or filter mix."
                  : "New inquiries will appear here once the coach page starts collecting applications."
              }
              className="rounded-[24px] border-border/70 bg-background/28"
            />
          )}
        </PtHubSectionCard>

        <PtHubSectionCard
          title="Lead trend"
          description={`${snapshot.bucketLabel} trend for submitted demand and downstream outcomes. Clean lines keep time comparison readable.`}
          contentClassName="space-y-4"
        >
          {snapshot.trend.length > 0 ? (
            <>
              {activeTrendBucketCount <= 1 ? (
                <Alert tone="info" className="border-info/20 bg-info/6">
                  <AlertTitle>Why this chart looks quiet</AlertTitle>
                  <AlertDescription>
                    Only {activeTrendBucketCount === 0 ? "zero active periods are" : "one active period is"} in the selected range, so the chart has no visible slope yet. As more days or weeks carry activity, this line will start showing direction instead of a single point.
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
              description="Once leads land inside the selected range, this chart will show submitted demand plus approval and conversion outcomes."
              className="rounded-[24px] border-border/70 bg-background/28"
            />
          )}
        </PtHubSectionCard>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.08fr)_minmax(0,0.92fr)]">
        <PtHubSectionCard
          title="Lead quality"
          description="A ranked decision table. Stronger performers float up, while low-sample rows stay visible but visually de-emphasized."
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
                        setFilters((current) => ({ ...current, sourceKey: row.key }));
                      } else {
                        setFilters((current) => ({ ...current, packageKey: row.key }));
                      }
                    }}
                  />
                );
              })}
            </div>
          ) : (
            <EmptyState
              title="No quality breakdown yet"
              description="This table will rank sources and package interests once submitted lead volume exists inside the selected range."
              className="rounded-[24px] border-border/70 bg-background/28"
            />
          )}
        </PtHubSectionCard>

        <PtHubSectionCard
          title="Speed to action"
          description="Compact timing metrics keep attention on response delays, while unavailable timing stays visibly secondary."
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
            tone={snapshot.topKpis.medianFirstResponse.unavailable ? "warning" : "neutral"}
          />
          <SpeedMetric
            label="Leads waiting >24h"
            value={String(snapshot.speed.leadsWaitingMoreThan24h)}
            detail="Open new leads older than 24 hours."
            tone={snapshot.speed.leadsWaitingMoreThan24h > 0 ? "danger" : "neutral"}
            action={
              <Button
                variant="secondary"
                size="sm"
                onClick={() => navigate("/pt-hub/leads?status=new&attention=waiting24h")}
              >
                Open
              </Button>
            }
          />
          <div className="grid gap-3 md:grid-cols-2">
            <SpeedMetric
              label="Avg days new -> approved"
              value={formatAnalyticsDurationDays(snapshot.speed.averageDaysNewToApproved)}
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
          description="Exceptions come first here so the PT can see urgent client issues before slower-moving lifecycle summaries."
          contentClassName="space-y-4"
        >
          <div className="rounded-[24px] border border-border/60 bg-background/24 p-3">
            <div className="mb-3 flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-warning [stroke-width:1.7]" />
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                Needs attention now
              </p>
            </div>
            <div className="space-y-2">
              {attentionItems.map((item) => (
                <AttentionItem
                  key={item.id}
                  label={item.label}
                  value={item.value}
                  detail={item.detail}
                  tone={item.tone}
                  ctaLabel={item.ctaLabel}
                  onClick={item.onClick}
                />
              ))}
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
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
          description="A comparison surface, not a summary list. Ranking and inline bars make stronger spaces stand out faster."
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
                  Comparison becomes meaningful once more than one coaching space is active.
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
                  value={formatAnalyticsPercent(snapshot.workspacePerformance[0]!.atRiskRate)}
                  detail="Across active clients in this space"
                />
              </div>
            </div>
          ) : (
            <EmptyState
              title="No workspace comparison yet"
              description="Once multiple coaching spaces are active, this table will compare converted demand, client volume, and risk side by side."
              className="rounded-[24px] border-border/70 bg-background/28"
            />
          )}
        </PtHubSectionCard>
      </div>

      <PtHubSectionCard
        title="Tracking coverage"
        description="Unavailable upstream analytics are visually subordinate here so live business metrics stay dominant."
        contentClassName="space-y-3"
      >
        <Alert tone="info" className="border-info/20 bg-info/6">
          <AlertTitle>Instrumentation is still partial</AlertTitle>
          <AlertDescription>
            This page prefers honest unavailable states over decorative placeholders or invented metrics.
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
                  <p className="text-sm font-medium text-foreground">{item.label}</p>
                  <p className="text-sm leading-6 text-muted-foreground">{item.detail}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </PtHubSectionCard>
    </section>
  );
}

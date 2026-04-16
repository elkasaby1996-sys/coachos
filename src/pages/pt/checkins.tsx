import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  CalendarClock,
  ClipboardCheck,
  TimerReset,
} from "lucide-react";
import { Button } from "../../components/ui/button";
import {
  DashboardCard,
  EmptyState,
  Skeleton,
  StatCard,
  StatusPill,
} from "../../components/ui/coachos";
import { WorkspacePageHeader } from "../../components/pt/workspace-page-header";
import { supabase } from "../../lib/supabase";
import { useWorkspace } from "../../lib/use-workspace";
import { addDaysToDateString, getTodayInTimezone } from "../../lib/date-utils";
import { cn } from "../../lib/utils";
import { formatRelativeTime } from "../../lib/relative-time";
import {
  checkinOperationalStatusMap,
  getCheckinOperationalState,
  type CheckinOperationalState,
} from "../../lib/checkin-review";
import { useWindowedRows } from "../../hooks/use-windowed-rows";

type ClientRow = {
  id: string;
  display_name: string | null;
  user_id: string | null;
  status: string | null;
};

type CheckinRow = {
  id: string;
  client_id: string | null;
  week_ending_saturday: string | null;
  submitted_at: string | null;
  reviewed_at: string | null;
  reviewed_by_user_id: string | null;
};

const formatCheckinDate = (dateStr: string | null) => {
  if (!dateStr) return "No due date";
  const date = new Date(`${dateStr}T00:00:00Z`);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
};

const formatCheckinDateTime = (dateStr: string | null) => {
  if (!dateStr) return "Not submitted yet";
  return new Date(dateStr).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

type QueueRow = {
  client: ClientRow;
  checkin: CheckinRow;
  status: CheckinOperationalState;
};

export function PtCheckinsQueuePage() {
  const navigate = useNavigate();
  const { workspaceId } = useWorkspace();

  const todayStr = useMemo(() => getTodayInTimezone(null), []);
  const queueStartDate = useMemo(
    () => addDaysToDateString(todayStr, -45),
    [todayStr],
  );
  const queueEndDate = useMemo(
    () => addDaysToDateString(todayStr, 14),
    [todayStr],
  );

  const checkinsQuery = useQuery({
    queryKey: ["pt-checkins-queue", workspaceId, queueStartDate, queueEndDate],
    enabled: !!workspaceId && !!queueStartDate && !!queueEndDate,
    queryFn: async () => {
      const { error: ensureError } = await supabase.rpc(
        "ensure_workspace_checkins",
        {
          p_workspace_id: workspaceId ?? "",
          p_range_start: queueStartDate,
          p_range_end: queueEndDate,
        },
      );
      if (ensureError) throw ensureError;

      const { data, error } = await supabase
        .from("checkins")
        .select(
          "id, client_id, week_ending_saturday, submitted_at, reviewed_at, reviewed_by_user_id, client:clients(id, display_name, user_id, status)",
        )
        .gte("week_ending_saturday", queueStartDate)
        .lte("week_ending_saturday", queueEndDate)
        .eq("client.workspace_id", workspaceId ?? "")
        .order("week_ending_saturday", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Array<
        CheckinRow & { client: ClientRow | ClientRow[] | null }
      >;
    },
  });

  const queueRows = useMemo<QueueRow[]>(() => {
    return (checkinsQuery.data ?? []).map((row) => {
      const clientRow = Array.isArray(row.client) ? row.client[0] : row.client;
      const client: ClientRow = clientRow ?? {
        id: row.client_id ?? "",
        display_name: null,
        user_id: null,
        status: null,
      };
      return {
        client,
        checkin: row,
        status: getCheckinOperationalState(row, todayStr),
      };
    });
  }, [checkinsQuery.data, todayStr]);

  const isLoading = checkinsQuery.isLoading;
  const upcomingCount = queueRows.filter(
    (row) => row.status === "upcoming",
  ).length;
  const dueCount = queueRows.filter((row) => row.status === "due").length;
  const overdueCount = queueRows.filter(
    (row) => row.status === "overdue",
  ).length;
  const submittedCount = queueRows.filter(
    (row) => row.status === "submitted",
  ).length;

  const queueSections = useMemo(
    () => [
      {
        key: "due-now" as const,
        title: "Due now",
        emptyTitle: "No check-ins due now",
        emptyDescription: "Nothing needs immediate review.",
      },
      {
        key: "overdue" as const,
        title: "Overdue",
        emptyTitle: "No overdue check-ins",
        emptyDescription: "Nothing is overdue right now.",
      },
      {
        key: "upcoming" as const,
        title: "Soon",
        emptyTitle: "No upcoming check-ins",
        emptyDescription: "Future scheduled check-ins will appear here.",
      },
    ],
    [],
  );

  const dueNowRows = useMemo(
    () =>
      queueRows.filter(
        (row) => row.status === "submitted" || row.status === "due",
      ),
    [queueRows],
  );
  const overdueRows = useMemo(
    () => queueRows.filter((row) => row.status === "overdue"),
    [queueRows],
  );
  const upcomingRows = useMemo(
    () => queueRows.filter((row) => row.status === "upcoming"),
    [queueRows],
  );

  const dueNowWindow = useWindowedRows({
    rows: dueNowRows,
    initialCount: 10,
    step: 10,
    resetKey: dueNowRows.length,
  });
  const overdueWindow = useWindowedRows({
    rows: overdueRows,
    initialCount: 10,
    step: 10,
    resetKey: overdueRows.length,
  });
  const upcomingWindow = useWindowedRows({
    rows: upcomingRows,
    initialCount: 10,
    step: 10,
    resetKey: upcomingRows.length,
  });

  const renderQueueRows = (
    rows: QueueRow[],
    actionLabel: string,
    subdued = false,
  ) => (
    <div className="space-y-3">
      {rows.map((row) => {
        const name = row.client.display_name?.trim()
          ? row.client.display_name
          : row.client.user_id
            ? `Client ${row.client.user_id.slice(0, 6)}`
            : "Client";
        const recentLabel = row.checkin.reviewed_at
          ? `Reviewed ${formatRelativeTime(row.checkin.reviewed_at)}`
          : row.checkin.submitted_at
            ? `Submitted ${formatRelativeTime(row.checkin.submitted_at)}`
            : row.status === "overdue"
              ? "Needs outreach"
              : row.status === "due"
                ? "Due now"
                : "Scheduled";
        const urgencyLabel =
          row.status === "submitted"
            ? "Submitted"
            : row.status === "overdue"
              ? "High urgency"
              : row.status === "due"
                ? "Due today"
                : row.status === "upcoming"
                  ? "Upcoming"
                  : "Resolved";
        const readinessLabel =
          row.status === "submitted"
            ? "Ready for PT review"
            : row.status === "overdue"
              ? "Waiting on client"
              : row.status === "due"
                ? "Due today"
                : "Scheduled ahead";
        const missingItems =
          row.status === "submitted"
            ? ["Coach review"]
            : row.status === "overdue"
              ? ["Submission", "Client follow-up"]
              : row.status === "due"
                ? ["Submission"]
                : ["No missing items"];
        return (
          <div
            key={row.checkin.id}
            className={cn(
              "ops-surface-strong px-4 py-4 transition hover:border-border hover:bg-card/95",
              subdued && "bg-secondary/14",
            )}
          >
            <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
              <div className="min-w-0 flex-1 space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-base font-semibold text-foreground">
                        {name}
                      </span>
                      <StatusPill
                        status={row.status}
                        statusMap={checkinOperationalStatusMap}
                      />
                      <span className="ops-chip text-muted-foreground">
                        {urgencyLabel}
                      </span>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      Week ending{" "}
                      {formatCheckinDate(row.checkin.week_ending_saturday)}
                    </div>
                  </div>

                  <div className="ops-stat min-w-[180px] space-y-1 xl:w-[220px]">
                    <div className="ops-kicker">Direct Action</div>
                    <div className="text-sm font-semibold text-foreground">
                      {row.status === "submitted"
                        ? "Open review and leave feedback"
                        : row.status === "overdue"
                          ? "Follow up before it slips"
                          : row.status === "due"
                            ? "Monitor for submission"
                            : "Keep in upcoming queue"}
                    </div>
                  </div>
                </div>

                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                  <div className="ops-stat">
                    <div className="ops-kicker">Due State</div>
                    <div className="mt-1 text-sm font-semibold text-foreground">
                      {formatCheckinDate(row.checkin.week_ending_saturday)}
                    </div>
                  </div>
                  <div className="ops-stat">
                    <div className="ops-kicker">Review Readiness</div>
                    <div className="mt-1 text-sm font-semibold text-foreground">
                      {readinessLabel}
                    </div>
                  </div>
                  <div className="ops-stat">
                    <div className="ops-kicker">Missing Items</div>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {missingItems.map((item) => (
                        <span
                          key={item}
                          className="ops-chip text-muted-foreground"
                        >
                          {item}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="ops-stat">
                    <div className="ops-kicker">Latest Movement</div>
                    <div className="mt-1 text-sm font-semibold text-foreground">
                      {recentLabel}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {row.checkin.submitted_at
                        ? formatCheckinDateTime(row.checkin.submitted_at)
                        : (row.client.status ?? "No client status")}
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() =>
                    navigate(
                      row.status === "submitted" || row.status === "reviewed"
                        ? `/pt/clients/${row.client.id}?tab=checkins&checkin=${row.checkin.id}`
                        : `/pt/clients/${row.client.id}?tab=checkins`,
                    )
                  }
                >
                  {actionLabel}
                </Button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );

  return (
    <div className="space-y-6">
      <WorkspacePageHeader
        title="Check-in Queue"
        actions={
          <Button
            variant="secondary"
            onClick={() => navigate("/pt/checkins/templates")}
          >
            Manage templates
          </Button>
        }
      />

      <div className="page-kpi-block grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Submitted"
          value={submittedCount}
          helper="Ready for review"
          icon={ClipboardCheck}
          accent
          className="h-full"
        />
        <StatCard
          label="Overdue"
          value={overdueCount}
          helper="Needs follow-up"
          icon={AlertTriangle}
          className="h-full"
        />
        <StatCard
          label="Due now"
          value={dueCount}
          helper="Waiting today"
          icon={CalendarClock}
          className="h-full"
        />
        <StatCard
          label="Soon"
          value={upcomingCount}
          helper="Coming up next"
          icon={TimerReset}
          className="h-full"
        />
      </div>

      <div className="space-y-6">
        {queueSections.map((section) => {
          const rows =
            section.key === "due-now"
              ? dueNowRows
              : section.key === "overdue"
                ? overdueRows
                : upcomingRows;
          const windowed =
            section.key === "due-now"
              ? dueNowWindow
              : section.key === "overdue"
                ? overdueWindow
                : upcomingWindow;
          return (
            <DashboardCard key={section.key} title={section.title}>
              {isLoading ? (
                <div className="space-y-3">
                  {Array.from({ length: 3 }).map((_, index) => (
                    <Skeleton key={index} className="h-28 w-full" />
                  ))}
                </div>
              ) : rows.length === 0 ? (
                <EmptyState
                  title={section.emptyTitle}
                  description={section.emptyDescription}
                />
              ) : (
                <div className="space-y-4">
                  {renderQueueRows(
                    windowed.visibleRows,
                    section.key === "due-now" ? "Review" : "Open",
                  )}
                  {windowed.hasHiddenRows ? (
                    <div className="flex justify-center">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={windowed.showMore}
                      >
                        Show {Math.min(windowed.hiddenCount, 10)} more
                      </Button>
                    </div>
                  ) : null}
                </div>
              )}
            </DashboardCard>
          );
        })}
      </div>
    </div>
  );
}

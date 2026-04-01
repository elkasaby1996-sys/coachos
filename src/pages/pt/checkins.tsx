import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Button } from "../../components/ui/button";
import {
  DashboardCard,
  EmptyState,
  Skeleton,
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
        return (
          <div
            key={row.checkin.id}
            className={cn(
              "rounded-[22px] border border-border/65 bg-background/35 px-4 py-4 transition hover:border-border hover:bg-background/50",
              subdued && "bg-secondary/14",
            )}
          >
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div className="min-w-0 space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-base font-semibold text-foreground">
                    {name}
                  </span>
                  <StatusPill
                    status={row.status}
                    statusMap={checkinOperationalStatusMap}
                  />
                  <span className="rounded-full border border-border/70 bg-secondary/18 px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
                    {urgencyLabel}
                  </span>
                </div>
                <div className="grid gap-3 text-sm text-muted-foreground sm:grid-cols-2 xl:grid-cols-4">
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/90">
                      Due date
                    </div>
                    <div className="mt-1 text-foreground">
                      {formatCheckinDate(row.checkin.week_ending_saturday)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/90">
                      Submission
                    </div>
                    <div className="mt-1 text-foreground">
                      {row.checkin.submitted_at
                        ? formatCheckinDateTime(row.checkin.submitted_at)
                        : row.status === "overdue"
                          ? "Missing submission"
                          : row.status === "due"
                            ? "Awaiting submission"
                            : "Not due yet"}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/90">
                      Recent status
                    </div>
                    <div className="mt-1 text-foreground">{recentLabel}</div>
                  </div>
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/90">
                      Client state
                    </div>
                    <div className="mt-1 text-foreground">
                      {row.client.status ?? "No client status"}
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
          <>
            <Button
              variant="secondary"
              onClick={() => navigate("/pt/checkins/templates")}
            >
              Manage templates
            </Button>
            <Button onClick={() => navigate("/pt/clients")}>
              View clients
            </Button>
          </>
        }
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {[
          {
            label: "Submitted",
            value: submittedCount,
          },
          {
            label: "Overdue",
            value: overdueCount,
          },
          {
            label: "Due now",
            value: dueCount,
          },
          {
            label: "Soon",
            value: upcomingCount,
          },
        ].map((card) => (
          <div
            key={card.label}
            className="rounded-[24px] border border-border/70 bg-background/35 px-4 py-4"
          >
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              {card.label}
            </div>
            <div className="mt-2 text-2xl font-semibold text-foreground">
              {card.value}
            </div>
          </div>
        ))}
      </div>

      <div className="space-y-6">
        {queueSections.map((section) => {
          const rows = queueRows.filter((row) => {
            if (section.key === "due-now") {
              return row.status === "submitted" || row.status === "due";
            }
            return row.status === section.key;
          });
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
                renderQueueRows(
                  rows,
                  section.key === "due-now" ? "Review" : "Open",
                )
              )}
            </DashboardCard>
          );
        })}
      </div>
    </div>
  );
}

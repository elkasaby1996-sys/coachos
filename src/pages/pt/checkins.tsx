import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "../../components/ui/tabs";
import { Button } from "../../components/ui/button";
import {
  DashboardCard,
  EmptyState,
  Skeleton,
  StatusPill,
} from "../../components/ui/coachos";
import { supabase } from "../../lib/supabase";
import { useWorkspace } from "../../lib/use-workspace";
import { getTodayInTimezone, getWeekEndSaturday } from "../../lib/date-utils";
import { cn } from "../../lib/utils";

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
  pt_feedback: string | null;
};

type QueueStatus = "due" | "submitted" | "reviewed";

const statusMap = {
  due: { label: "Due", variant: "warning" },
  submitted: { label: "Submitted", variant: "warning" },
  reviewed: { label: "Reviewed", variant: "success" },
} as const;

const formatWeekEnding = (dateStr: string) => {
  if (!dateStr) return "--";
  const date = new Date(`${dateStr}T00:00:00Z`);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
};

export function PtCheckinsQueuePage() {
  const navigate = useNavigate();
  const { workspaceId } = useWorkspace();
  const [activeTab, setActiveTab] = useState<QueueStatus>("due");

  const todayStr = useMemo(() => getTodayInTimezone(null), []);
  const weekEndingSaturday = useMemo(
    () => getWeekEndSaturday(todayStr),
    [todayStr],
  );

  const checkinsQuery = useQuery({
    queryKey: ["pt-checkins-week", workspaceId, weekEndingSaturday],
    enabled: !!workspaceId && !!weekEndingSaturday,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("checkins")
        .select(
          "id, client_id, week_ending_saturday, submitted_at, pt_feedback, client:clients(id, display_name, user_id, status)",
        )
        .eq("week_ending_saturday", weekEndingSaturday)
        .eq("client.workspace_id", workspaceId ?? "");
      if (error) throw error;
      return (data ?? []) as Array<
        CheckinRow & { client: ClientRow | ClientRow[] | null }
      >;
    },
  });

  const queueRows = useMemo(() => {
    const rows = (checkinsQuery.data ?? []).map((row) => {
      const clientRow = Array.isArray(row.client) ? row.client[0] : row.client;
      const client: ClientRow = clientRow ?? {
        id: row.client_id ?? "",
        display_name: null,
        user_id: null,
        status: null,
      };
      let status: QueueStatus = "due";
      if (row.submitted_at) {
        status =
          row.pt_feedback && row.pt_feedback.trim().length > 0
            ? "reviewed"
            : "submitted";
      }
      return { client, checkin: row, status };
    });
    return rows;
  }, [checkinsQuery.data]);

  const isLoading = checkinsQuery.isLoading;
  const dueCount = queueRows.filter((row) => row.status === "due").length;
  const submittedCount = queueRows.filter(
    (row) => row.status === "submitted",
  ).length;
  const reviewedCount = queueRows.filter(
    (row) => row.status === "reviewed",
  ).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">
            Check-in queue
          </h2>
          <p className="text-sm text-muted-foreground">
            Week ending {formatWeekEnding(weekEndingSaturday)} - review client
            check-ins.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            onClick={() => navigate("/pt/checkins/templates")}
          >
            Manage templates
          </Button>
          <Button onClick={() => navigate("/pt/clients")}>View clients</Button>
        </div>
      </div>

      <DashboardCard
        title="Queue"
        subtitle="Due, submitted, and reviewed check-ins."
      >
        <Tabs
          value={activeTab}
          onValueChange={(value) => setActiveTab(value as QueueStatus)}
        >
          <TabsList className="mb-4 flex h-auto flex-wrap gap-2 rounded-lg bg-transparent p-0">
            <TabsTrigger value="due">Due ({dueCount})</TabsTrigger>
            <TabsTrigger value="submitted">
              Submitted ({submittedCount})
            </TabsTrigger>
            <TabsTrigger value="reviewed">
              Reviewed ({reviewedCount})
            </TabsTrigger>
          </TabsList>

          {(["due", "submitted", "reviewed"] as QueueStatus[]).map((status) => {
            const rowsForStatus = queueRows.filter(
              (row) => row.status === status,
            );
            return (
              <TabsContent key={status} value={status}>
                {isLoading ? (
                  <div className="space-y-2">
                    {Array.from({ length: 4 }).map((_, index) => (
                      <Skeleton key={index} className="h-12 w-full" />
                    ))}
                  </div>
                ) : rowsForStatus.length === 0 ? (
                  <EmptyState
                    title={`No ${status} check-ins`}
                    description="You're all caught up."
                  />
                ) : (
                  <div className="overflow-hidden rounded-xl border border-border">
                    <div className="grid grid-cols-[minmax(0,1.2fr)_140px_140px_120px] gap-3 bg-muted/40 px-4 py-2 text-xs font-semibold text-muted-foreground">
                      <span>Client</span>
                      <span>Week ending</span>
                      <span>Status</span>
                      <span className="text-right">Action</span>
                    </div>
                    {rowsForStatus.map((row) => {
                      const name = row.client.display_name?.trim()
                        ? row.client.display_name
                        : row.client.user_id
                          ? `Client ${row.client.user_id.slice(0, 6)}`
                          : "Client";
                      const weekEnding =
                        row.checkin?.week_ending_saturday ?? weekEndingSaturday;
                      return (
                        <div
                          key={row.client.id}
                          className={cn(
                            "grid grid-cols-[minmax(0,1.2fr)_140px_140px_120px] items-center gap-3 border-t border-border px-4 py-3 text-sm",
                            status === "reviewed" && "text-muted-foreground",
                          )}
                        >
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-foreground">
                              {name}
                            </span>
                            {row.client.status ? (
                              <span className="text-xs text-muted-foreground">
                                {row.client.status}
                              </span>
                            ) : null}
                          </div>
                          <span>{formatWeekEnding(weekEnding)}</span>
                          <StatusPill
                            status={row.status}
                            statusMap={statusMap}
                          />
                          <div className="text-right">
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() =>
                                navigate(
                                  `/pt/clients/${row.client.id}?tab=checkins`,
                                )
                              }
                            >
                              Open
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </TabsContent>
            );
          })}
        </Tabs>
      </DashboardCard>
    </div>
  );
}

import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Button } from "../ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { supabase } from "../../lib/supabase";
import {
  addDaysToDateString,
  diffDays,
  formatDateInTimezone,
  getLastSaturday,
  getTodayInTimezone,
  getWeekEndSaturday,
  getWeekStartSunday,
} from "../../lib/date-utils";

type ReminderSeverity = "info" | "warn";

type ReminderItem = {
  key: string;
  title: string;
  description: string;
  ctaLabel: string;
  ctaTo: string;
  severity: ReminderSeverity;
};

type HabitLogRow = {
  client_id: string;
  log_date: string;
};

type CheckinRow = {
  client_id: string;
  submitted_at: string | null;
};

type DismissedReminderRow = {
  key: string;
};

type ClientRemindersProps = {
  clientId: string | null;
  timezone?: string | null;
};

const getAlertStyles = (severity: ReminderSeverity) =>
  severity === "warn"
    ? "border-warning/40 bg-warning/10"
    : "border-border bg-muted/20";

const getDismissError = (error: unknown) => {
  if (!error) return null;
  if (error instanceof Error) {
    return error.message ?? "Failed to dismiss reminder.";
  }
  if (typeof error === "object") {
    const err = error as { message?: string | null };
    return err.message ?? "Failed to dismiss reminder.";
  }
  return "Failed to dismiss reminder.";
};

export function ClientReminders({ clientId, timezone }: ClientRemindersProps) {
  const navigate = useNavigate();
  const [dismissError, setDismissError] = useState<string | null>(null);
  const [dismissingKey, setDismissingKey] = useState<string | null>(null);

  const todayStr = useMemo(() => getTodayInTimezone(timezone), [timezone]);
  const weekStart = useMemo(() => getWeekStartSunday(todayStr), [todayStr]);
  const weekEnd = useMemo(() => getWeekEndSaturday(todayStr), [todayStr]);
  const lastSaturday = useMemo(() => getLastSaturday(todayStr), [todayStr]);

  const habitLogsQuery = useQuery({
    queryKey: ["client-alerts-habit-logs", clientId, todayStr],
    enabled: !!clientId && !!todayStr,
    queryFn: async () => {
      const startDate = addDaysToDateString(todayStr, -6);
      const { data, error } = await supabase
        .from("habit_logs")
        .select("client_id, log_date")
        .eq("client_id", clientId ?? "")
        .gte("log_date", startDate)
        .lte("log_date", todayStr);
      if (error) throw error;
      return (data ?? []) as HabitLogRow[];
    },
  });

  const checkinQuery = useQuery({
    queryKey: ["client-alerts-checkin", clientId],
    enabled: !!clientId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("checkin_submissions")
        .select("client_id, submitted_at")
        .eq("client_id", clientId ?? "")
        .order("submitted_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as CheckinRow | null;
    },
  });

  const dismissedQuery = useQuery({
    queryKey: ["dismissed-reminders", clientId, todayStr],
    enabled: !!clientId && !!todayStr,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dismissed_reminders")
        .select("key")
        .eq("client_id", clientId ?? "")
        .eq("dismissed_for_date", todayStr);
      if (error) throw error;
      return (data ?? []) as DismissedReminderRow[];
    },
  });

  const alertsError =
    habitLogsQuery.error || checkinQuery.error ? getDismissError(habitLogsQuery.error || checkinQuery.error) : null;

  const alerts = useMemo(() => {
    if (habitLogsQuery.isError || checkinQuery.isError) {
      return [] as ReminderItem[];
    }
    const items: ReminderItem[] = [];
    const logs = habitLogsQuery.data ?? [];
    const uniqueDates = new Set(logs.map((row) => row.log_date));
    const missingCount = Math.max(0, 7 - uniqueDates.size);
    const hasTodayLog = uniqueDates.has(todayStr);

    if (!hasTodayLog) {
      items.push({
        key: "habit_log_today",
        title: "Log today's habits",
        description: "You do not have a habit log for today.",
        ctaLabel: "Log habits",
        ctaTo: "/app/habits",
        severity: "warn",
      });
    }

    if (missingCount > 0) {
      items.push({
        key: "habit_log_week",
        title: "Catch up on habits",
        description: `${missingCount} day${missingCount === 1 ? "" : "s"} missing in the last 7 days.`,
        ctaLabel: "Review logs",
        ctaTo: "/app/habits",
        severity: missingCount >= 3 ? "warn" : "info",
      });
    }

    const latestCheckinDate = checkinQuery.data?.submitted_at
      ? formatDateInTimezone(checkinQuery.data.submitted_at, timezone)
      : null;
    const hasSubmittedSinceLastSaturday =
      latestCheckinDate && latestCheckinDate >= lastSaturday;
    const overdue =
      !hasSubmittedSinceLastSaturday && diffDays(todayStr, lastSaturday) >= 1;

    if (overdue) {
      items.push({
        key: "checkin_overdue",
        title: "Weekly check-in overdue",
        description: "Your weekly check-in was due last Saturday.",
        ctaLabel: "Submit check-in",
        ctaTo: "/app/checkin",
        severity: "warn",
      });
    } else {
      const hasSubmittedThisWeek = latestCheckinDate && latestCheckinDate >= weekStart;
      if (!hasSubmittedThisWeek) {
        const daysUntilSaturday = Math.max(0, diffDays(weekEnd, todayStr));
        const dayLabel =
          daysUntilSaturday === 0
            ? "Due today"
            : `Due in ${daysUntilSaturday} day${daysUntilSaturday === 1 ? "" : "s"}`;
        items.push({
          key: "checkin_due",
          title: "Weekly check-in due Saturday",
          description: dayLabel,
          ctaLabel: "Open check-in",
          ctaTo: "/app/checkin",
          severity: "info",
        });
      }
    }

    return items;
  }, [
    habitLogsQuery.data,
    habitLogsQuery.isError,
    checkinQuery.isError,
    checkinQuery.data?.submitted_at,
    lastSaturday,
    timezone,
    todayStr,
    weekEnd,
    weekStart,
  ]);

  const dismissedKeys = useMemo(() => {
    const rows = dismissedQuery.data ?? [];
    return new Set(rows.map((row) => row.key));
  }, [dismissedQuery.data]);

  const reminders = alerts.filter((item) => !dismissedKeys.has(item.key));

  const handleDismiss = async (key: string) => {
    if (!clientId || !todayStr) return;
    setDismissError(null);
    setDismissingKey(key);
    const { error } = await supabase.from("dismissed_reminders").insert({
      client_id: clientId,
      key,
      dismissed_for_date: todayStr,
    });
    if (error && error.code !== "23505") {
      console.log("DISMISS_REMINDER_ERROR", error);
      setDismissError(getDismissError(error));
    }
    setDismissingKey(null);
    await dismissedQuery.refetch();
  };

  if (!clientId) return null;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Alerts</CardTitle>
          <p className="text-sm text-muted-foreground">Stay on track today.</p>
        </CardHeader>
        <CardContent className="space-y-3">
          {alertsError ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              {alertsError}
            </div>
          ) : null}
          {alerts.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border bg-muted/30 p-3 text-sm text-muted-foreground">
              No alerts today.
            </div>
          ) : (
            alerts.map((item) => (
              <div
                key={item.key}
                className={`flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3 ${getAlertStyles(
                  item.severity
                )}`}
              >
                <div>
                  <p className="text-sm font-semibold">{item.title}</p>
                  <p className="text-xs text-muted-foreground">{item.description}</p>
                </div>
                <Button size="sm" onClick={() => navigate(item.ctaTo)}>
                  {item.ctaLabel}
                </Button>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Reminders</CardTitle>
          <p className="text-sm text-muted-foreground">Dismiss items you have handled.</p>
        </CardHeader>
        <CardContent className="space-y-3">
          {dismissError ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              {dismissError}
            </div>
          ) : null}
          {dismissedQuery.error ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              {getDismissError(dismissedQuery.error)}
            </div>
          ) : null}
          {reminders.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border bg-muted/30 p-3 text-sm text-muted-foreground">
              No reminders right now.
            </div>
          ) : (
            reminders.map((item) => (
              <div
                key={item.key}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-background p-3"
              >
                <div>
                  <p className="text-sm font-semibold">{item.title}</p>
                  <p className="text-xs text-muted-foreground">{item.description}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="secondary" onClick={() => navigate(item.ctaTo)}>
                    {item.ctaLabel}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleDismiss(item.key)}
                    disabled={dismissingKey === item.key}
                  >
                    {dismissingKey === item.key ? "Dismissing..." : "Dismiss"}
                  </Button>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}

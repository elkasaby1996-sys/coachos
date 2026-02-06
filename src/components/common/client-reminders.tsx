import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Button } from "../ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { supabase } from "../../lib/supabase";
import {
  addDaysToDateString,
  getTodayInTimezone,
  getWeekEndSaturday,
  getWeekdayFromDateString,
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

type ReminderDefinition = ReminderItem & {
  isRelevant: (context: ReminderContext) => boolean;
};

type ReminderContext = {
  hasTodayLog: boolean;
  baselineExists: boolean;
  checkinDue: boolean;
};

type HabitLogRow = {
  client_id: string;
  log_date: string;
};

type CheckinAlertRow = {
  id: string;
  submitted_at: string | null;
  pt_feedback: string | null;
  week_ending_saturday: string;
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
    return error.message ?? "Unable to update reminders.";
  }
  if (typeof error === "object") {
    const err = error as { message?: string | null };
    return err.message ?? "Unable to update reminders.";
  }
  return "Unable to update reminders.";
};

let didWarnCheckinAlertError = false;

const warnCheckinAlertErrorOnce = (error: unknown) => {
  if (didWarnCheckinAlertError || !error) return;
  didWarnCheckinAlertError = true;
  const err = error as { code?: string; message?: string };
  const suffix = [err.code, err.message].filter(Boolean).join(" ");
  if (import.meta.env.DEV) {
    console.warn("CHECKIN_ALERT_ERROR", suffix || err);
  }
};

export function ClientReminders({ clientId, timezone }: ClientRemindersProps) {
  const navigate = useNavigate();
  const [dismissError, setDismissError] = useState<string | null>(null);
  const [dismissingKey, setDismissingKey] = useState<string | null>(null);

  const todayStr = useMemo(() => getTodayInTimezone(timezone), [timezone]);
  const weekEndingSaturday = useMemo(() => getWeekEndSaturday(todayStr), [todayStr]);
  const isDev = import.meta.env.DEV;

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

  const baselineExistsQuery = useQuery({
    queryKey: ["client-baseline-exists", clientId],
    enabled: !!clientId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("baseline_entries")
        .select("id")
        .eq("client_id", clientId ?? "")
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return Boolean(data?.id);
    },
  });

  const checkinAlertQuery = useQuery({
    queryKey: ["client-checkin-alert", clientId, weekEndingSaturday],
    enabled: !!clientId && !!weekEndingSaturday,
    staleTime: 1000 * 60 * 5,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("checkins")
        .select("id, submitted_at, pt_feedback, week_ending_saturday")
        .eq("client_id", clientId ?? "")
        .eq("week_ending_saturday", weekEndingSaturday)
        .maybeSingle();
      if (error) {
        warnCheckinAlertErrorOnce(error);
        return { row: null, error: true };
      }
      return { row: (data ?? null) as CheckinAlertRow | null, error: false };
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

  const reminderContext = useMemo(() => {
    const logs = habitLogsQuery.data ?? [];
    const hasTodayLog = logs.some((row) => row.log_date === todayStr);
    const baselineExists = Boolean(baselineExistsQuery.data);
    const weekday = getWeekdayFromDateString(todayStr);
    const isFridayOrSaturday = weekday === 5 || weekday === 6;
    const checkinRow = checkinAlertQuery.data?.row ?? null;
    const checkinError = Boolean(checkinAlertQuery.data?.error);
    const checkinDue =
      !checkinError && isFridayOrSaturday && (!checkinRow || !checkinRow.submitted_at);

    return { hasTodayLog, baselineExists, checkinDue };
  }, [
    habitLogsQuery.data,
    baselineExistsQuery.data,
    checkinAlertQuery.data,
    todayStr,
    weekEndingSaturday,
  ]);

  const alertItems = useMemo(() => {
    const items: ReminderItem[] = [];
    const result = checkinAlertQuery.data;
    if (!result || result.error) return items;

    const row = result.row;
    const weekday = getWeekdayFromDateString(todayStr);
    const isTodayFridayOrSaturday = weekday === 5 || weekday === 6;

    let state: "due_today" | "in_progress" | "submitted_waiting" | "reviewed" | "no_alerts" = "no_alerts";

    if (!row) {
      state = isTodayFridayOrSaturday ? "due_today" : "no_alerts";
    } else if (!row.submitted_at) {
      state = isTodayFridayOrSaturday ? "in_progress" : "no_alerts";
    } else if (!row.pt_feedback || row.pt_feedback.trim().length === 0) {
      state = "submitted_waiting";
    } else {
      state = "reviewed";
    }

    if (state === "due_today") {
      items.push({
        key: "checkin_due_today",
        title: "Weekly check-in due today",
        description: "Complete your check-in to stay on track.",
        ctaLabel: "Complete check-in",
        ctaTo: "/app/checkin",
        severity: "warn",
      });
    } else if (state === "in_progress") {
      items.push({
        key: "checkin_in_progress",
        title: "Check-in started - finish it",
        description: "Continue where you left off.",
        ctaLabel: "Continue",
        ctaTo: "/app/checkin",
        severity: "info",
      });
    } else if (state === "submitted_waiting") {
      items.push({
        key: "checkin_submitted_waiting_review",
        title: "Check-in submitted - waiting on coach review",
        description: "Your coach will follow up with feedback soon.",
        ctaLabel: "",
        ctaTo: "",
        severity: "info",
      });
    } else if (state === "reviewed") {
      items.push({
        key: "checkin_reviewed",
        title: "Coach reviewed your check-in",
        description: "Check your feedback to keep progressing.",
        ctaLabel: "",
        ctaTo: "",
        severity: "info",
      });
    }

    return items;
  }, [checkinAlertQuery.data, todayStr, weekEndingSaturday]);

  const reminderItems = useMemo(() => {
    if (
      habitLogsQuery.isError ||
      baselineExistsQuery.isError ||
      dismissedQuery.isError
    ) {
      return [] as ReminderItem[];
    }
    const definitions: ReminderDefinition[] = [
      {
        key: "log_habits_today",
        title: "Log habits today",
        description: "No habit log saved for today.",
        ctaLabel: "Log habits",
        ctaTo: "/app/habits",
        severity: "warn",
        isRelevant: (context) => !context.hasTodayLog,
      },
      {
        key: "baseline_missing",
        title: "Complete your baseline",
        description: "Your coach needs baseline data to personalize your plan.",
        ctaLabel: "Start baseline",
        ctaTo: "/app/baseline",
        severity: "info",
        isRelevant: (context) => !context.baselineExists,
      },
      {
        key: "checkin_due",
        title: "Weekly check-in due today",
        description: "Submit your weekly check-in.",
        ctaLabel: "Complete check-in",
        ctaTo: "/app/checkin",
        severity: "warn",
        isRelevant: (context) => context.checkinDue,
      },
    ];

    return definitions
      .filter((definition) => definition.isRelevant(reminderContext))
      .map(({ isRelevant: _unused, ...item }) => item);
  }, [
    habitLogsQuery.isError,
    baselineExistsQuery.isError,
    dismissedQuery.isError,
    reminderContext,
  ]);

  const dismissedKeys = useMemo(() => {
    const rows = dismissedQuery.data ?? [];
    return new Set(rows.map((row) => row.key));
  }, [dismissedQuery.data]);

  const reminders = reminderItems.filter((item) => !dismissedKeys.has(item.key));

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
      if (isDev) {
        console.warn("DISMISS_REMINDER_ERROR", error);
      }
      setDismissError("Unable to update reminders.");
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
          {alertItems.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border bg-muted/30 p-3 text-sm text-muted-foreground">
              No alerts today.
            </div>
          ) : (
            alertItems.map((item) => (
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
                {item.ctaLabel ? (
                  <Button size="sm" onClick={() => navigate(item.ctaTo)}>
                    {item.ctaLabel}
                  </Button>
                ) : null}
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
              Unable to load reminders.
              {isDev ? (
                <div className="mt-2 text-xs text-muted-foreground">
                  {getDismissError(dismissedQuery.error)}
                </div>
              ) : null}
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

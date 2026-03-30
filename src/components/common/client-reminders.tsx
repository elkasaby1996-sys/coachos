import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { BellRing } from "lucide-react";
import { Button } from "../ui/button";
import { supabase } from "../../lib/supabase";
import { safeSelect } from "../../lib/supabase-safe";
import { addDaysToDateString, getTodayInTimezone } from "../../lib/date-utils";
import { getOnboardingStatusMeta } from "../../features/client-onboarding/lib/client-onboarding";
import {
  EmptyStateBlock,
  StatusBanner,
  SurfaceCard,
  SurfaceCardContent,
  SurfaceCardDescription,
  SurfaceCardHeader,
  SurfaceCardTitle,
} from "../client/portal";
import {
  getCheckinOperationalState,
  getPrimaryClientCheckin,
  isCheckinUpcomingWithinDays,
  type CheckinOperationalState,
} from "../../lib/checkin-review";
import type { ClientOnboardingStatus } from "../../features/client-onboarding/types";

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
  onboardingStatus: ClientOnboardingStatus | null;
  checkinState: CheckinOperationalState | null;
  checkinUpcomingSoon: boolean;
  todayWorkoutId: string | null;
  todayWorkoutNeedsAction: boolean;
};

type HabitLogRow = {
  client_id: string;
  log_date: string;
};

type CheckinAlertRow = {
  id: string;
  submitted_at: string | null;
  reviewed_at: string | null;
  week_ending_saturday: string;
};

type CheckinProfileRow = {
  workspace_id: string | null;
  checkin_template_id: string | null;
  checkin_frequency: string | null;
  checkin_start_date: string | null;
};

type WorkspaceRow = {
  default_checkin_template_id: string | null;
};

type CheckinTemplateRow = {
  id: string;
};

type DismissedReminderRow = {
  key: string;
};

type TodayWorkoutReminderRow = {
  id: string;
  status: string | null;
  day_type: string | null;
};

type OnboardingReminderRow = {
  status: ClientOnboardingStatus;
};

type ClientRemindersProps = {
  clientId: string | null;
  timezone?: string | null;
};

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
  const isDev = import.meta.env.DEV;

  const checkinProfileQuery = useQuery({
    queryKey: ["client-reminder-checkin-profile", clientId],
    enabled: !!clientId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select(
          "workspace_id, checkin_template_id, checkin_frequency, checkin_start_date",
        )
        .eq("id", clientId ?? "")
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as CheckinProfileRow | null;
    },
  });

  const workspaceQuery = useQuery({
    queryKey: [
      "client-reminder-checkin-workspace",
      checkinProfileQuery.data?.workspace_id,
    ],
    enabled: !!checkinProfileQuery.data?.workspace_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workspaces")
        .select("default_checkin_template_id")
        .eq("id", checkinProfileQuery.data?.workspace_id ?? "")
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as WorkspaceRow | null;
    },
  });

  const latestTemplateQuery = useQuery({
    queryKey: [
      "client-reminder-checkin-latest-template",
      checkinProfileQuery.data?.workspace_id,
    ],
    enabled:
      !!checkinProfileQuery.data?.workspace_id &&
      workspaceQuery.isFetched &&
      !checkinProfileQuery.data?.checkin_template_id &&
      !workspaceQuery.data?.default_checkin_template_id,
    queryFn: async () => {
      const { data, error } = await safeSelect<CheckinTemplateRow>({
        table: "checkin_templates",
        columns: "id, workspace_id, is_active, created_at",
        fallbackColumns: "id, workspace_id, created_at",
        filter: (query) =>
          query
            .eq("workspace_id", checkinProfileQuery.data?.workspace_id ?? "")
            .neq("is_active", false)
            .order("created_at", { ascending: false })
            .limit(1),
      });
      if (error) throw error;
      return ((data ?? [])[0] ?? null) as CheckinTemplateRow | null;
    },
  });

  const effectiveTemplateId =
    checkinProfileQuery.data?.checkin_template_id ??
    workspaceQuery.data?.default_checkin_template_id ??
    latestTemplateQuery.data?.id ??
    null;

  const checkinWindowStart = useMemo(
    () => addDaysToDateString(todayStr, -45),
    [todayStr],
  );
  const checkinWindowEnd = useMemo(
    () => addDaysToDateString(todayStr, 45),
    [todayStr],
  );

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

  const onboardingQuery = useQuery({
    queryKey: ["client-reminder-onboarding", clientId],
    enabled: !!clientId,
    queryFn: async () => {
      const { error: ensureError } = await supabase.rpc(
        "ensure_workspace_client_onboarding",
        {
          p_client_id: clientId,
        },
      );
      if (ensureError) throw ensureError;

      const { data, error } = await supabase
        .from("workspace_client_onboardings")
        .select("status")
        .eq("client_id", clientId ?? "")
        .eq("status", "submitted")
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as OnboardingReminderRow | null;
    },
  });

  const checkinAlertQuery = useQuery({
    queryKey: [
      "client-checkin-alert",
      clientId,
      checkinWindowStart,
      checkinWindowEnd,
    ],
    enabled:
      !!clientId &&
      !!effectiveTemplateId &&
      !!checkinProfileQuery.data?.checkin_start_date &&
      !!checkinWindowStart &&
      !!checkinWindowEnd,
    staleTime: 1000 * 60 * 5,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const { error: ensureError } = await supabase.rpc(
        "ensure_client_checkins",
        {
          p_client_id: clientId ?? "",
          p_range_start: checkinWindowStart,
          p_range_end: checkinWindowEnd,
        },
      );
      if (ensureError) {
        warnCheckinAlertErrorOnce(ensureError);
        return { rows: [], error: true };
      }

      const { data, error } = await supabase
        .from("checkins")
        .select("id, submitted_at, reviewed_at, week_ending_saturday")
        .eq("client_id", clientId ?? "")
        .gte("week_ending_saturday", checkinWindowStart ?? "")
        .lte("week_ending_saturday", checkinWindowEnd ?? "")
        .order("week_ending_saturday", { ascending: true });
      if (error) {
        warnCheckinAlertErrorOnce(error);
        return { rows: [], error: true };
      }
      return { rows: (data ?? []) as CheckinAlertRow[], error: false };
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

  const todayWorkoutReminderQuery = useQuery({
    queryKey: ["client-reminder-workout-today", clientId, todayStr],
    enabled: !!clientId && !!todayStr,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("assigned_workouts")
        .select("id, status, day_type")
        .eq("client_id", clientId ?? "")
        .eq("scheduled_date", todayStr)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as TodayWorkoutReminderRow | null;
    },
  });

  const reminderContext = useMemo(() => {
    const logs = habitLogsQuery.data ?? [];
    const hasTodayLog = logs.some((row) => row.log_date === todayStr);
    const onboardingStatus = onboardingQuery.data?.status ?? null;
    const checkinRow = getPrimaryClientCheckin(
      checkinAlertQuery.data?.rows ?? [],
      todayStr,
    );
    const checkinError = Boolean(checkinAlertQuery.data?.error);
    const checkinState =
      checkinRow && !checkinError
        ? getCheckinOperationalState(checkinRow, todayStr)
        : null;
    const checkinUpcomingSoon = Boolean(
      checkinRow &&
      !checkinError &&
      isCheckinUpcomingWithinDays(checkinRow, todayStr, 3),
    );
    const todayWorkout = todayWorkoutReminderQuery.data;
    const todayWorkoutNeedsAction = Boolean(
      todayWorkout &&
      todayWorkout.day_type !== "rest" &&
      todayWorkout.status !== "completed" &&
      todayWorkout.status !== "skipped",
    );
    const todayWorkoutId = todayWorkoutNeedsAction
      ? (todayWorkout?.id ?? null)
      : null;

    return {
      hasTodayLog,
      onboardingStatus,
      checkinState,
      checkinUpcomingSoon,
      todayWorkoutId,
      todayWorkoutNeedsAction,
    };
  }, [
    habitLogsQuery.data,
    onboardingQuery.data?.status,
    checkinAlertQuery.data,
    todayWorkoutReminderQuery.data,
    todayStr,
  ]);

  const reminderItems = useMemo(() => {
    if (
      habitLogsQuery.isError ||
      onboardingQuery.isError ||
      dismissedQuery.isError ||
      checkinProfileQuery.isError ||
      workspaceQuery.isError ||
      latestTemplateQuery.isError
    ) {
      return [] as ReminderItem[];
    }
    const onboardingStatus = reminderContext.onboardingStatus;
    const onboardingStatusMeta = onboardingStatus
      ? getOnboardingStatusMeta(onboardingStatus)
      : null;
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
        key: "workspace_onboarding",
        title:
          onboardingStatus === "review_needed"
            ? "Onboarding submitted"
            : onboardingStatus === "submitted"
              ? "Coach reviewed onboarding"
              : "Finish workspace onboarding",
        description:
          onboardingStatusMeta?.description ??
          "Complete onboarding so your coach can finish setup.",
        ctaLabel:
          onboardingStatus === "review_needed" ||
          onboardingStatus === "submitted"
            ? "View onboarding"
            : "Continue onboarding",
        ctaTo: "/app/onboarding",
        severity:
          onboardingStatus === "review_needed" ||
          onboardingStatus === "submitted"
            ? "info"
            : "warn",
        isRelevant: (context) =>
          Boolean(
            context.onboardingStatus &&
            context.onboardingStatus !== "completed",
          ),
      },
      {
        key: "checkin_overdue",
        title: "Check-in overdue",
        description: "You have a missed check-in waiting for submission.",
        ctaLabel: "Resume check-in",
        ctaTo: "/app/checkin",
        severity: "warn",
        isRelevant: (context) => context.checkinState === "overdue",
      },
      {
        key: "checkin_due",
        title: "Check-in due today",
        description: "Submit your scheduled check-in.",
        ctaLabel: "Complete check-in",
        ctaTo: "/app/checkin",
        severity: "warn",
        isRelevant: (context) => context.checkinState === "due",
      },
      {
        key: "checkin_upcoming_2d",
        title: "Check-in coming up",
        description:
          "Your next check-in is coming up soon. Prep your notes now.",
        ctaLabel: "Open check-in",
        ctaTo: "/app/checkin",
        severity: "info",
        isRelevant: (context) => context.checkinUpcomingSoon,
      },
    ];

    const base = definitions
      .filter((definition) => definition.isRelevant(reminderContext))
      .map(({ isRelevant: _unused, ...item }) => item);
    if (
      reminderContext.todayWorkoutNeedsAction &&
      reminderContext.todayWorkoutId
    ) {
      base.unshift({
        key: "workout_today_assigned",
        title: "Today's workout is assigned",
        description:
          "You have a workout assigned for today. Start it when ready.",
        ctaLabel: "Start workout",
        ctaTo: `/app/workout-run/${reminderContext.todayWorkoutId}`,
        severity: "warn",
      });
    }
    return base;
  }, [
    habitLogsQuery.isError,
    onboardingQuery.isError,
    dismissedQuery.isError,
    checkinProfileQuery.isError,
    workspaceQuery.isError,
    latestTemplateQuery.isError,
    reminderContext,
  ]);

  const dismissedKeys = useMemo(() => {
    const rows = dismissedQuery.data ?? [];
    return new Set(rows.map((row) => row.key));
  }, [dismissedQuery.data]);

  const reminders = reminderItems.filter(
    (item) => !dismissedKeys.has(item.key),
  );

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
    <SurfaceCard>
      <SurfaceCardHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <SurfaceCardTitle>Reminders</SurfaceCardTitle>
            <SurfaceCardDescription>
              Keep urgent coach prompts and due items visible without crowding the page.
            </SurfaceCardDescription>
          </div>
          <div className="rounded-full border border-border/70 bg-background/45 px-3 py-1 text-xs font-medium text-muted-foreground">
            {reminders.length > 0 ? `${reminders.length} active` : "Clear"}
          </div>
        </div>
      </SurfaceCardHeader>
      <SurfaceCardContent className="space-y-3">
        {dismissError ? (
          <StatusBanner variant="error" title={dismissError} />
        ) : null}
        {dismissedQuery.error ? (
          <StatusBanner
            variant="error"
            title="Unable to load reminders"
            description={
              isDev ? getDismissError(dismissedQuery.error) : undefined
            }
          />
        ) : null}
        {reminders.length === 0 ? (
          <EmptyStateBlock
            icon={<BellRing className="h-5 w-5" />}
            title="Nothing urgent right now"
            description="You're caught up on today's reminders. New coach prompts and due items will appear here when they matter."
            className="min-h-[16rem]"
          />
        ) : (
          reminders.map((item) => {
            const toneClass =
              item.severity === "warn"
                ? "border-warning/25 bg-warning/8"
                : "border-border/70 bg-background/45";

            return (
              <div
                key={item.key}
                className={`rounded-[var(--radius-lg)] border px-4 py-4 ${toneClass}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0 space-y-1">
                    <p className="text-sm font-semibold text-foreground">
                      {item.title}
                    </p>
                    <p className="text-sm leading-6 text-muted-foreground">
                      {item.description}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => navigate(item.ctaTo)}
                    >
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
              </div>
            );
          })
        )}
      </SurfaceCardContent>
    </SurfaceCard>
  );
}

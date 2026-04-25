// @ts-nocheck
import { useMemo, type ComponentType } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  CheckCircle2,
  Flame,
  MessageCircle,
  Rocket,
  Sparkles,
} from "lucide-react";
import { DashboardCard, EmptyState, StatCard } from "../../../components/ui/coachos";
import { Skeleton } from "../../../components/ui/coachos/skeleton";
import { addDaysToDateString } from "../../../lib/date-utils";
import { supabase } from "../../../lib/supabase";

type PtClientProgressTabProps = {
  hasBaselineSubmission: boolean;
  onOpenHabits: () => void;
  onOpenBaseline: () => void;
  onOpenWorkout: () => void;
  onOpenCheckins: () => void;
  enabled: boolean;
};

type HabitLog = {
  log_date: string | null;
  weight_value: number | null;
  weight_unit: string | null;
  steps: number | null;
  sleep_hours: number | null;
  protein_g: number | null;
  calories: number | null;
  energy: number | null;
  hunger: number | null;
  stress: number | null;
};

const formatDateKey = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export function PtClientProgressTab({
  hasBaselineSubmission,
  onOpenHabits,
  onOpenBaseline,
  onOpenWorkout,
  onOpenCheckins,
  enabled,
}: PtClientProgressTabProps) {
  const { clientId } = useParams();
  const todayKey = formatDateKey(new Date());
  const habitsStart = addDaysToDateString(todayKey, -55);
  const sessionsStart = addDaysToDateString(todayKey, -83);
  const checkinsStart = addDaysToDateString(todayKey, -83);

  const progressHabitsQuery = useQuery({
    queryKey: ["pt-client-progress-habits", clientId, habitsStart, todayKey],
    enabled: enabled && !!clientId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("habit_logs")
        .select(
          "log_date, weight_value, weight_unit, steps, sleep_hours, protein_g, calories, energy, hunger, stress",
        )
        .eq("client_id", clientId ?? "")
        .gte("log_date", habitsStart)
        .lte("log_date", todayKey)
        .order("log_date", { ascending: true });
      if (error) throw error;
      return (data ?? []) as HabitLog[];
    },
  });

  const progressSessionsQuery = useQuery({
    queryKey: [
      "pt-client-progress-sessions",
      clientId,
      sessionsStart,
      todayKey,
    ],
    enabled: enabled && !!clientId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workout_sessions")
        .select("id, completed_at, created_at")
        .eq("client_id", clientId ?? "")
        .gte("created_at", `${sessionsStart}T00:00:00.000Z`)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Array<{
        id: string;
        completed_at: string | null;
        created_at: string | null;
      }>;
    },
  });

  const progressSessionIds = useMemo(
    () => (progressSessionsQuery.data ?? []).map((row) => row.id),
    [progressSessionsQuery.data],
  );

  const progressSetLogsQuery = useQuery({
    queryKey: ["pt-client-progress-set-logs", progressSessionIds],
    enabled: enabled && progressSessionIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workout_set_logs")
        .select(
          "exercise_id, reps, weight, created_at, exercise:exercises(name), workout_session_id",
        )
        .in("workout_session_id", progressSessionIds)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Array<{
        exercise_id: string | null;
        reps: number | null;
        weight: number | null;
        created_at: string | null;
        workout_session_id: string | null;
        exercise: { name: string | null } | { name: string | null }[] | null;
      }>;
    },
  });

  const progressCheckinAnswersQuery = useQuery({
    queryKey: [
      "pt-client-progress-checkin-answers",
      clientId,
      checkinsStart,
      todayKey,
    ],
    enabled: enabled && !!clientId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("checkin_answers")
        .select(
          "value_number, value_text, question:checkin_questions(question_text, prompt), checkin:checkins!inner(client_id, week_ending_saturday, submitted_at)",
        )
        .eq("checkin.client_id", clientId ?? "")
        .gte("checkin.week_ending_saturday", checkinsStart)
        .lte("checkin.week_ending_saturday", todayKey);
      if (error) throw error;
      return data ?? [];
    },
  });

  const habitsAnalysis = useMemo(() => {
    const logs = progressHabitsQuery.data ?? [];
    if (logs.length === 0) return null;
    const weightLogs = logs.filter((log) => typeof log.weight_value === "number");
    const stepsLogs = logs.filter((log) => typeof log.steps === "number");
    const midpoint = Math.floor(logs.length / 2);
    const firstHalf = logs.slice(0, midpoint);
    const secondHalf = logs.slice(midpoint);
    const avg = (values: Array<number | null | undefined>) => {
      const nums = values.filter((value) => typeof value === "number") as number[];
      if (nums.length === 0) return null;
      return nums.reduce((sum, value) => sum + value, 0) / nums.length;
    };
    const firstWeight = weightLogs[0]?.weight_value ?? null;
    const latestWeight = weightLogs[weightLogs.length - 1]?.weight_value ?? null;
    const weightChange =
      firstWeight !== null && latestWeight !== null
        ? latestWeight - firstWeight
        : null;
    const weightUnit = weightLogs.find((log) => log.weight_unit)?.weight_unit ?? "kg";

    return {
      weightChange,
      weightUnit,
      avgStepsFirst: avg(firstHalf.map((log) => log.steps)),
      avgStepsSecond: avg(secondHalf.map((log) => log.steps)),
      avgSleepFirst: avg(firstHalf.map((log) => log.sleep_hours)),
      avgSleepSecond: avg(secondHalf.map((log) => log.sleep_hours)),
      avgProteinFirst: avg(firstHalf.map((log) => log.protein_g)),
      avgProteinSecond: avg(secondHalf.map((log) => log.protein_g)),
      avgCaloriesFirst: avg(firstHalf.map((log) => log.calories)),
      avgCaloriesSecond: avg(secondHalf.map((log) => log.calories)),
      latestSteps:
        stepsLogs.length > 0 ? stepsLogs[stepsLogs.length - 1].steps : null,
      firstSteps: stepsLogs.length > 0 ? stepsLogs[0].steps : null,
    };
  }, [progressHabitsQuery.data]);

  const exerciseImprovements = useMemo(() => {
    const logs = progressSetLogsQuery.data ?? [];
    const byExercise = new Map<string, Array<{ weight: number | null; name: string }>>();
    logs.forEach((row) => {
      if (!row.exercise_id) return;
      const name = Array.isArray(row.exercise)
        ? (row.exercise[0]?.name ?? "Exercise")
        : (row.exercise?.name ?? "Exercise");
      if (!byExercise.has(row.exercise_id)) byExercise.set(row.exercise_id, []);
      byExercise.get(row.exercise_id)?.push({
        weight: row.weight ?? null,
        name,
      });
    });

    const improved: Array<{
      exerciseId: string;
      exerciseName: string;
      startWeight: number;
      latestWeight: number;
      change: number;
    }> = [];

    byExercise.forEach((rows, exerciseId) => {
      const weighted = rows.filter((row) => typeof row.weight === "number") as Array<
        (typeof rows)[number] & { weight: number }
      >;
      if (weighted.length < 2) return;
      const startWeight = weighted[0].weight;
      const latestWeight = weighted[weighted.length - 1].weight;
      if (latestWeight <= startWeight) return;
      improved.push({
        exerciseId,
        exerciseName: rows[0]?.name ?? "Exercise",
        startWeight,
        latestWeight,
        change: latestWeight - startWeight,
      });
    });

    return improved.sort((a, b) => b.change - a.change).slice(0, 6);
  }, [progressSetLogsQuery.data]);

  const checkinQuestionTrends = useMemo(() => {
    const rows = progressCheckinAnswersQuery.data ?? [];
    const byQuestion = new Map<string, Array<{ value_number: number | null; value_text: string | null; date: string | null }>>();
    rows.forEach((row) => {
      const question = Array.isArray(row.question) ? (row.question[0] ?? null) : row.question;
      const checkin = Array.isArray(row.checkin) ? (row.checkin[0] ?? null) : row.checkin;
      const key = question?.question_text ?? question?.prompt ?? "Question";
      if (!byQuestion.has(key)) byQuestion.set(key, []);
      byQuestion.get(key)?.push({
        value_number: row.value_number ?? null,
        value_text: row.value_text ?? null,
        date: checkin?.week_ending_saturday ?? checkin?.submitted_at ?? null,
      });
    });

    const numeric = [];
    const text = [];
    byQuestion.forEach((entries, question) => {
      const ordered = [...entries].sort((a, b) =>
        String(a.date ?? "").localeCompare(String(b.date ?? "")),
      );
      const numericEntries = ordered.filter(
        (entry) => typeof entry.value_number === "number",
      ) as Array<(typeof ordered)[number] & { value_number: number }>;
      if (numericEntries.length >= 2) {
        const from = numericEntries[0].value_number;
        const to = numericEntries[numericEntries.length - 1].value_number;
        if (from !== to) numeric.push({ question, from, to, delta: to - from });
      }
      const textEntries = ordered
        .map((entry) => entry.value_text?.trim())
        .filter((value): value is string => Boolean(value));
      if (textEntries.length >= 2) {
        const previous = textEntries[textEntries.length - 2];
        const latest = textEntries[textEntries.length - 1];
        if (previous !== latest) text.push({ question, previous, latest });
      }
    });

    return {
      numeric: numeric.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)).slice(0, 6),
      text: text.slice(0, 4),
    };
  }, [progressCheckinAnswersQuery.data]);

  const loading =
    progressHabitsQuery.isLoading ||
    progressSessionsQuery.isLoading ||
    progressSetLogsQuery.isLoading ||
    progressCheckinAnswersQuery.isLoading;
  const hasCheckinTrendData =
    checkinQuestionTrends.numeric.length > 0 || checkinQuestionTrends.text.length > 0;
  const hasWorkoutHistory = (progressSessionsQuery.data?.length ?? 0) > 0;

  const trendCards = useMemo(() => {
    const items: Array<{
      label: string;
      value: string;
      helper: string;
      icon: ComponentType<{ className?: string }>;
    }> = [];
    if (habitsAnalysis?.weightChange !== null && habitsAnalysis?.weightChange !== undefined) {
      items.push({
        label: "Weight delta",
        value: `${habitsAnalysis.weightChange > 0 ? "+" : ""}${habitsAnalysis.weightChange.toFixed(1)} ${habitsAnalysis.weightUnit}`,
        helper: "First to latest logged weight",
        icon: Flame,
      });
    }
    if (
      typeof habitsAnalysis?.avgStepsFirst === "number" &&
      typeof habitsAnalysis?.avgStepsSecond === "number"
    ) {
      const delta = habitsAnalysis.avgStepsSecond - habitsAnalysis.avgStepsFirst;
      items.push({
        label: "Steps delta",
        value: `${delta > 0 ? "+" : ""}${Math.round(delta).toLocaleString()}`,
        helper: "Later average minus earlier average",
        icon: Rocket,
      });
    }
    if (exerciseImprovements.length > 0) {
      items.push({
        label: "Strength movers",
        value: `${exerciseImprovements.length}`,
        helper: "Exercises with higher logged loads",
        icon: CheckCircle2,
      });
    }
    if (hasCheckinTrendData) {
      items.push({
        label: "Check-in shifts",
        value: `${checkinQuestionTrends.numeric.length + checkinQuestionTrends.text.length}`,
        helper: "Questions with meaningful response changes",
        icon: MessageCircle,
      });
    }
    if (
      items.length === 0 &&
      typeof habitsAnalysis?.avgProteinFirst === "number" &&
      typeof habitsAnalysis?.avgProteinSecond === "number"
    ) {
      const delta = habitsAnalysis.avgProteinSecond - habitsAnalysis.avgProteinFirst;
      items.push({
        label: "Protein delta",
        value: `${delta > 0 ? "+" : ""}${Math.round(delta)} g`,
        helper: "Later average minus earlier average",
        icon: Sparkles,
      });
    }
    return items.slice(0, 4);
  }, [checkinQuestionTrends, exerciseImprovements.length, habitsAnalysis, hasCheckinTrendData]);

  return (
    <div className="space-y-6">
      <DashboardCard title="Trend snapshot" subtitle="Actionable deltas across habits, training, and check-ins.">
        {loading ? (
          <div className="space-y-3">
            <Skeleton className="h-6 w-1/2" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : trendCards.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {trendCards.map((item) => (
              <StatCard
                key={item.label}
                label={item.label}
                value={item.value}
                helper={item.helper}
                icon={item.icon}
                module="analytics"
              />
            ))}
          </div>
        ) : (
          <EmptyState
            title="Not enough progress data yet"
            description={
              hasBaselineSubmission
                ? "Once the client logs habits, training, or check-ins, the most useful trend changes will appear here."
                : "Start by reviewing the baseline so future changes have a stronger point of comparison."
            }
            actionLabel={hasBaselineSubmission ? "Open habits" : "Open baseline"}
            onAction={hasBaselineSubmission ? onOpenHabits : onOpenBaseline}
          />
        )}
      </DashboardCard>

      <DashboardCard title="Habit shifts" subtitle="Compare earlier and later habit patterns in the current window.">
        {loading ? (
          <Skeleton className="h-24 w-full" />
        ) : habitsAnalysis ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border border-border/60 bg-muted/20 p-3">
              <p className="text-xs text-muted-foreground">Steps average</p>
              <p className="mt-1 text-sm font-semibold text-foreground">
                {habitsAnalysis.avgStepsFirst !== null ? Math.round(habitsAnalysis.avgStepsFirst).toLocaleString() : "Not logged"} to{" "}
                {habitsAnalysis.avgStepsSecond !== null ? Math.round(habitsAnalysis.avgStepsSecond).toLocaleString() : "Not logged"}
              </p>
            </div>
            <div className="rounded-xl border border-border/60 bg-muted/20 p-3">
              <p className="text-xs text-muted-foreground">Sleep average</p>
              <p className="mt-1 text-sm font-semibold text-foreground">
                {habitsAnalysis.avgSleepFirst !== null ? habitsAnalysis.avgSleepFirst.toFixed(1) : "Not logged"} hrs to{" "}
                {habitsAnalysis.avgSleepSecond !== null ? habitsAnalysis.avgSleepSecond.toFixed(1) : "Not logged"} hrs
              </p>
            </div>
            <div className="rounded-xl border border-border/60 bg-muted/20 p-3">
              <p className="text-xs text-muted-foreground">Protein average</p>
              <p className="mt-1 text-sm font-semibold text-foreground">
                {habitsAnalysis.avgProteinFirst !== null ? Math.round(habitsAnalysis.avgProteinFirst) : "Not logged"} g to{" "}
                {habitsAnalysis.avgProteinSecond !== null ? Math.round(habitsAnalysis.avgProteinSecond) : "Not logged"} g
              </p>
            </div>
            <div className="rounded-xl border border-border/60 bg-muted/20 p-3">
              <p className="text-xs text-muted-foreground">Calories average</p>
              <p className="mt-1 text-sm font-semibold text-foreground">
                {habitsAnalysis.avgCaloriesFirst !== null ? Math.round(habitsAnalysis.avgCaloriesFirst) : "Not logged"} to{" "}
                {habitsAnalysis.avgCaloriesSecond !== null ? Math.round(habitsAnalysis.avgCaloriesSecond) : "Not logged"}
              </p>
            </div>
          </div>
        ) : (
          <EmptyState
            title="No habit trend to review yet"
            description="Habit deltas will appear once the client logs enough daily entries to compare earlier and later behavior."
            actionLabel="Open habits"
            onAction={onOpenHabits}
          />
        )}
      </DashboardCard>

      <DashboardCard title="Training progression" subtitle="Recent lift changes and workload context from logged sessions.">
        {loading ? (
          <Skeleton className="h-24 w-full" />
        ) : exerciseImprovements.length > 0 ? (
          <div className="space-y-2">
            {exerciseImprovements.map((item) => (
              <div key={item.exerciseId} className="flex items-center justify-between rounded-xl border border-border/60 bg-muted/20 px-3 py-3 text-sm">
                <span className="font-medium">{item.exerciseName}</span>
                <span className="text-muted-foreground">
                  {item.startWeight} to {item.latestWeight} ({item.change > 0 ? "+" : ""}{item.change})
                </span>
              </div>
            ))}
          </div>
        ) : hasWorkoutHistory ? (
          <EmptyState
            title="Workout history exists, but no clear load gains yet"
            description="Sessions are being logged, but there is not enough evidence of meaningful load increases in the selected window."
            actionLabel="Open workout tab"
            onAction={onOpenWorkout}
          />
        ) : (
          <EmptyState
            title="No workout history yet"
            description="Logged training sessions will unlock exercise-level progression here."
            actionLabel="Open workout tab"
            onAction={onOpenWorkout}
          />
        )}
      </DashboardCard>

      <DashboardCard title="Check-in themes" subtitle="Numeric deltas and message changes worth reviewing.">
        {loading ? (
          <Skeleton className="h-24 w-full" />
        ) : hasCheckinTrendData ? (
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground">Numeric question trends</p>
              {checkinQuestionTrends.numeric.length > 0 ? (
                checkinQuestionTrends.numeric.map((row) => (
                  <div key={row.question} className="flex items-center justify-between rounded-xl border border-border/60 bg-muted/20 px-3 py-3 text-sm">
                    <span className="truncate pr-3">{row.question}</span>
                    <span className="text-muted-foreground">
                      {row.from} to {row.to} ({row.delta > 0 ? "+" : ""}{row.delta})
                    </span>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">No numeric answer changes detected.</p>
              )}
            </div>
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground">Text response shifts</p>
              {checkinQuestionTrends.text.length > 0 ? (
                checkinQuestionTrends.text.map((row) => (
                  <div key={row.question} className="rounded-xl border border-border/60 bg-muted/20 px-3 py-3 text-sm">
                    <p className="font-medium">{row.question}</p>
                    <p className="mt-2 text-xs text-muted-foreground">Previous: {row.previous}</p>
                    <p className="text-xs text-muted-foreground">Latest: {row.latest}</p>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">No text response changes detected.</p>
              )}
            </div>
          </div>
        ) : (
          <EmptyState
            title="No check-in trend shifts yet"
            description="Once the client submits repeated check-ins, changing answers and themes will surface here for faster review."
            actionLabel="Open check-ins"
            onAction={onOpenCheckins}
          />
        )}
      </DashboardCard>
    </div>
  );
}

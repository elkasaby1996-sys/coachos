import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Alert, AlertDescription, AlertTitle } from "../../components/ui/alert";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { Skeleton } from "../../components/ui/skeleton";
import { ClientReminders } from "../../components/common/client-reminders";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../lib/auth";
import { addDaysToDateString, diffDays, getTodayInTimezone } from "../../lib/date-utils";

type ClientProfile = {
  id: string;
  timezone: string | null;
  unit_preference: string | null;
};

type HabitLog = {
  id?: string | null;
  client_id: string;
  log_date: string;
  calories: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fats_g: number | null;
  weight_value: number | null;
  weight_unit: string | null;
  sleep_hours: number | null;
  steps: number | null;
  energy: number | null;
  hunger: number | null;
  stress: number | null;
  notes: string | null;
  updated_at?: string | null;
  created_at?: string | null;
};

type HabitFormState = {
  calories: string;
  protein_g: string;
  carbs_g: string;
  fats_g: string;
  weight_value: string;
  weight_unit: "kg" | "lb";
  sleep_hours: string;
  steps: string;
  energy: string;
  hunger: string;
  stress: string;
  notes: string;
};

const emptyForm: HabitFormState = {
  calories: "",
  protein_g: "",
  carbs_g: "",
  fats_g: "",
  weight_value: "",
  weight_unit: "kg",
  sleep_hours: "",
  steps: "",
  energy: "5",
  hunger: "5",
  stress: "5",
  notes: "",
};

const toNumberOrNull = (value: string) => {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? null : parsed;
};

const getErrorDetails = (error: unknown) => {
  if (!error) return { code: null, message: "Something went wrong." };
  if (error instanceof Error) {
    const err = error as Error & { code?: string | null };
    return { code: err.code ?? null, message: err.message ?? "Something went wrong." };
  }
  if (typeof error === "object") {
    const err = error as { code?: string | null; message?: string | null };
    return { code: err.code ?? null, message: err.message ?? "Something went wrong." };
  }
  return { code: null, message: "Something went wrong." };
};

export function ClientHabitsPage() {
  const { session } = useAuth();
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [formState, setFormState] = useState<HabitFormState>(emptyForm);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving">("idle");
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastVariant, setToastVariant] = useState<"success" | "error">("success");
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<{ code?: string | null; message?: string | null } | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!toastMessage) return;
    const timer = window.setTimeout(() => setToastMessage(null), 3000);
    return () => window.clearTimeout(timer);
  }, [toastMessage]);

  const clientQuery = useQuery({
    queryKey: ["client-habits-profile", session?.user?.id],
    enabled: !!session?.user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, timezone, unit_preference")
        .eq("user_id", session?.user?.id ?? "")
        .maybeSingle();
      if (error) throw error;
      return data as ClientProfile | null;
    },
  });

  const clientId = clientQuery.data?.id ?? null;
  const clientTimezone = clientQuery.data?.timezone ?? null;
  const todayStr = useMemo(() => getTodayInTimezone(clientTimezone), [clientTimezone]);

  useEffect(() => {
    if (!selectedDate && todayStr) {
      setSelectedDate(todayStr);
    }
  }, [selectedDate, todayStr]);

  const habitLogQuery = useQuery({
    queryKey: ["habit-log", clientId, selectedDate],
    enabled: !!clientId && !!selectedDate,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("habit_logs")
        .select("*")
        .eq("client_id", clientId ?? "")
        .eq("log_date", selectedDate)
        .maybeSingle();
      if (error) throw error;
      return data as HabitLog | null;
    },
  });

  const trendsQuery = useQuery({
    queryKey: ["habit-logs-7d", clientId, todayStr],
    enabled: !!clientId && !!todayStr,
    queryFn: async () => {
      const startDate = addDaysToDateString(todayStr, -6);
      const { data, error } = await supabase
        .from("habit_logs")
        .select("*")
        .eq("client_id", clientId ?? "")
        .gte("log_date", startDate)
        .lte("log_date", todayStr)
        .order("log_date", { ascending: true });
      if (error) throw error;
      return (data ?? []) as HabitLog[];
    },
  });

  useEffect(() => {
    if (habitLogQuery.isLoading) return;
    const log = habitLogQuery.data;
    if (!log) {
      const unitPreference = clientQuery.data?.unit_preference?.toLowerCase() === "imperial";
      setFormState({
        ...emptyForm,
        weight_unit: unitPreference ? "lb" : "kg",
      });
      setLastSavedAt(null);
      setSaveError(null);
      return;
    }

    setFormState({
      calories: log.calories ? String(log.calories) : "",
      protein_g: log.protein_g ? String(log.protein_g) : "",
      carbs_g: log.carbs_g ? String(log.carbs_g) : "",
      fats_g: log.fats_g ? String(log.fats_g) : "",
      weight_value: log.weight_value ? String(log.weight_value) : "",
      weight_unit: (log.weight_unit as "kg" | "lb") || "kg",
      sleep_hours: log.sleep_hours ? String(log.sleep_hours) : "",
      steps: log.steps ? String(log.steps) : "",
      energy: log.energy ? String(log.energy) : "5",
      hunger: log.hunger ? String(log.hunger) : "5",
      stress: log.stress ? String(log.stress) : "5",
      notes: log.notes ?? "",
    });
    setLastSavedAt(log.updated_at ?? log.created_at ?? null);
    setSaveError(null);
  }, [habitLogQuery.data, habitLogQuery.isLoading, clientQuery.data?.unit_preference]);

  const daysAgo = useMemo(() => {
    if (!selectedDate || !todayStr) return 0;
    return diffDays(todayStr, selectedDate);
  }, [selectedDate, todayStr]);

  const isEditable = daysAgo >= 0 && daysAgo <= 6;

  const trends = useMemo(() => {
    const logs = trendsQuery.data ?? [];
    const daysLogged = logs.length;
    const avg = (values: Array<number | null | undefined>) => {
      const filtered = values.filter((value) => typeof value === "number") as number[];
      if (filtered.length === 0) return null;
      const sum = filtered.reduce((acc, value) => acc + value, 0);
      return Math.round(sum / filtered.length);
    };

    const avgSteps = avg(logs.map((log) => log.steps ?? null));
    const avgSleep = avg(logs.map((log) => log.sleep_hours ?? null));
    const avgProtein = avg(logs.map((log) => log.protein_g ?? null));

    const weightLogs = logs.filter((log) => typeof log.weight_value === "number");
    const weightUnit = weightLogs.find((log) => log.weight_unit)?.weight_unit ?? null;
    const weightChange =
      weightLogs.length >= 2
        ? (weightLogs[weightLogs.length - 1].weight_value ?? 0) -
          (weightLogs[0].weight_value ?? 0)
        : null;

    return { daysLogged, avgSteps, avgSleep, avgProtein, weightChange, weightUnit };
  }, [trendsQuery.data]);

  const handleSave = async () => {
    if (!clientId || !selectedDate) return;
    if (!isEditable) return;
    if (!formState.weight_value.trim()) {
      setFormError("Weight is required.");
      return;
    }
    setSaveStatus("saving");
    setSaveError(null);
    setFormError(null);

    const payload: HabitLog = {
      client_id: clientId,
      log_date: selectedDate,
      calories: toNumberOrNull(formState.calories),
      protein_g: toNumberOrNull(formState.protein_g),
      carbs_g: toNumberOrNull(formState.carbs_g),
      fats_g: toNumberOrNull(formState.fats_g),
      weight_value: toNumberOrNull(formState.weight_value),
      weight_unit: formState.weight_value ? formState.weight_unit : null,
      sleep_hours: toNumberOrNull(formState.sleep_hours),
      steps: toNumberOrNull(formState.steps),
      energy: toNumberOrNull(formState.energy),
      hunger: toNumberOrNull(formState.hunger),
      stress: toNumberOrNull(formState.stress),
      notes: formState.notes.trim() || null,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from("habit_logs")
      .upsert(payload, { onConflict: "client_id,log_date" })
      .select()
      .single();

    if (error) {
      console.log("HABIT_LOG_SAVE_ERROR", error);
      setToastVariant("error");
      setToastMessage(error.message ?? "Failed to save habits.");
      setSaveError({ code: error.code ?? null, message: error.message ?? null });
      setSaveStatus("idle");
      return;
    }

    setToastVariant("success");
    setToastMessage("Habits saved.");
    setLastSavedAt(data?.updated_at ?? data?.created_at ?? null);
    setSaveStatus("idle");
    await habitLogQuery.refetch();
    await trendsQuery.refetch();
  };

  const weightUnitLabel = formState.weight_unit === "lb" ? "Weight (lb)" : "Weight (kg)";
  const queryError = habitLogQuery.error ?? trendsQuery.error;
  const queryErrorDetails = queryError ? getErrorDetails(queryError) : null;
  const lastSavedLabel = lastSavedAt
    ? new Date(lastSavedAt).toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
      })
    : null;

  return (
    <div className="space-y-6 pb-16 md:pb-0">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Habits</h1>
          <p className="text-sm text-muted-foreground">
            Track daily nutrition, recovery, and mindset.
          </p>
        </div>
        <Badge variant={isEditable ? "success" : "muted"}>
          {isEditable ? "Editable" : "Read-only"}
        </Badge>
      </div>

      <ClientReminders clientId={clientId} timezone={clientTimezone} />

      {toastMessage ? (
        <Alert className={toastVariant === "error" ? "border-danger/30" : "border-emerald-200"}>
          <AlertTitle>{toastVariant === "error" ? "Error" : "Saved"}</AlertTitle>
          <AlertDescription>{toastMessage}</AlertDescription>
        </Alert>
      ) : null}

      {queryErrorDetails ? (
        <Alert className="border-danger/30">
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>
            <div className="space-y-1 text-xs text-muted-foreground">
              <div>code: {queryErrorDetails.code ?? "n/a"}</div>
              <div>message: {queryErrorDetails.message ?? "n/a"}</div>
            </div>
          </AlertDescription>
        </Alert>
      ) : null}

      {saveError ? (
        <Alert className="border-danger/30">
          <AlertTitle>Save error</AlertTitle>
          <AlertDescription>
            <div className="space-y-1 text-xs text-muted-foreground">
              <div>code: {saveError.code ?? "n/a"}</div>
              <div>message: {saveError.message ?? "n/a"}</div>
            </div>
          </AlertDescription>
        </Alert>
      ) : null}

      {formError ? (
        <Alert className="border-danger/30">
          <AlertTitle>Validation</AlertTitle>
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      ) : null}

      {clientQuery.error ? (
        <Alert className="border-danger/30">
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>
            {clientQuery.error instanceof Error
              ? clientQuery.error.message
              : "Failed to load client."}
          </AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle>Daily log</CardTitle>
            <p className="text-sm text-muted-foreground">
              Select a date to edit. You can change logs from today or the previous 6 days.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs font-semibold text-muted-foreground">Date</label>
            <Input
              type="date"
              value={selectedDate}
              onChange={(event) => setSelectedDate(event.target.value)}
            />
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {habitLogQuery.isLoading || clientQuery.isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          ) : (
            <>
              {!isEditable ? (
                <Alert className="border-warning/40 bg-warning/10 text-warning-foreground">
                  <AlertTitle>Read-only log</AlertTitle>
                  <AlertDescription>
                    Past logs can only be edited within 7 days.
                  </AlertDescription>
                </Alert>
              ) : null}

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-muted-foreground">Calories</label>
                  <Input
                    type="number"
                    min="0"
                    value={formState.calories}
                    onChange={(event) =>
                      setFormState((prev) => ({ ...prev, calories: event.target.value }))
                    }
                    disabled={!isEditable}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-muted-foreground">Protein (g)</label>
                  <Input
                    type="number"
                    min="0"
                    value={formState.protein_g}
                    onChange={(event) =>
                      setFormState((prev) => ({ ...prev, protein_g: event.target.value }))
                    }
                    disabled={!isEditable}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-muted-foreground">Carbs (g)</label>
                  <Input
                    type="number"
                    min="0"
                    value={formState.carbs_g}
                    onChange={(event) =>
                      setFormState((prev) => ({ ...prev, carbs_g: event.target.value }))
                    }
                    disabled={!isEditable}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-muted-foreground">Fats (g)</label>
                  <Input
                    type="number"
                    min="0"
                    value={formState.fats_g}
                    onChange={(event) =>
                      setFormState((prev) => ({ ...prev, fats_g: event.target.value }))
                    }
                    disabled={!isEditable}
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Recommended today: prioritize calories + protein before fine-tuning carbs/fats.
              </p>

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-muted-foreground">
                    {weightUnitLabel}
                  </label>
                  <Input
                    type="number"
                    min="0"
                    value={formState.weight_value}
                    onChange={(event) =>
                      setFormState((prev) => ({ ...prev, weight_value: event.target.value }))
                    }
                    disabled={!isEditable}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-muted-foreground">Weight unit</label>
                  <select
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    value={formState.weight_unit}
                    onChange={(event) =>
                      setFormState((prev) => ({
                        ...prev,
                        weight_unit: event.target.value as "kg" | "lb",
                      }))
                    }
                    disabled={!isEditable}
                  >
                    <option value="kg">kg</option>
                    <option value="lb">lb</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-muted-foreground">
                    Sleep (hours)
                  </label>
                  <Input
                    type="number"
                    min="0"
                    step="0.1"
                    value={formState.sleep_hours}
                    onChange={(event) =>
                      setFormState((prev) => ({ ...prev, sleep_hours: event.target.value }))
                    }
                    disabled={!isEditable}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-muted-foreground">Steps</label>
                  <Input
                    type="number"
                    min="0"
                    value={formState.steps}
                    onChange={(event) =>
                      setFormState((prev) => ({ ...prev, steps: event.target.value }))
                    }
                    disabled={!isEditable}
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-muted-foreground">Energy (1-10)</label>
                  <Input
                    type="number"
                    min="1"
                    max="10"
                    value={formState.energy}
                    onChange={(event) =>
                      setFormState((prev) => ({ ...prev, energy: event.target.value }))
                    }
                    disabled={!isEditable}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-muted-foreground">Hunger (1-10)</label>
                  <Input
                    type="number"
                    min="1"
                    max="10"
                    value={formState.hunger}
                    onChange={(event) =>
                      setFormState((prev) => ({ ...prev, hunger: event.target.value }))
                    }
                    disabled={!isEditable}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-muted-foreground">Stress (1-10)</label>
                  <Input
                    type="number"
                    min="1"
                    max="10"
                    value={formState.stress}
                    onChange={(event) =>
                      setFormState((prev) => ({ ...prev, stress: event.target.value }))
                    }
                    disabled={!isEditable}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold text-muted-foreground">Notes</label>
                <textarea
                  className="min-h-[96px] w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  value={formState.notes}
                  onChange={(event) =>
                    setFormState((prev) => ({ ...prev, notes: event.target.value }))
                  }
                  disabled={!isEditable}
                />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="text-xs text-muted-foreground">
                  {lastSavedLabel ? `Last saved at ${lastSavedLabel}` : "Not saved yet"}
                </div>
                <Button onClick={handleSave} disabled={!isEditable || saveStatus === "saving"}>
                  {saveStatus === "saving" ? "Saving..." : "Save"}
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>7-day trends</CardTitle>
          <p className="text-sm text-muted-foreground">Quick snapshot of the last week.</p>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {trendsQuery.isLoading ? (
            <>
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
            </>
          ) : (
            <>
              <div className="rounded-lg border border-border p-3">
                <p className="text-xs text-muted-foreground">Days logged</p>
                <p className="text-lg font-semibold">{trends.daysLogged}/7</p>
              </div>
              <div className="rounded-lg border border-border p-3">
                <p className="text-xs text-muted-foreground">Avg steps</p>
                <p className="text-lg font-semibold">
                  {trends.avgSteps !== null ? trends.avgSteps.toLocaleString() : "—"}
                </p>
              </div>
              <div className="rounded-lg border border-border p-3">
                <p className="text-xs text-muted-foreground">Avg sleep</p>
                <p className="text-lg font-semibold">
                  {trends.avgSleep !== null ? `${trends.avgSleep} hrs` : "—"}
                </p>
              </div>
              <div className="rounded-lg border border-border p-3">
                <p className="text-xs text-muted-foreground">Avg protein</p>
                <p className="text-lg font-semibold">
                  {trends.avgProtein !== null ? `${trends.avgProtein} g` : "—"}
                </p>
              </div>
              <div className="rounded-lg border border-border p-3">
                <p className="text-xs text-muted-foreground">Weight change</p>
                <p className="text-lg font-semibold">
                  {typeof trends.weightChange === "number"
                    ? `${trends.weightChange > 0 ? "+" : ""}${trends.weightChange.toFixed(1)} ${
                        trends.weightUnit ?? ""
                      }`
                    : "—"}
                </p>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, AlertDescription, AlertTitle } from "../../components/ui/alert";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { Skeleton } from "../../components/ui/skeleton";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../lib/auth";

type BaselineEntry = {
  id: string;
  status: string | null;
  created_at: string | null;
  submitted_at: string | null;
  coach_notes?: string | null;
};

type BaselineMetrics = {
  weight_kg: number | null;
  height_cm: number | null;
  body_fat_pct: number | null;
  waist_cm: number | null;
  chest_cm: number | null;
  hips_cm: number | null;
  thigh_cm: number | null;
  arm_cm: number | null;
  resting_hr: number | null;
  vo2max: number | null;
};

type MetricsFormState = {
  weight: string;
  height_cm: string;
  body_fat_pct: string;
  waist_cm: string;
  chest_cm: string;
  hips_cm: string;
  thigh_cm: string;
  arm_cm: string;
  resting_hr: string;
  vo2max: string;
};

type MarkerTemplate = {
  id: string;
  name: string | null;
  unit_label: string | null;
  value_type: "number" | "text" | null;
};

type MarkerValueRow = {
  template_id: string | null;
  value_number: number | null;
  value_text: string | null;
};

type BaselinePhotoRow = {
  photo_type: string | null;
  url: string | null;
};

const photoTypes = ["front", "side", "back"] as const;
type PhotoType = (typeof photoTypes)[number];

const lbPerKg = 2.2046226218;

const toNumberOrNull = (value: string) => {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? null : parsed;
};

const roundNumber = (value: number, decimals = 2) =>
  Math.round(value * 10 ** decimals) / 10 ** decimals;

const formatNumberInput = (value: number | null | undefined, precision = 1) => {
  if (value === null || value === undefined || Number.isNaN(value)) return "";
  const fixed = value.toFixed(precision);
  return fixed.replace(/\.0+$/, "");
};

const isImperial = (value: string | null | undefined) =>
  value?.toLowerCase() === "imperial";

const formatSupabaseError = (error: unknown) => {
  if (!error) return "Something went wrong.";
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  if (typeof error === "object") {
    const err = error as { message?: string; code?: string; details?: string };
    const parts = [err.code, err.message, err.details].filter(Boolean);
    if (parts.length > 0) return parts.join(" - ");
  }
  return "Something went wrong.";
};

export function ClientBaselinePage() {
  const navigate = useNavigate();
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const [baselineEntry, setBaselineEntry] = useState<BaselineEntry | null>(null);
  const [baselineLoading, setBaselineLoading] = useState(false);
  const [baselineError, setBaselineError] = useState<string | null>(null);
  const [activeStep, setActiveStep] = useState(0);
  const [metricsState, setMetricsState] = useState<MetricsFormState>({
    weight: "",
    height_cm: "",
    body_fat_pct: "",
    waist_cm: "",
    chest_cm: "",
    hips_cm: "",
    thigh_cm: "",
    arm_cm: "",
    resting_hr: "",
    vo2max: "",
  });
  const [metricsStatus, setMetricsStatus] = useState<"idle" | "saving" | "error">(
    "idle"
  );
  const [metricsError, setMetricsError] = useState<{
    code?: string | null;
    message?: string | null;
    details?: string | null;
    hint?: string | null;
  } | null>(null);
  const [markerStatus, setMarkerStatus] = useState<"idle" | "saving" | "error">(
    "idle"
  );
  const [photoStatus, setPhotoStatus] = useState<"idle" | "saving" | "error">(
    "idle"
  );
  const [submitStatus, setSubmitStatus] = useState<"idle" | "saving" | "success" | "error">(
    "idle"
  );
  const [actionError, setActionError] = useState<string | null>(null);
  const [lastSupabaseError, setLastSupabaseError] = useState<{
    code?: string | null;
    message?: string | null;
  } | null>(null);
  const [lastUploadPath, setLastUploadPath] = useState<string | null>(null);
  const [markerValues, setMarkerValues] = useState<Record<string, string>>({});
  const [photoMap, setPhotoMap] = useState<Record<PhotoType, { url: string | null; error: string | null; uploading: boolean }>>({
    front: { url: null, error: null, uploading: false },
    side: { url: null, error: null, uploading: false },
    back: { url: null, error: null, uploading: false },
  });

  const initializationRef = useRef(false);
  const metricsInitRef = useRef(false);
  const markerInitRef = useRef(false);
  const photoInitRef = useRef(false);

  const clientQuery = useQuery({
    queryKey: ["client-baseline-context", session?.user?.id],
    enabled: !!session?.user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, workspace_id, unit_preference, height_cm")
        .eq("user_id", session?.user?.id ?? "")
        .maybeSingle();
      if (error) throw error;
      return data as {
        id: string;
        workspace_id: string | null;
        unit_preference: string | null;
        height_cm: number | null;
      } | null;
    },
  });

  const clientId = clientQuery.data?.id ?? null;
  const workspaceId = clientQuery.data?.workspace_id ?? null;
  const unitPreference = clientQuery.data?.unit_preference ?? null;
  const showImperial = isImperial(unitPreference);
  const clientWorkspaceId = clientQuery.data?.workspace_id ?? null;

  useEffect(() => {
    if (!clientId || !workspaceId || initializationRef.current) return;
    initializationRef.current = true;

    const loadBaselineEntry = async () => {
      setBaselineLoading(true);
      setBaselineError(null);

      const { data, error } = await supabase
        .from("baseline_entries")
        .select("id, status, created_at, submitted_at, coach_notes")
        .eq("client_id", clientId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        setBaselineError(formatSupabaseError(error));
        setBaselineLoading(false);
        return;
      }

      if (!data || data.status === "submitted") {
        const { data: inserted, error: insertError } = await supabase
          .from("baseline_entries")
          .insert({
            client_id: clientId,
            workspace_id: workspaceId,
            status: "draft",
            created_at: new Date().toISOString(),
          })
          .select("id, status, created_at, submitted_at, coach_notes")
          .maybeSingle();

        if (insertError) {
          setBaselineError(formatSupabaseError(insertError));
          setBaselineLoading(false);
          return;
        }
        setBaselineEntry(inserted ?? null);
        setBaselineLoading(false);
        return;
      }

      setBaselineEntry(data as BaselineEntry);
      setBaselineLoading(false);
    };

    loadBaselineEntry();
  }, [clientId, workspaceId]);

  const baselineId = baselineEntry?.id ?? null;

  const metricsQuery = useQuery({
    queryKey: ["baseline-metrics", baselineId],
    enabled: !!baselineId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("baseline_metrics")
        .select(
          "weight_kg, height_cm, body_fat_pct, waist_cm, chest_cm, hips_cm, thigh_cm, arm_cm, resting_hr, vo2max"
        )
        .eq("baseline_id", baselineId ?? "")
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as BaselineMetrics | null;
    },
  });

  const templatesQuery = useQuery({
    queryKey: ["baseline-marker-templates", clientWorkspaceId],
    enabled: !!clientWorkspaceId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("baseline_marker_templates")
        .select("id, name, unit_label, value_type")
        .eq("workspace_id", clientWorkspaceId ?? "")
        .eq("is_active", true)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as MarkerTemplate[];
    },
  });

  useEffect(() => {
    if (!clientWorkspaceId) return;
    const channel = supabase
      .channel(`baseline-marker-templates-${clientWorkspaceId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "baseline_marker_templates",
          filter: `workspace_id=eq.${clientWorkspaceId}`,
        },
        () => {
          queryClient.invalidateQueries({
            queryKey: ["baseline-marker-templates", clientWorkspaceId],
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [clientWorkspaceId, queryClient]);

  const markerValuesQuery = useQuery({
    queryKey: ["baseline-marker-values", baselineId],
    enabled: !!baselineId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("baseline_marker_values")
        .select("template_id, value_number, value_text")
        .eq("baseline_id", baselineId ?? "");
      if (error) throw error;
      return (data ?? []) as MarkerValueRow[];
    },
  });

  const photosQuery = useQuery({
    queryKey: ["baseline-photos", baselineId],
    enabled: !!baselineId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("baseline_photos")
        .select("photo_type, url")
        .eq("baseline_id", baselineId ?? "");
      if (error) throw error;
      return (data ?? []) as BaselinePhotoRow[];
    },
  });

  useEffect(() => {
    if (!baselineId || metricsInitRef.current || metricsQuery.isLoading) return;
    const metrics = metricsQuery.data;
    const height = metrics?.height_cm ?? clientQuery.data?.height_cm ?? null;
    const weightKg = metrics?.weight_kg ?? null;
    const weightDisplay =
      weightKg === null || weightKg === undefined
        ? ""
        : formatNumberInput(showImperial ? weightKg * lbPerKg : weightKg, 1);

    setMetricsState({
      weight: weightDisplay,
      height_cm: formatNumberInput(height, 1),
      body_fat_pct: formatNumberInput(metrics?.body_fat_pct, 1),
      waist_cm: formatNumberInput(metrics?.waist_cm, 1),
      chest_cm: formatNumberInput(metrics?.chest_cm, 1),
      hips_cm: formatNumberInput(metrics?.hips_cm, 1),
      thigh_cm: formatNumberInput(metrics?.thigh_cm, 1),
      arm_cm: formatNumberInput(metrics?.arm_cm, 1),
      resting_hr: formatNumberInput(metrics?.resting_hr, 0),
      vo2max: formatNumberInput(metrics?.vo2max, 1),
    });
    metricsInitRef.current = true;
  }, [baselineId, metricsQuery.isLoading, metricsQuery.data, clientQuery.data, showImperial]);

  useEffect(() => {
    if (markerInitRef.current || templatesQuery.isLoading || markerValuesQuery.isLoading) return;
    const templates = templatesQuery.data ?? [];
    const values = markerValuesQuery.data ?? [];
    const initial: Record<string, string> = {};
    templates.forEach((template) => {
      const row = values.find((item) => item.template_id === template.id);
      if (template.value_type === "number") {
        initial[template.id] =
          row?.value_number !== null && row?.value_number !== undefined
            ? String(row.value_number)
            : "";
      } else {
        initial[template.id] = row?.value_text ?? "";
      }
    });
    setMarkerValues(initial);
    markerInitRef.current = true;
  }, [
    templatesQuery.isLoading,
    templatesQuery.data,
    markerValuesQuery.isLoading,
    markerValuesQuery.data,
  ]);

  useEffect(() => {
    if (photoInitRef.current || photosQuery.isLoading) return;
    const next = { ...photoMap };
    photosQuery.data?.forEach((row) => {
      const type = row.photo_type as PhotoType | null;
      if (!type || !photoTypes.includes(type)) return;
      next[type] = { url: row.url ?? null, error: null, uploading: false };
    });
    setPhotoMap(next);
    photoInitRef.current = true;
  }, [photosQuery.isLoading, photosQuery.data, photoMap]);

  const metricsRequiredFilled = metricsState.weight.trim().length > 0;

  const templates = templatesQuery.data ?? [];
  const markersComplete =
    templates.length === 0 ||
    templates.every((template) => {
      const value = markerValues[template.id] ?? "";
      if (template.value_type === "number") {
        return value.trim().length > 0 && !Number.isNaN(Number(value));
      }
      return value.trim().length > 0;
    });

  const photosComplete = photoTypes.every((type) => Boolean(photoMap[type]?.url));

  const handleMetricsSave = async () => {
    if (!baselineId) return;
    setMetricsStatus("saving");
    setActionError(null);
    setMetricsError(null);
    setLastSupabaseError(null);

    const weightInput = toNumberOrNull(metricsState.weight);
    if (weightInput === null) {
      setMetricsStatus("error");
      setActionError("Weight is required.");
      return;
    }

    const weightKg = showImperial ? weightInput / lbPerKg : weightInput;

    const payload = {
      baseline_id: baselineId,
      weight_kg: roundNumber(weightKg, 2),
      height_cm: toNumberOrNull(metricsState.height_cm),
      body_fat_pct: toNumberOrNull(metricsState.body_fat_pct),
      waist_cm: toNumberOrNull(metricsState.waist_cm),
      chest_cm: toNumberOrNull(metricsState.chest_cm),
      hips_cm: toNumberOrNull(metricsState.hips_cm),
      thigh_cm: toNumberOrNull(metricsState.thigh_cm),
      arm_cm: toNumberOrNull(metricsState.arm_cm),
      resting_hr: toNumberOrNull(metricsState.resting_hr),
      vo2max: toNumberOrNull(metricsState.vo2max),
    };

    const { data, error } = await supabase
      .from("baseline_metrics")
      .upsert(payload, { onConflict: "baseline_id" });

    if (error) {
      setMetricsStatus("error");
      setActionError(formatSupabaseError(error));
      setMetricsError({
        code: error.code ?? null,
        message: error.message ?? null,
        details: (error as { details?: string | null }).details ?? null,
        hint: (error as { hint?: string | null }).hint ?? null,
      });
      setLastSupabaseError({ code: error.code ?? null, message: error.message ?? null });
      console.error("BASELINE_STEP1_ERROR", error);
      return;
    }

    setMetricsStatus("idle");
    setActiveStep(1);
  };

  const handleMarkersSave = async () => {
    if (!baselineId) return;
    if (templates.length === 0) {
      setActiveStep(2);
      return;
    }

    setMarkerStatus("saving");
    setActionError(null);
    setLastSupabaseError(null);

    const payload = templates.map((template) => {
      const rawValue = markerValues[template.id];
      return {
        baseline_id: baselineId,
        template_id: template.id,
        value_number:
          template.value_type === "number" ? Number(rawValue) : null,
        value_text:
          template.value_type === "number" ? null : rawValue?.trim() ?? "",
      };
    });

    const { error } = await supabase
      .from("baseline_marker_values")
      .upsert(payload, { onConflict: "baseline_id,template_id" });

    if (error) {
      setMarkerStatus("error");
      setActionError(formatSupabaseError(error));
      setLastSupabaseError({ code: error.code ?? null, message: error.message ?? null });
      return;
    }

    setMarkerStatus("idle");
    setActiveStep(2);
  };

  const upsertPhotoRow = async (
    baselineIdValue: string,
    photoType: PhotoType,
    url: string,
    storagePath: string
  ) => {
    const payload = {
      baseline_id: baselineIdValue,
      client_id: clientId,
      photo_type: photoType,
      url,
      storage_path: storagePath,
    };
    const { error } = await supabase
      .from("baseline_photos")
      .upsert(payload, { onConflict: "baseline_id,photo_type" });

    if (!error) return null;

    const { error: deleteError } = await supabase
      .from("baseline_photos")
      .delete()
      .eq("baseline_id", baselineIdValue)
      .eq("photo_type", photoType);

    if (deleteError) return deleteError;

    const { error: insertError } = await supabase.from("baseline_photos").insert(payload);
    return insertError ?? null;
  };

  const handlePhotoUpload = async (photoType: PhotoType, file: File | null) => {
    if (!file || !baselineId || !clientId) return;
    setPhotoStatus("saving");
    setActionError(null);
    setLastSupabaseError(null);
    setPhotoMap((prev) => ({
      ...prev,
      [photoType]: { ...prev[photoType], uploading: true, error: null },
    }));

    const fileExt = file.name.split(".").pop() || "jpg";
    const filePath = `${clientId}/${baselineId}/${photoType}.${fileExt}`;
    setLastUploadPath(filePath);
    const { error: uploadError } = await supabase.storage
      .from("baseline_photos")
      .upload(filePath, file, { upsert: true, contentType: file.type || "image/jpeg" });

    if (uploadError) {
      setPhotoMap((prev) => ({
        ...prev,
        [photoType]: { ...prev[photoType], uploading: false, error: uploadError.message },
      }));
      setPhotoStatus("error");
      setActionError(formatSupabaseError(uploadError));
      setLastSupabaseError({
        code: uploadError.code ?? null,
        message: uploadError.message ?? null,
      });
      return;
    }

    let url: string | null = null;
    const { data: signedData, error: signedError } = await supabase.storage
      .from("baseline_photos")
      .createSignedUrl(filePath, 60 * 60 * 24 * 7);

    if (!signedError) {
      url = signedData?.signedUrl ?? null;
    }

    if (!url) {
      const { data } = supabase.storage.from("baseline_photos").getPublicUrl(filePath);
      url = data.publicUrl ?? null;
    }

    if (!url) {
      setPhotoMap((prev) => ({
        ...prev,
        [photoType]: { ...prev[photoType], uploading: false, error: "Failed to load photo URL." },
      }));
      setPhotoStatus("error");
      setActionError("Failed to load photo URL.");
      setLastSupabaseError({ code: null, message: "Failed to load photo URL." });
      return;
    }

    const saveError = await upsertPhotoRow(baselineId, photoType, url, filePath);
    if (saveError) {
      setPhotoMap((prev) => ({
        ...prev,
        [photoType]: { ...prev[photoType], uploading: false, error: saveError.message },
      }));
      setPhotoStatus("error");
      setActionError(formatSupabaseError(saveError));
      setLastSupabaseError({
        code: (saveError as { code?: string | null }).code ?? null,
        message: (saveError as { message?: string | null }).message ?? null,
      });
      return;
    }

    setPhotoMap((prev) => ({
      ...prev,
      [photoType]: { url, uploading: false, error: null },
    }));
    setPhotoStatus("idle");
  };

  const handleSubmitBaseline = async () => {
    if (!baselineId) return;
    setSubmitStatus("saving");
    setActionError(null);
    setLastSupabaseError(null);

    const { error } = await supabase
      .from("baseline_entries")
      .update({
        status: "submitted",
        submitted_at: new Date().toISOString(),
      })
      .eq("id", baselineId);

    if (error) {
      setSubmitStatus("error");
      setActionError(formatSupabaseError(error));
      setLastSupabaseError({ code: error.code ?? null, message: error.message ?? null });
      return;
    }

    setSubmitStatus("success");
    await queryClient.invalidateQueries({
      queryKey: ["client-baseline-submitted-latest", clientId],
    });
    window.setTimeout(() => navigate("/app/home"), 1200);
  };

  const errors = [
    clientQuery.error,
    metricsQuery.error,
    templatesQuery.error,
    markerValuesQuery.error,
    photosQuery.error,
    baselineError ? new Error(baselineError) : null,
    actionError ? new Error(actionError) : null,
  ].filter(Boolean);

  const showDebugPanel = import.meta.env.DEV;

  if (baselineLoading || clientQuery.isLoading) {
    return (
      <div className="space-y-4 pb-16 md:pb-0">
        <Skeleton className="h-10 w-1/2" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (clientQuery.error || !clientId) {
    return (
      <div className="space-y-4 pb-16 md:pb-0">
        <Alert className="border-danger/30">
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>
            {clientQuery.error
              ? formatSupabaseError(clientQuery.error)
              : "Client record not accessible (RLS) or not found."}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (submitStatus === "success") {
    return (
      <div className="space-y-6 pb-16 md:pb-0">
        <Card>
          <CardHeader>
            <CardTitle>Baseline submitted</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>Your coach has received your baseline. Redirecting you to home.</p>
            <Button onClick={() => navigate("/app/home")}>Go to home now</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-16 md:pb-0">
      <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
        BASELINE WIZARD ACTIVE (v2)
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Baseline</h1>
          <p className="text-sm text-muted-foreground">
            Capture your body metrics, performance markers, and photos.
          </p>
        </div>
        <Badge variant="muted">Draft</Badge>
      </div>

      {errors.length > 0 ? (
        <div className="space-y-2">
          {errors.map((error, index) => (
            <Alert key={`${index}-${formatSupabaseError(error)}`} className="border-danger/30">
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>{formatSupabaseError(error)}</AlertDescription>
            </Alert>
          ))}
        </div>
      ) : null}

      {lastSupabaseError ? (
        <Alert className="border-danger/30">
          <AlertTitle>Supabase error</AlertTitle>
          <AlertDescription>
            <div className="space-y-1 text-xs text-muted-foreground">
              <div>code: {lastSupabaseError.code ?? "n/a"}</div>
              <div>message: {lastSupabaseError.message ?? "n/a"}</div>
            </div>
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {["Body metrics", "Performance markers", "Photos"].map((label, index) => (
          <Badge key={label} variant={activeStep === index ? "success" : "muted"}>
            {index + 1}. {label}
          </Badge>
        ))}
      </div>

      {showDebugPanel ? (
        <Card className="border-dashed">
          <CardHeader>
            <CardTitle className="text-sm">Debug</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-xs text-muted-foreground">
            <div>clientId: {clientId}</div>
            <div>clientWorkspaceId: {clientWorkspaceId ?? "null"}</div>
            <div>templates count: {templates.length}</div>
            <div>last error: {actionError ?? baselineError ?? "none"}</div>
            <div>upload path: {lastUploadPath ?? "n/a"}</div>
          </CardContent>
        </Card>
      ) : null}

      {activeStep === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Step 1 — Body metrics</CardTitle>
            <p className="text-sm text-muted-foreground">
              We always store metric units. Please keep units visible.
            </p>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            {metricsStatus === "error" && metricsError ? (
              <Alert className="border-danger/30 sm:col-span-2">
                <AlertTitle>Baseline metrics save failed</AlertTitle>
                <AlertDescription>
                  <div className="space-y-1 text-xs text-muted-foreground">
                    <div>code: {metricsError.code ?? "n/a"}</div>
                    <div>message: {metricsError.message ?? "n/a"}</div>
                    <div>details: {metricsError.details ?? "n/a"}</div>
                    <div>hint: {metricsError.hint ?? "n/a"}</div>
                  </div>
                </AlertDescription>
              </Alert>
            ) : null}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-muted-foreground">
                Weight {showImperial ? "(lb)" : "(kg)"} *
              </label>
              <Input
                type="number"
                min="0"
                step="0.1"
                value={metricsState.weight}
                onChange={(event) =>
                  setMetricsState((prev) => ({ ...prev, weight: event.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-semibold text-muted-foreground">
                Height (cm)
              </label>
              <Input
                type="number"
                min="0"
                step="0.1"
                value={metricsState.height_cm}
                onChange={(event) =>
                  setMetricsState((prev) => ({ ...prev, height_cm: event.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-semibold text-muted-foreground">
                Body fat (%)
              </label>
              <Input
                type="number"
                min="0"
                step="0.1"
                value={metricsState.body_fat_pct}
                onChange={(event) =>
                  setMetricsState((prev) => ({ ...prev, body_fat_pct: event.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-semibold text-muted-foreground">
                Waist (cm)
              </label>
              <Input
                type="number"
                min="0"
                step="0.1"
                value={metricsState.waist_cm}
                onChange={(event) =>
                  setMetricsState((prev) => ({ ...prev, waist_cm: event.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-semibold text-muted-foreground">
                Chest (cm)
              </label>
              <Input
                type="number"
                min="0"
                step="0.1"
                value={metricsState.chest_cm}
                onChange={(event) =>
                  setMetricsState((prev) => ({ ...prev, chest_cm: event.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-semibold text-muted-foreground">
                Hips (cm)
              </label>
              <Input
                type="number"
                min="0"
                step="0.1"
                value={metricsState.hips_cm}
                onChange={(event) =>
                  setMetricsState((prev) => ({ ...prev, hips_cm: event.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-semibold text-muted-foreground">
                Thigh (cm)
              </label>
              <Input
                type="number"
                min="0"
                step="0.1"
                value={metricsState.thigh_cm}
                onChange={(event) =>
                  setMetricsState((prev) => ({ ...prev, thigh_cm: event.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-semibold text-muted-foreground">
                Arm (cm)
              </label>
              <Input
                type="number"
                min="0"
                step="0.1"
                value={metricsState.arm_cm}
                onChange={(event) =>
                  setMetricsState((prev) => ({ ...prev, arm_cm: event.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-semibold text-muted-foreground">
                Resting heart rate (bpm)
              </label>
              <Input
                type="number"
                min="0"
                step="1"
                value={metricsState.resting_hr}
                onChange={(event) =>
                  setMetricsState((prev) => ({ ...prev, resting_hr: event.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-semibold text-muted-foreground">
                VO2 max (ml/kg/min)
              </label>
              <Input
                type="number"
                min="0"
                step="0.1"
                value={metricsState.vo2max}
                onChange={(event) =>
                  setMetricsState((prev) => ({ ...prev, vo2max: event.target.value }))
                }
              />
            </div>
            <div className="sm:col-span-2 flex flex-wrap items-center justify-between gap-3">
              <Button variant="secondary" onClick={() => navigate("/app/home")}>
                Cancel
              </Button>
              <Button
                onClick={handleMetricsSave}
                disabled={!metricsRequiredFilled || metricsStatus === "saving"}
              >
                {metricsStatus === "saving" ? "Saving..." : "Next"}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {activeStep === 1 ? (
        <Card>
          <CardHeader>
            <CardTitle>Step 2 — Performance markers</CardTitle>
            <p className="text-sm text-muted-foreground">
              Log the markers your coach set for this baseline.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {templatesQuery.isLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
              </div>
            ) : templates.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border bg-muted/30 p-4 text-sm text-muted-foreground">
                No performance markers set by coach yet.
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {templates.map((template) => (
                  <div key={template.id} className="space-y-2">
                    <label className="text-xs font-semibold text-muted-foreground">
                      {template.name ?? "Marker"}
                      {template.unit_label ? ` (${template.unit_label})` : ""}
                    </label>
                    <Input
                      type={template.value_type === "number" ? "number" : "text"}
                      step={template.value_type === "number" ? "0.1" : undefined}
                      value={markerValues[template.id] ?? ""}
                      onChange={(event) =>
                        setMarkerValues((prev) => ({
                          ...prev,
                          [template.id]: event.target.value,
                        }))
                      }
                    />
                  </div>
                ))}
              </div>
            )}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Button variant="secondary" onClick={() => setActiveStep(0)}>
                Back
              </Button>
              <Button
                onClick={handleMarkersSave}
                disabled={!markersComplete || markerStatus === "saving"}
              >
                {markerStatus === "saving" ? "Saving..." : "Next"}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {activeStep === 2 ? (
        <Card>
          <CardHeader>
            <CardTitle>Step 3 — Photos</CardTitle>
            <p className="text-sm text-muted-foreground">
              Upload front, side, and back photos to complete your baseline.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-3">
              {photoTypes.map((type) => (
                <div key={type} className="space-y-2 rounded-lg border border-border p-3">
                  <p className="text-xs font-semibold uppercase text-muted-foreground">
                    {type}
                  </p>
                  <div className="flex h-32 items-center justify-center rounded-md border border-dashed border-border bg-muted/30">
                    {photoMap[type]?.url ? (
                      <img
                        src={photoMap[type]?.url ?? ""}
                        alt={`${type} photo`}
                        className="h-full w-full rounded-md object-cover"
                      />
                    ) : (
                      <span className="text-xs text-muted-foreground">No photo</span>
                    )}
                  </div>
                  <Input
                    type="file"
                    accept="image/*"
                    onChange={(event) => handlePhotoUpload(type, event.target.files?.[0] ?? null)}
                  />
                  {photoMap[type]?.error ? (
                    <p className="text-xs text-danger">{photoMap[type]?.error}</p>
                  ) : null}
                </div>
              ))}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Button variant="secondary" onClick={() => setActiveStep(1)}>
                Back
              </Button>
              <Button
                onClick={handleSubmitBaseline}
                disabled={!photosComplete || submitStatus === "saving" || photoStatus === "saving"}
              >
                {submitStatus === "saving" ? "Submitting..." : "Submit baseline"}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Alert, AlertDescription, AlertTitle } from "../../components/ui/alert";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { DashboardCard, EmptyState, Skeleton, StatusPill } from "../../components/ui/coachos";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../lib/auth";
import { cn } from "../../lib/utils";
import { getTodayInTimezone, getWeekEndSaturday } from "../../lib/date-utils";

type ClientRow = {
  id: string;
  workspace_id: string | null;
  checkin_template_id?: string | null;
  checkin_frequency?: string | null;
  checkin_start_date?: string | null;
  timezone?: string | null;
  [key: string]: unknown;
};

type WorkspaceRow = {
  id: string;
  default_checkin_template_id: string | null;
};

type CheckinTemplateRow = Record<string, unknown> & {
  id: string;
  name?: string | null;
  is_default?: boolean | null;
  is_active?: boolean | null;
  checkin_questions?: CheckinQuestionRow[] | null;
};

type CheckinQuestionRow = Record<string, unknown> & {
  id: string;
  question_text?: string | null;
  prompt?: string | null;
  question_type?: string | null;
  response_type?: string | null;
  type?: string | null;
  input_type?: string | null;
  min?: number | null;
  max?: number | null;
  is_required?: boolean | null;
  sort_order?: number | null;
  position?: number | null;
};

type CheckinRow = {
  id: string;
  client_id: string;
  week_ending_saturday: string;
  submitted_at: string | null;
  template_id?: string | null;
};

type CheckinAnswerRow = {
  id: string;
  question_id: string;
  value_text: string | null;
  value_number: number | null;
};

type CheckinPhotoRow = {
  id: string;
  checkin_id: string;
  client_id: string;
  url: string;
  storage_path: string;
  photo_type: string;
};

type QuestionValue = {
  text?: string;
  number?: number | null;
  boolean?: boolean | null;
};

type PhotoType = "front" | "side" | "back" | "optional";

type PhotoState = {
  file: File | null;
  previewUrl: string | null;
  existingUrl: string | null;
};

const steps = ["Questions", "Photos", "Review"];

const statusMap = {
  active: { label: "In progress", variant: "warning" },
  submitted: { label: "Submitted", variant: "success" },
  due: { label: "Due", variant: "warning" },
};

const requiredStatusMap = {
  active: { label: "Required", variant: "warning" },
  required: { label: "Required", variant: "warning" },
};

const photoSlots: Array<{ type: PhotoType; label: string; required?: boolean }> = [
  { type: "front", label: "Front", required: true },
  { type: "side", label: "Side", required: true },
  { type: "back", label: "Back", required: true },
  { type: "optional", label: "Optional" },
];

const getQuestionLabel = (question: CheckinQuestionRow) =>
  question.question_text || question.prompt || "Question";

const normalizeQuestionType = (question: CheckinQuestionRow) => {
  const raw =
    question.question_type ||
    question.response_type ||
    question.type ||
    question.input_type ||
    "text";
  const normalized = String(raw).toLowerCase();
  if (["scale", "rating", "slider"].includes(normalized)) return "scale";
  if (["boolean", "yes_no", "yes-no", "yesno"].includes(normalized)) return "yes_no";
  if (["number", "numeric", "int", "float"].includes(normalized)) return "number";
  return "text";
};

const formatWeekEnding = (dateStr: string) => {
  if (!dateStr) return "--";
  const date = new Date(`${dateStr}T00:00:00Z`);
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
};

const computeNextCheckinDate = (
  startDate: string | null | undefined,
  frequency: string | null | undefined,
  fromDate: string
) => {
  if (!startDate) return null;
  const start = new Date(`${startDate}T00:00:00Z`);
  if (Number.isNaN(start.getTime())) return null;
  const from = new Date(`${fromDate}T00:00:00Z`);
  if (Number.isNaN(from.getTime())) return null;

  const freq = frequency ?? "weekly";
  const stepDays = freq === "biweekly" ? 14 : freq === "monthly" ? 30 : 7;
  const next = new Date(start);
  while (next <= from) {
    next.setDate(next.getDate() + stepDays);
  }
  const yyyy = next.getUTCFullYear();
  const mm = String(next.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(next.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

export function ClientCheckinPage() {
  const { user } = useAuth();
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, QuestionValue>>({});
  const [photos, setPhotos] = useState<Record<PhotoType, PhotoState>>({
    front: { file: null, previewUrl: null, existingUrl: null },
    side: { file: null, previewUrl: null, existingUrl: null },
    back: { file: null, previewUrl: null, existingUrl: null },
    optional: { file: null, previewUrl: null, existingUrl: null },
  });
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastVariant, setToastVariant] = useState<"success" | "error">("success");
  const [submitting, setSubmitting] = useState(false);
  const [hydratedCheckinId, setHydratedCheckinId] = useState<string | null>(null);

  const clientQuery = useQuery({
    queryKey: ["client-checkin-profile", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, workspace_id, checkin_template_id, checkin_frequency, checkin_start_date, timezone")
        .eq("user_id", user?.id ?? "")
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as ClientRow | null;
    },
  });

  const todayStr = useMemo(
    () => getTodayInTimezone(clientQuery.data?.timezone ?? null),
    [clientQuery.data?.timezone]
  );
  const weekEndingSaturday = useMemo(() => getWeekEndSaturday(todayStr), [todayStr]);

  const workspaceQuery = useQuery({
    queryKey: ["client-checkin-workspace", clientQuery.data?.workspace_id],
    enabled: !!clientQuery.data?.workspace_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workspaces")
        .select("id, default_checkin_template_id")
        .eq("id", clientQuery.data?.workspace_id ?? "")
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as WorkspaceRow | null;
    },
  });

  const assignedTemplateId = clientQuery.data?.checkin_template_id ?? null;
  const workspaceDefaultTemplateId =
    workspaceQuery.data?.default_checkin_template_id ?? null;

  const latestTemplateQuery = useQuery({
    queryKey: ["client-checkin-latest-template", clientQuery.data?.workspace_id],
    enabled:
      !!clientQuery.data?.workspace_id &&
      workspaceQuery.isFetched &&
      !assignedTemplateId &&
      !workspaceDefaultTemplateId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("checkin_templates")
        .select("*")
        .eq("workspace_id", clientQuery.data?.workspace_id ?? "")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as CheckinTemplateRow | null;
    },
  });

  const templateId =
    assignedTemplateId ?? workspaceDefaultTemplateId ?? latestTemplateQuery.data?.id ?? null;

  const templateQuery = useQuery({
    queryKey: ["client-checkin-template", templateId],
    enabled: !!templateId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("checkin_templates")
        .select("id, name, checkin_questions(*)")
        .eq("id", templateId ?? "")
        .single();
      if (error) {
        if ((error as { code?: string }).code === "PGRST116") return null;
        throw error;
      }
      return (data ?? null) as CheckinTemplateRow | null;
    },
  });

  const checkinQuery = useQuery({
    queryKey: ["client-week-checkin", clientQuery.data?.id, weekEndingSaturday],
    enabled: !!clientQuery.data?.id && !!weekEndingSaturday,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("checkins")
        .select("*")
        .eq("client_id", clientQuery.data?.id ?? "")
        .eq("week_ending_saturday", weekEndingSaturday)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as CheckinRow | null;
    },
  });

  const answersQuery = useQuery({
    queryKey: ["client-checkin-answers", checkinQuery.data?.id],
    enabled: !!checkinQuery.data?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("checkin_answers")
        .select("id, question_id, value_text, value_number")
        .eq("checkin_id", checkinQuery.data?.id ?? "");
      if (error) throw error;
      return (data ?? []) as CheckinAnswerRow[];
    },
  });

  const photosQuery = useQuery({
    queryKey: ["client-checkin-photos", checkinQuery.data?.id],
    enabled: !!checkinQuery.data?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("checkin_photos")
        .select("id, checkin_id, client_id, url, storage_path, photo_type")
        .eq("checkin_id", checkinQuery.data?.id ?? "");
      if (error) throw error;
      return (data ?? []) as CheckinPhotoRow[];
    },
  });

  const questions = useMemo(() => {
    const rows = templateQuery.data?.checkin_questions ?? [];
    return [...rows].sort((a, b) => {
      const aOrder = a.sort_order ?? a.position ?? 0;
      const bOrder = b.sort_order ?? b.position ?? 0;
      return aOrder - bOrder;
    });
  }, [templateQuery.data]);

  const isSubmitted = Boolean(checkinQuery.data?.submitted_at);
  const isLoading =
    clientQuery.isLoading ||
    workspaceQuery.isLoading ||
    latestTemplateQuery.isLoading ||
    templateQuery.isLoading ||
    checkinQuery.isLoading;
  const hasTemplate = Boolean(templateQuery.data);
  const missingTemplate = !isLoading && !hasTemplate && !!clientQuery.data?.workspace_id;

  useEffect(() => {
    if (!toastMessage) return;
    const timeout = setTimeout(() => setToastMessage(null), 2400);
    return () => clearTimeout(timeout);
  }, [toastMessage]);

  useEffect(() => {
    const checkinId = checkinQuery.data?.id ?? null;
    if (!checkinId) {
      setAnswers({});
      setPhotos({
        front: { file: null, previewUrl: null, existingUrl: null },
        side: { file: null, previewUrl: null, existingUrl: null },
        back: { file: null, previewUrl: null, existingUrl: null },
        optional: { file: null, previewUrl: null, existingUrl: null },
      });
      setHydratedCheckinId(null);
      return;
    }
    if (hydratedCheckinId === checkinId) return;

    const hydratedAnswers: Record<string, QuestionValue> = {};
    (answersQuery.data ?? []).forEach((row) => {
      hydratedAnswers[row.question_id] = {
        text: row.value_text ?? "",
        number: typeof row.value_number === "number" ? row.value_number : null,
        boolean: row.value_text === "Yes" ? true : row.value_text === "No" ? false : null,
      };
    });
    setAnswers(hydratedAnswers);

    const nextPhotos: Record<PhotoType, PhotoState> = {
      front: { file: null, previewUrl: null, existingUrl: null },
      side: { file: null, previewUrl: null, existingUrl: null },
      back: { file: null, previewUrl: null, existingUrl: null },
      optional: { file: null, previewUrl: null, existingUrl: null },
    };
    (photosQuery.data ?? []).forEach((row) => {
      const type = row.photo_type as PhotoType;
      if (!nextPhotos[type]) return;
      nextPhotos[type] = {
        file: null,
        previewUrl: row.url,
        existingUrl: row.url,
      };
    });
    setPhotos(nextPhotos);
    setHydratedCheckinId(checkinId);
  }, [checkinQuery.data?.id, answersQuery.data, photosQuery.data, hydratedCheckinId]);

  const handleAnswerChange = (questionId: string, value: QuestionValue) => {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
  };

  const handleFileChange = (type: PhotoType, file: File | null) => {
    setPhotos((prev) => {
      const current = prev[type];
      if (current.previewUrl && current.previewUrl.startsWith("blob:")) {
        URL.revokeObjectURL(current.previewUrl);
      }
      return {
        ...prev,
        [type]: {
          file,
          previewUrl: file ? URL.createObjectURL(file) : current.existingUrl ?? null,
          existingUrl: current.existingUrl ?? null,
        },
      };
    });
  };

  const handleRemovePhoto = (type: PhotoType) => {
    setPhotos((prev) => {
      const current = prev[type];
      if (current.previewUrl && current.previewUrl.startsWith("blob:")) {
        URL.revokeObjectURL(current.previewUrl);
      }
      return {
        ...prev,
        [type]: { file: null, previewUrl: null, existingUrl: null },
      };
    });
  };

  const handleSubmit = async () => {
    if (!clientQuery.data?.id || !weekEndingSaturday || !templateQuery.data?.id) return;
    setSubmitting(true);
    setToastMessage(null);
    try {
      const { data: checkinRow, error: checkinError } = await supabase
        .from("checkins")
        .upsert(
          {
            client_id: clientQuery.data.id,
            week_ending_saturday: weekEndingSaturday,
            template_id: templateQuery.data.id,
          },
          { onConflict: "client_id,week_ending_saturday" }
        )
        .select("*")
        .maybeSingle();

      if (checkinError || !checkinRow?.id) {
        throw checkinError ?? new Error("Unable to save check-in.");
      }

      const payload = questions
        .map((question) => {
          const value = answers[question.id] ?? {};
          const hasValue =
            typeof value.text === "string"
              ? value.text.trim().length > 0
              : typeof value.number === "number" ||
                typeof value.boolean === "boolean";
          if (!hasValue) return null;
          return {
            checkin_id: checkinRow.id,
            question_id: question.id,
            value_text:
              typeof value.text === "string"
                ? value.text.trim()
                : typeof value.boolean === "boolean"
                ? value.boolean
                  ? "Yes"
                  : "No"
                : null,
            value_number: typeof value.number === "number" ? value.number : null,
          };
        })
        .filter(Boolean) as Array<{
        checkin_id: string;
        question_id: string;
        value_text: string | null;
        value_number: number | null;
      }>;

      if (payload.length > 0) {
        const { error: answersError } = await supabase
          .from("checkin_answers")
          .upsert(payload, { onConflict: "checkin_id,question_id" });
        if (answersError) throw answersError;
      }

      const photoRows: Array<{
        checkin_id: string;
        client_id: string;
        url: string;
        storage_path: string;
        photo_type: string;
      }> = [];

      for (const slot of photoSlots) {
        const state = photos[slot.type];
        if (!state?.file) continue;
        const extension = state.file.name.split(".").pop() || "jpg";
        const storagePath = `${clientQuery.data.id}/${checkinRow.id}/${slot.type}-${Date.now()}.${extension}`;
        const { error: uploadError } = await supabase.storage
          .from("checkin-photos")
          .upload(storagePath, state.file, { upsert: true });
        if (uploadError) throw uploadError;
        const { data: publicUrl } = supabase.storage
          .from("checkin-photos")
          .getPublicUrl(storagePath);
        photoRows.push({
          checkin_id: checkinRow.id,
          client_id: clientQuery.data.id,
          url: publicUrl.publicUrl,
          storage_path: storagePath,
          photo_type: slot.type,
        });
      }

      if (photoRows.length > 0) {
        const { error: photosError } = await supabase
          .from("checkin_photos")
          .upsert(photoRows, { onConflict: "checkin_id,photo_type" });
        if (photosError) throw photosError;
      }

      const { error: submitError } = await supabase
        .from("checkins")
        .update({ submitted_at: new Date().toISOString() })
        .eq("id", checkinRow.id);
      if (submitError) throw submitError;

      const nextDate = computeNextCheckinDate(
        clientQuery.data?.checkin_start_date ?? null,
        clientQuery.data?.checkin_frequency ?? "weekly",
        weekEndingSaturday
      );
      if (nextDate && templateQuery.data?.id) {
        await supabase.from("checkins").upsert(
          {
            client_id: clientQuery.data.id,
            week_ending_saturday: nextDate,
            template_id: templateQuery.data.id,
          },
          { onConflict: "client_id,week_ending_saturday" }
        );
      }

      setToastVariant("success");
      setToastMessage("Check-in submitted.");
      await checkinQuery.refetch();
      await answersQuery.refetch();
      await photosQuery.refetch();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to submit check-in.";
      setToastVariant("error");
      setToastMessage(message);
    } finally {
      setSubmitting(false);
    }
  };

  const canProceed = hasTemplate && !isLoading;
  const weekEndingLabel = formatWeekEnding(weekEndingSaturday);
  const statusKey = isSubmitted ? "submitted" : checkinQuery.data ? "active" : "due";
  const pageError =
    clientQuery.error ||
    workspaceQuery.error ||
    latestTemplateQuery.error ||
    templateQuery.error ||
    checkinQuery.error ||
    answersQuery.error ||
    photosQuery.error;

  return (
    <div className="space-y-6 pb-16 md:pb-0">
      {toastMessage ? (
        <div className="fixed right-6 top-6 z-50 w-[260px]">
          <Alert className={toastVariant === "error" ? "border-danger/30" : "border-emerald-200"}>
            <AlertTitle>{toastVariant === "error" ? "Error" : "Success"}</AlertTitle>
            <AlertDescription>{toastMessage}</AlertDescription>
          </Alert>
        </div>
      ) : null}

      <DashboardCard title="Weekly check-in" subtitle="Stay aligned with your coach each week.">
          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-6 w-40" />
              <Skeleton className="h-4 w-64" />
            </div>
          ) : clientQuery.data ? (
            <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
              <StatusPill status={statusKey} statusMap={statusMap} />
              <span>Due Saturday</span>
              <span className="text-muted-foreground">|</span>
              <span>Week ending: {weekEndingLabel}</span>
            </div>
          ) : (
            <EmptyState title="No client profile found" description="Please finish onboarding first." />
          )}
      </DashboardCard>

      {missingTemplate ? (
        <EmptyState
          title="Your coach hasn’t assigned a check-in yet."
          description="Check back soon once your coach adds one."
        />
      ) : null}

      {pageError ? (
        <Alert className="border-destructive/30">
          <AlertTitle>Unable to load check-in data</AlertTitle>
          <AlertDescription>
            Please refresh the page or try again shortly.
          </AlertDescription>
        </Alert>
      ) : null}

      {isSubmitted ? (
        <div className="rounded-lg border border-emerald-200/40 bg-emerald-500/10 p-4 text-sm text-emerald-200">
          Your check-in for the week ending {weekEndingLabel} is submitted and locked.
        </div>
      ) : null}

      {isSubmitted && checkinQuery.data?.pt_feedback ? (
        <DashboardCard title="Coach feedback" subtitle="Your coach reviewed this check-in.">
          <p className="text-sm text-foreground">{checkinQuery.data.pt_feedback}</p>
        </DashboardCard>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-3">
        {steps.map((label, index) => (
          <button
            key={label}
            type="button"
            onClick={() => canProceed && setStep(index)}
            className={cn(
              "rounded-xl border border-border px-4 py-3 text-left text-sm transition",
              step === index
                ? "border-accent/50 bg-accent/10 text-foreground"
                : "bg-card/80 text-muted-foreground hover:border-border/80"
            )}
          >
            <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
              Step {index + 1}
            </div>
            <div className="mt-1 font-semibold text-foreground">{label}</div>
          </button>
        ))}
      </div>

      {step === 0 ? (
        <DashboardCard
          title="Weekly questions"
          subtitle="Share key updates from this week."
        >
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, index) => (
                <Skeleton key={index} className="h-12 w-full" />
              ))}
            </div>
          ) : missingTemplate ? (
            <EmptyState
              title="Your coach hasn’t assigned a check-in yet."
              description="Check back soon once your coach adds one."
            />
          ) : !hasTemplate ? (
            <EmptyState
              title="Your coach hasn’t assigned a check-in yet."
              description="Check back soon once your coach adds one."
            />
          ) : questions.length === 0 ? (
            <EmptyState
              title="No questions yet"
              description="Your coach will add questions to this template soon."
            />
          ) : (
            <div className="space-y-4">
              {questions.map((question) => {
                const type = normalizeQuestionType(question);
                const value = answers[question.id] ?? {};
                return (
                  <div
                    key={question.id}
                    className="rounded-xl border border-border bg-background/40 p-4"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold text-foreground">
                          {getQuestionLabel(question)}
                        </p>
                        {question.prompt ? (
                          <p className="text-xs text-muted-foreground">{question.prompt}</p>
                        ) : null}
                      </div>
                      {question.is_required ? (
                        <StatusPill status="required" statusMap={requiredStatusMap} />
                      ) : null}
                    </div>

                    <div className="mt-3">
                      {type === "number" ? (
                        <Input
                          type="number"
                          value={typeof value.number === "number" ? value.number : ""}
                          onChange={(event) =>
                            handleAnswerChange(question.id, {
                              number: event.target.value ? Number(event.target.value) : null,
                            })
                          }
                          disabled={isSubmitted}
                        />
                      ) : type === "yes_no" ? (
                        <div className="flex flex-wrap gap-2">
                          <Button
                            type="button"
                            variant={value.boolean === true ? "default" : "secondary"}
                            onClick={() => handleAnswerChange(question.id, { boolean: true })}
                            disabled={isSubmitted}
                          >
                            Yes
                          </Button>
                          <Button
                            type="button"
                            variant={value.boolean === false ? "default" : "secondary"}
                            onClick={() => handleAnswerChange(question.id, { boolean: false })}
                            disabled={isSubmitted}
                          >
                            No
                          </Button>
                        </div>
                      ) : type === "scale" ? (
                        <div className="grid grid-cols-5 gap-2 sm:grid-cols-10">
                          {Array.from({ length: (question.max ?? 10) - (question.min ?? 1) + 1 })
                            .map((_, idx) => (question.min ?? 1) + idx)
                            .map((score) => (
                              <Button
                                key={score}
                                type="button"
                                size="sm"
                                variant={value.number === score ? "default" : "secondary"}
                                onClick={() => handleAnswerChange(question.id, { number: score })}
                                disabled={isSubmitted}
                              >
                                {score}
                              </Button>
                            ))}
                        </div>
                      ) : (
                        <textarea
                          className="min-h-[90px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                          placeholder="Share details..."
                          value={value.text ?? ""}
                          onChange={(event) =>
                            handleAnswerChange(question.id, { text: event.target.value })
                          }
                          disabled={isSubmitted}
                        />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </DashboardCard>
      ) : null}

      {step === 1 ? (
        <DashboardCard
          title="Progress photos"
          subtitle="Optional but helpful for your coach."
        >
          {isLoading ? (
            <div className="grid gap-4 sm:grid-cols-2">
              {Array.from({ length: 4 }).map((_, index) => (
                <Skeleton key={index} className="h-40 w-full" />
              ))}
            </div>
          ) : !clientQuery.data ? (
            <EmptyState title="No profile found" description="Please finish onboarding first." />
          ) : missingTemplate ? (
            <EmptyState
              title="Your coach hasn’t assigned a check-in yet."
              description="Check back soon once your coach adds one."
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {photoSlots.map((slot) => {
                const state = photos[slot.type];
                return (
                  <div
                    key={slot.type}
                    className="rounded-xl border border-border bg-background/40 p-4"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-semibold text-foreground">{slot.label}</p>
                        <p className="text-xs text-muted-foreground">
                          {slot.required ? "Required" : "Optional"}
                        </p>
                      </div>
                      {state.existingUrl ? (
                        <StatusPill status="submitted" statusMap={statusMap} />
                      ) : null}
                    </div>
                    <div className="mt-3">
                      {state.previewUrl ? (
                        <img
                          src={state.previewUrl}
                          alt={`${slot.label} preview`}
                          className="h-40 w-full rounded-lg border border-border object-cover"
                        />
                      ) : (
                        <div className="flex h-40 items-center justify-center rounded-lg border border-dashed border-border bg-muted/30 text-xs text-muted-foreground">
                          No photo uploaded
                        </div>
                      )}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <label className="inline-flex items-center gap-2">
                        <Input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          disabled={isSubmitted}
                          onChange={(event) =>
                            handleFileChange(slot.type, event.target.files?.[0] ?? null)
                          }
                        />
                        <Button asChild variant="secondary" size="sm" disabled={isSubmitted}>
                          <span>{state.previewUrl ? "Replace" : "Upload"}</span>
                        </Button>
                      </label>
                      {state.previewUrl ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRemovePhoto(slot.type)}
                          disabled={isSubmitted}
                        >
                          Remove
                        </Button>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </DashboardCard>
      ) : null}

      {step === 2 ? (
        <DashboardCard title="Review & submit" subtitle="Make sure everything looks right.">
          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          ) : missingTemplate ? (
            <EmptyState
              title="Your coach hasn’t assigned a check-in yet."
              description="Check back soon once your coach adds one."
            />
          ) : (
            <div className="space-y-6">
              <div className="space-y-3">
                <p className="text-sm font-semibold text-foreground">Responses</p>
                {questions.length === 0 ? (
                  <EmptyState
                    title="No questions to review"
                    description="Your coach has not added questions yet."
                  />
                ) : (
                  questions.map((question) => {
                    const value = answers[question.id] ?? {};
                    const display =
                      typeof value.number === "number"
                        ? value.number
                        : typeof value.boolean === "boolean"
                        ? value.boolean
                          ? "Yes"
                          : "No"
                        : value.text && value.text.trim().length > 0
                        ? value.text
                        : "--";
                    return (
                      <div
                        key={question.id}
                        className="rounded-lg border border-border bg-muted/20 px-3 py-2 text-sm"
                      >
                        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                          {getQuestionLabel(question)}
                        </p>
                        <p className="mt-1 text-foreground">{display}</p>
                      </div>
                    );
                  })
                )}
              </div>

              <div className="space-y-3">
                <p className="text-sm font-semibold text-foreground">Photos</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  {photoSlots.map((slot) => {
                    const state = photos[slot.type];
                    return (
                      <div
                        key={slot.type}
                        className="rounded-lg border border-border bg-muted/20 p-3 text-sm"
                      >
                        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                          {slot.label}
                        </p>
                        {state.previewUrl ? (
                          <img
                            src={state.previewUrl}
                            alt={`${slot.label} preview`}
                            className="mt-2 h-32 w-full rounded-md border border-border object-cover"
                          />
                        ) : (
                          <p className="mt-2 text-xs text-muted-foreground">No photo</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </DashboardCard>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button
          variant="secondary"
          onClick={() => setStep((prev) => Math.max(0, prev - 1))}
          disabled={step === 0}
        >
          Back
        </Button>
        <div className="flex flex-wrap items-center gap-2">
          {step < steps.length - 1 ? (
            <Button
              onClick={() => setStep((prev) => Math.min(steps.length - 1, prev + 1))}
              disabled={!canProceed}
            >
              Continue
            </Button>
          ) : (
            <Button
              onClick={handleSubmit}
              disabled={!canProceed || isSubmitted || submitting}
            >
              {submitting ? "Submitting..." : "Submit check-in"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

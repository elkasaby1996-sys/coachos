import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "../../components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "../../components/ui/tabs";
import { Badge } from "../../components/ui/badge";
import { Skeleton } from "../../components/ui/skeleton";
import { supabase } from "../../lib/supabase";
import { useWorkspace } from "../../lib/use-workspace";

type ProgramTemplateRow = {
  id: string;
  name: string | null;
  description: string | null;
  weeks_count: number | null;
  is_active: boolean | null;
};

type ProgramTemplateDayRow = {
  id: string;
  week_number: number | null;
  day_of_week: number | null;
  workout_template_id: string | null;
  is_rest: boolean | null;
  notes: string | null;
};

type WorkoutTemplateRow = {
  id: string;
  name: string | null;
};

type ProgramDayState = {
  workout_template_id: string | null;
  is_rest: boolean;
  notes: string;
};

const dayLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const getErrorDetails = (error: unknown) => {
  if (!error) return { code: "unknown", message: "Unknown error" };
  if (typeof error === "object") {
    const err = error as { code?: string | null; message?: string | null };
    return {
      code: err.code ?? "unknown",
      message: err.message ?? "Unknown error",
    };
  }
  return { code: "unknown", message: "Unknown error" };
};

const isUuid = (value: string | undefined | null) =>
  Boolean(
    value &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    ),
  );

const getDayKey = (week: number, day: number) => `week-${week}-day-${day}`;

const buildDaysMap = (
  weeksCount: number,
  rows: ProgramTemplateDayRow[],
): Record<string, ProgramDayState> => {
  const map: Record<string, ProgramDayState> = {};
  for (let week = 1; week <= weeksCount; week += 1) {
    for (let day = 1; day <= 7; day += 1) {
      const row = rows.find(
        (item) => item.week_number === week && item.day_of_week === day,
      );
      map[getDayKey(week, day)] = {
        workout_template_id: row?.workout_template_id ?? null,
        is_rest: row?.is_rest ?? false,
        notes: row?.notes ?? "",
      };
    }
  }
  return map;
};

export function PtProgramBuilderPage() {
  const { id } = useParams();
  const templateId = isUuid(id) ? id : null;
  const isNew = !id;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { workspaceId } = useWorkspace();

  const [form, setForm] = useState({
    name: "",
    description: "",
    weeksCount: 4,
  });
  const [activeWeek, setActiveWeek] = useState("week-1");
  const [daysMap, setDaysMap] = useState<Record<string, ProgramDayState>>(
    buildDaysMap(4, []),
  );
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving">("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [draggingTemplateId, setDraggingTemplateId] = useState<string | null>(
    null,
  );
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(
    null,
  );

  const templateQuery = useQuery({
    queryKey: ["program-template", templateId],
    enabled: !!templateId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("program_templates")
        .select("id, name, description, weeks_count, is_active")
        .eq("id", templateId ?? "")
        .maybeSingle();
      if (error) throw error;
      return data as ProgramTemplateRow | null;
    },
  });

  const templateDaysQuery = useQuery({
    queryKey: ["program-template-days", templateId],
    enabled: !!templateId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("program_template_days")
        .select(
          "id, week_number, day_of_week, workout_template_id, is_rest, notes",
        )
        .eq("program_template_id", templateId ?? "");
      if (error) throw error;
      return (data ?? []) as ProgramTemplateDayRow[];
    },
  });

  const workoutTemplatesQuery = useQuery({
    queryKey: ["workout-templates", workspaceId],
    enabled: !!workspaceId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workout_templates")
        .select("id, name")
        .eq("workspace_id", workspaceId ?? "")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as WorkoutTemplateRow[];
    },
  });

  useEffect(() => {
    if (!templateQuery.data || !templateDaysQuery.data) return;
    const template = templateQuery.data;
    const weeksCount = template.weeks_count ?? 4;
    setForm({
      name: template.name ?? "",
      description: template.description ?? "",
      weeksCount,
    });
    setDaysMap(buildDaysMap(weeksCount, templateDaysQuery.data));
    setActiveWeek("week-1");
  }, [templateQuery.data, templateDaysQuery.data]);

  useEffect(() => {
    if (form.weeksCount < 1) return;
    setDaysMap((prev) => {
      const next = { ...prev };
      for (let week = 1; week <= form.weeksCount; week += 1) {
        for (let day = 1; day <= 7; day += 1) {
          const key = getDayKey(week, day);
          if (!next[key]) {
            next[key] = {
              workout_template_id: null,
              is_rest: false,
              notes: "",
            };
          }
        }
      }
      Object.keys(next).forEach((key) => {
        const match = key.match(/week-(\d+)-day-(\d+)/);
        if (!match) return;
        const week = Number(match[1]);
        if (week > form.weeksCount) {
          delete next[key];
        }
      });
      return next;
    });
  }, [form.weeksCount]);

  const workoutTemplates = workoutTemplatesQuery.data ?? [];
  const weekOptions = useMemo(
    () =>
      Array.from(
        { length: Math.max(form.weeksCount, 1) },
        (_, index) => index + 1,
      ),
    [form.weeksCount],
  );

  const updateDay = (
    week: number,
    day: number,
    payload: Partial<ProgramDayState>,
  ) => {
    const key = getDayKey(week, day);
    setDaysMap((prev) => ({
      ...prev,
      [key]: {
        ...prev[key],
        ...payload,
      },
    }));
  };

  const handleDropTemplate = (
    week: number,
    day: number,
    templateId: string,
  ) => {
    if (!templateId) return;
    updateDay(week, day, { workout_template_id: templateId, is_rest: false });
  };

  const handleSave = async () => {
    if (!workspaceId) return;
    if (!form.name.trim()) {
      setSaveError("Program name is required.");
      return;
    }
    if (form.weeksCount < 1) {
      setSaveError("Weeks count must be at least 1.");
      return;
    }
    setSaveStatus("saving");
    setSaveError(null);

    let programId = templateId;
    if (isNew) {
      const { data, error } = await supabase
        .from("program_templates")
        .insert({
          workspace_id: workspaceId,
          name: form.name.trim(),
          description: form.description.trim() || null,
          weeks_count: form.weeksCount,
          is_active: true,
        })
        .select("id")
        .maybeSingle();
      if (error || !data?.id) {
        const details = getErrorDetails(error);
        setSaveError(`${details.code}: ${details.message}`);
        setSaveStatus("idle");
        return;
      }
      programId = data.id;
    } else if (templateId) {
      const { error } = await supabase
        .from("program_templates")
        .update({
          name: form.name.trim(),
          description: form.description.trim() || null,
          weeks_count: form.weeksCount,
          updated_at: new Date().toISOString(),
        })
        .eq("id", templateId);
      if (error) {
        const details = getErrorDetails(error);
        setSaveError(`${details.code}: ${details.message}`);
        setSaveStatus("idle");
        return;
      }
    }

    if (!programId) {
      setSaveError("Unable to save program.");
      setSaveStatus("idle");
      return;
    }

    const { error: deleteError } = await supabase
      .from("program_template_days")
      .delete()
      .eq("program_template_id", programId);
    if (deleteError) {
      const details = getErrorDetails(deleteError);
      setSaveError(`${details.code}: ${details.message}`);
      setSaveStatus("idle");
      return;
    }

    const payload = weekOptions.flatMap((week) => {
      return dayLabels.map((_, idx) => {
        const day = idx + 1;
        const state = daysMap[getDayKey(week, day)];
        if (!state || (!state.is_rest && !state.workout_template_id))
          return null;
        return {
          program_template_id: programId,
          week_number: week,
          day_of_week: day,
          workout_template_id: state.workout_template_id,
          is_rest: state.is_rest,
          notes: state.notes.trim() || null,
          sort_order: 0,
        };
      });
    });

    const filteredPayload = payload.filter(Boolean) as Array<
      Record<string, unknown>
    >;
    if (filteredPayload.length > 0) {
      const { error: insertError } = await supabase
        .from("program_template_days")
        .insert(filteredPayload);
      if (insertError) {
        const details = getErrorDetails(insertError);
        setSaveError(`${details.code}: ${details.message}`);
        setSaveStatus("idle");
        return;
      }
    }

    await queryClient.invalidateQueries({
      queryKey: ["program-templates", workspaceId],
    });
    if (isNew) {
      navigate(`/pt/programs/${programId}/edit`);
    }
    setSaveStatus("idle");
  };

  if (id && !templateId && !isNew) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Invalid program link</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>Program id: {id ?? "missing"}</p>
          <Button variant="secondary" onClick={() => navigate("/pt/programs")}>
            Back to programs
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (
    !isNew &&
    !templateQuery.isLoading &&
    !templateQuery.error &&
    !templateQuery.data
  ) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Program not found</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>This program could not be loaded.</p>
          <Button variant="secondary" onClick={() => navigate("/pt/programs")}>
            Back to programs
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">
            {isNew ? "New Program" : "Program Builder"}
          </h2>
          <p className="text-sm text-muted-foreground">
            Configure weekly structure and day-by-day assignments.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" onClick={() => navigate("/pt/programs")}>
            Back to programs
          </Button>
          <Button disabled={saveStatus === "saving"} onClick={handleSave}>
            {saveStatus === "saving" ? "Saving..." : "Save Program"}
          </Button>
        </div>
      </div>

      {(templateQuery.isLoading && !isNew) || templateDaysQuery.isLoading ? (
        <Card className="border-border/70 bg-card/80">
          <CardHeader>
            <CardTitle>Program details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </CardContent>
        </Card>
      ) : templateQuery.error ? (
        <Card className="border-destructive/40">
          <CardHeader>
            <CardTitle>Program error</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {getErrorDetails(templateQuery.error).code}:{" "}
            {getErrorDetails(templateQuery.error).message}
          </CardContent>
        </Card>
      ) : (
        <Card className="border-border/70 bg-card/80">
          <CardHeader>
            <CardTitle>Program meta</CardTitle>
            <p className="text-sm text-muted-foreground">
              Describe the program and set its length.
            </p>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2 md:col-span-2">
              <label className="text-xs font-semibold text-muted-foreground">
                Name
              </label>
              <Input
                value={form.name}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, name: event.target.value }))
                }
                placeholder="e.g., 8-Week Strength Block"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-semibold text-muted-foreground">
                Weeks
              </label>
              <Input
                type="number"
                min={1}
                value={form.weeksCount}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    weeksCount: Math.max(1, Number(event.target.value) || 1),
                  }))
                }
              />
            </div>
            <div className="space-y-2 md:col-span-3">
              <label className="text-xs font-semibold text-muted-foreground">
                Description
              </label>
              <textarea
                className="min-h-[96px] w-full rounded-lg border border-border/70 bg-secondary/40 px-3 py-2 text-sm text-foreground shadow-[inset_0_1px_0_oklch(1_0_0/0.03)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={form.description}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    description: event.target.value,
                  }))
                }
              />
            </div>
            {saveError ? (
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive md:col-span-3">
                {saveError}
              </div>
            ) : null}
          </CardContent>
        </Card>
      )}

      <Card className="border-border/70 bg-card/80">
        <CardHeader>
          <CardTitle>Weekly layout</CardTitle>
          <p className="text-sm text-muted-foreground">
            Assign workouts or mark rest days for each week.
          </p>
        </CardHeader>
        <CardContent>
          <div className="mb-4">
            <div className="text-xs font-semibold uppercase text-muted-foreground">
              Workout templates
            </div>
            <div className="mt-3 flex w-full gap-3 overflow-x-auto pb-2">
              {workoutTemplatesQuery.isLoading ? (
                Array.from({ length: 6 }).map((_, index) => (
                  <div
                    key={index}
                    className="h-20 w-40 shrink-0 rounded-xl border border-border/60 bg-muted/40"
                  />
                ))
              ) : workoutTemplates.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                  No workout templates yet.
                </div>
              ) : (
                workoutTemplates.map((template) => {
                  const isDragging = draggingTemplateId === template.id;
                  const isSelected = selectedTemplateId === template.id;
                  return (
                    <div
                      key={template.id}
                      draggable
                      onDragStart={(event) => {
                        event.dataTransfer.setData("text/plain", template.id);
                        event.dataTransfer.effectAllowed = "copy";
                        setDraggingTemplateId(template.id);
                        const target = event.currentTarget as HTMLElement;
                        const ghost = target.cloneNode(true) as HTMLElement;
                        ghost.style.position = "fixed";
                        ghost.style.top = "-9999px";
                        ghost.style.left = "-9999px";
                        ghost.style.transform = "scale(1.03)";
                        ghost.style.boxShadow =
                          "0 0 24px rgba(56,189,248,0.45)";
                        ghost.style.borderColor = "rgba(56,189,248,0.65)";
                        ghost.style.background = "rgba(30,41,59,0.85)";
                        document.body.appendChild(ghost);
                        event.dataTransfer.setDragImage(
                          ghost,
                          ghost.offsetWidth / 2,
                          ghost.offsetHeight / 2,
                        );
                        window.requestAnimationFrame(() => {
                          ghost.remove();
                        });
                      }}
                      onDragEnd={() => setDraggingTemplateId(null)}
                      onClick={() =>
                        setSelectedTemplateId((prev) =>
                          prev === template.id ? null : template.id,
                        )
                      }
                      className={`shrink-0 rounded-xl border px-4 py-3 text-sm font-semibold text-foreground shadow-sm transition ${
                        isDragging
                          ? "scale-[0.98] border-accent/60 bg-accent/20 shadow-[0_0_20px_rgba(56,189,248,0.35)]"
                          : isSelected
                            ? "border-accent/60 bg-accent/10"
                            : "border-border/60 bg-background/50 hover:border-border"
                      }`}
                    >
                      {template.name ?? "Workout template"}
                    </div>
                  );
                })
              )}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Drag a template onto a day or click a template then click a day.
            </p>
            {selectedTemplateId ? (
              <div className="mt-2 text-xs text-muted-foreground">
                Selected:{" "}
                <span className="font-semibold text-foreground">
                  {workoutTemplates.find((t) => t.id === selectedTemplateId)
                    ?.name ?? "Workout template"}
                </span>
              </div>
            ) : null}
          </div>
          <Tabs value={activeWeek} onValueChange={setActiveWeek}>
            <TabsList className="flex w-full flex-wrap justify-start gap-2 bg-transparent p-0">
              {weekOptions.map((week) => (
                <TabsTrigger
                  key={week}
                  value={`week-${week}`}
                  className="border border-border/70 bg-muted/50"
                >
                  Week {week}
                </TabsTrigger>
              ))}
            </TabsList>

            {weekOptions.map((week) => (
              <TabsContent key={week} value={`week-${week}`} className="mt-4">
                <div className="grid gap-3 md:grid-cols-7">
                  {dayLabels.map((dayLabel, index) => {
                    const day = index + 1;
                    const state = daysMap[getDayKey(week, day)];
                    const selectedTemplate = workoutTemplates.find(
                      (template) => template.id === state?.workout_template_id,
                    );
                    return (
                      <div
                        key={`${week}-${day}`}
                        onDragOver={(event) => {
                          event.preventDefault();
                        }}
                        onDrop={(event) => {
                          event.preventDefault();
                          const templateId =
                            event.dataTransfer.getData("text/plain");
                          handleDropTemplate(week, day, templateId);
                        }}
                        onClick={() => {
                          if (selectedTemplateId) {
                            handleDropTemplate(week, day, selectedTemplateId);
                          }
                        }}
                        className={`flex h-full flex-col justify-between rounded-xl border border-border/70 bg-background/40 p-3 transition ${
                          draggingTemplateId
                            ? "border-accent/60 bg-accent/10"
                            : "hover:border-border"
                        }`}
                      >
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <p className="text-xs font-semibold uppercase text-muted-foreground">
                              {dayLabel}
                            </p>
                            {state?.is_rest ? (
                              <Badge
                                variant="muted"
                                className="text-[10px] uppercase"
                              >
                                Rest day
                              </Badge>
                            ) : null}
                          </div>
                          <div className="space-y-2">
                            <div className="rounded-md border border-dashed border-border/70 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                              {state?.workout_template_id
                                ? (selectedTemplate?.name ?? "Workout assigned")
                                : "Drop a template here"}
                            </div>
                            <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
                              <input
                                type="checkbox"
                                checked={state?.is_rest ?? false}
                                onChange={(event) =>
                                  updateDay(week, day, {
                                    is_rest: event.target.checked,
                                    workout_template_id: event.target.checked
                                      ? null
                                      : (state?.workout_template_id ?? null),
                                  })
                                }
                              />
                              Rest day
                            </label>
                            <textarea
                              className="min-h-[60px] w-full rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground"
                              placeholder="Notes"
                              value={state?.notes ?? ""}
                              onChange={(event) =>
                                updateDay(week, day, {
                                  notes: event.target.value,
                                })
                              }
                            />
                          </div>
                        </div>
                        <div className="mt-3 text-[11px] text-muted-foreground">
                          {state?.is_rest
                            ? "Recovery focus"
                            : (selectedTemplate?.name ?? "No workout selected")}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </TabsContent>
            ))}
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}

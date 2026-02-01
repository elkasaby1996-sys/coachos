import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";
import { Input } from "../../components/ui/input";
import { Skeleton } from "../../components/ui/skeleton";
import { supabase } from "../../lib/supabase";
import { useWorkspace } from "../../lib/use-workspace";

type TemplateRow = {
  id: string;
  name: string | null;
  description: string | null;
  workout_type: string | null;
  workout_type_tag: string | null;
  created_at: string | null;
};

const formatWorkoutTypeTag = (value: string | null | undefined) =>
  value && value.trim().length > 0 ? value : "Workout";

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

const calendarWeek = [
  {
    day: "Mon",
    workouts: ["Upper Power - Avery", "Run Tempo - Jordan"],
  },
  {
    day: "Tue",
    workouts: ["AMRAP 16 - Morgan"],
  },
  {
    day: "Wed",
    workouts: ["Lower Hypertrophy - Samira"],
  },
  {
    day: "Thu",
    workouts: ["Mobility Reset - Elena"],
  },
  {
    day: "Fri",
    workouts: ["Upper Power - Avery"],
  },
  {
    day: "Sat",
    workouts: [],
  },
  {
    day: "Sun",
    workouts: [],
  },
];

export function PtWorkoutTemplatesPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { workspaceId, loading: workspaceLoading, error: workspaceError } = useWorkspace();
  const [createOpen, setCreateOpen] = useState(false);
  const [createStatus, setCreateStatus] = useState<"idle" | "saving">("idle");
  const [createError, setCreateError] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    workout_type_tag: "",
    description: "",
  });

  const templatesQuery = useQuery({
    queryKey: ["workout-templates", workspaceId],
    enabled: !!workspaceId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workout_templates")
        .select("id, name, description, workout_type, workout_type_tag, created_at")
        .eq("workspace_id", workspaceId ?? "")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as TemplateRow[];
    },
  });

  const handleCreate = async () => {
    if (!workspaceId) return;
    if (!form.name.trim()) {
      setCreateError("Template name is required.");
      return;
    }
    setCreateStatus("saving");
    setCreateError(null);

    const { data, error } = await supabase
      .from("workout_templates")
      .insert({
        workspace_id: workspaceId,
        name: form.name.trim(),
        workout_type: "bodybuilding",
        workout_type_tag: form.workout_type_tag.trim() || null,
        description: form.description.trim() || null,
      })
      .select("id")
      .maybeSingle();

    if (error) {
      const details = getErrorDetails(error);
      setCreateError(`${details.code}: ${details.message}`);
      setCreateStatus("idle");
      return;
    }

    setCreateStatus("idle");
    setCreateOpen(false);
    setForm({ name: "", workout_type_tag: "", description: "" });
    await queryClient.invalidateQueries({ queryKey: ["workout-templates", workspaceId] });
    if (data?.id) {
      navigate(`/pt/templates/workouts/${data.id}`);
    }
  };

  const templates = templatesQuery.data ?? [];
  const sharedTemplates: string[] = [];
  const formattedTemplates = useMemo(
    () =>
      templates.map((template) => ({
        ...template,
        updated: template.created_at
          ? new Date(template.created_at).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
            })
          : "Recently",
        workoutTypeLabel: formatWorkoutTypeTag(template.workout_type_tag),
      })),
    [templates]
  );

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Workout templates</h2>
          <p className="text-sm text-muted-foreground">
            Build reusable sessions and assign them fast.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>Create template</Button>
      </div>

      <Tabs defaultValue="templates">
        <TabsList className="flex w-full flex-wrap justify-start gap-2 bg-transparent p-0">
          <TabsTrigger value="templates" className="border border-border bg-muted/50">
            Templates
          </TabsTrigger>
          <TabsTrigger value="calendar" className="border border-border bg-muted/50">
            Calendar
          </TabsTrigger>
        </TabsList>

        <TabsContent value="templates">
          <Card>
            <CardHeader className="flex flex-row items-start justify-between gap-4">
              <div>
                <CardTitle>Saved templates</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Keep your core sessions in one premium library.
                </p>
              </div>
              <Button variant="secondary" size="sm">
                New folder
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              {workspaceLoading || templatesQuery.isLoading ? (
                <div className="space-y-3">
                  {Array.from({ length: 3 }).map((_, index) => (
                    <Skeleton key={index} className="h-20 w-full" />
                  ))}
                </div>
              ) : workspaceError ? (
                <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">
                  {getErrorDetails(workspaceError).code}: {getErrorDetails(workspaceError).message}
                </div>
              ) : templatesQuery.error ? (
                <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">
                  {getErrorDetails(templatesQuery.error).code}: {getErrorDetails(templatesQuery.error).message}
                </div>
              ) : formattedTemplates.length > 0 ? (
                formattedTemplates.map((template) => (
                  <div
                    key={template.id}
                    className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border bg-background p-4 transition hover:-translate-y-0.5 hover:shadow-lg"
                  >
                    <div>
                      <p className="text-sm font-semibold">{template.name ?? "Workout template"}</p>
                      <p className="text-xs text-muted-foreground">
                        {template.description ?? "No description"}
                      </p>
                      <p className="text-xs text-muted-foreground">Last edited {template.updated}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="muted">{template.workoutTypeLabel}</Badge>
                      <Button asChild size="sm" variant="secondary">
                        <Link to={`/pt/templates/workouts/${template.id}`}>Edit</Link>
                      </Button>
                      <Button size="sm">Assign</Button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-xl border border-dashed border-border bg-muted/40 p-8 text-center">
                  <p className="text-sm font-semibold">No templates yet.</p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Create your first template to speed up programming.
                  </p>
                  <Button className="mt-4" size="sm" onClick={() => setCreateOpen(true)}>
                    Create template
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
          <Card className="mt-6">
            <CardHeader>
              <CardTitle>Shared template packs</CardTitle>
              <p className="text-sm text-muted-foreground">
                Import curated templates or build your own pack.
              </p>
            </CardHeader>
            <CardContent>
              {sharedTemplates.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border bg-muted/40 p-8 text-center">
                  <p className="text-sm font-semibold">No shared templates yet.</p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Create a new pack to streamline programming.
                  </p>
                  <Button className="mt-4" size="sm">
                    Create pack
                  </Button>
                </div>
              ) : (
                <div>Template packs</div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="calendar">
          <Card>
            <CardHeader className="flex flex-row items-start justify-between gap-4">
              <div>
                <CardTitle>Weekly calendar</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Visualize assigned workouts across the week.
                </p>
              </div>
              <Button variant="secondary" size="sm">
                Sync calendar
              </Button>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 md:grid-cols-7">
                {calendarWeek.map((day) => (
                  <div
                    key={day.day}
                    className="rounded-xl border border-border bg-background p-3 transition hover:-translate-y-0.5 hover:shadow-lg"
                  >
                    <p className="text-xs font-semibold uppercase text-muted-foreground">{day.day}</p>
                    <div className="mt-2 space-y-2">
                      {day.workouts.length > 0 ? (
                        day.workouts.map((workout) => (
                          <div key={workout} className="rounded-lg border border-border bg-muted/60 px-2 py-1 text-xs">
                            {workout}
                          </div>
                        ))
                      ) : (
                        <div className="rounded-lg border border-dashed border-border p-2 text-center text-xs text-muted-foreground">
                          No assignments
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog
        open={createOpen}
        onOpenChange={(open) => {
          setCreateOpen(open);
          if (!open) {
            setCreateError(null);
            setCreateStatus("idle");
          }
        }}
      >
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>Create template</DialogTitle>
            <DialogDescription>Start a new workout template for your workspace.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <label className="text-xs font-semibold text-muted-foreground">Name</label>
              <Input
                value={form.name}
                onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                placeholder="e.g., Upper Power"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-semibold text-muted-foreground">Workout type</label>
              <Input
                value={form.workout_type_tag}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, workout_type_tag: event.target.value }))
                }
                placeholder="Hypertrophy, Strength, Powerbuilding..."
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-semibold text-muted-foreground">Description</label>
              <textarea
                className="min-h-[96px] w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={form.description}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, description: event.target.value }))
                }
              />
            </div>
            {createError ? (
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive">
                {createError}
              </div>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button disabled={createStatus === "saving"} onClick={handleCreate}>
              {createStatus === "saving" ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
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
import { DashboardCard } from "../../components/pt/dashboard/DashboardCard";

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
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const { workspaceId, loading: workspaceLoading, error: workspaceError } = useWorkspace();
  const [createOpen, setCreateOpen] = useState(false);
  const [createStatus, setCreateStatus] = useState<"idle" | "saving">("idle");
  const [createError, setCreateError] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteStatus, setDeleteStatus] = useState<"idle" | "deleting">("idle");
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TemplateRow | null>(null);
  const [form, setForm] = useState({
    name: "",
    workout_type_tag: "",
    description: "",
  });
  const [searchQuery, setSearchQuery] = useState(searchParams.get("q") ?? "");
  const [typeFilter, setTypeFilter] = useState(searchParams.get("type") ?? "all");
  const [sortBy, setSortBy] = useState(searchParams.get("sort") ?? "newest");

  useEffect(() => {
    const nextQuery = searchParams.get("q") ?? "";
    const nextType = searchParams.get("type") ?? "all";
    const nextSort = searchParams.get("sort") ?? "newest";

    if (nextQuery !== searchQuery) setSearchQuery(nextQuery);
    if (nextType !== typeFilter) setTypeFilter(nextType);
    if (nextSort !== sortBy) setSortBy(nextSort);
  }, [searchParams, searchQuery, typeFilter, sortBy]);

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

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleteStatus("deleting");
    setDeleteError(null);

    const { error } = await supabase.from("workout_templates").delete().eq("id", deleteTarget.id);
    if (error) {
      const details = getErrorDetails(error);
      setDeleteError(`${details.code}: ${details.message}`);
      setDeleteStatus("idle");
      return;
    }

    setDeleteStatus("idle");
    setDeleteOpen(false);
    setDeleteTarget(null);
    await queryClient.invalidateQueries({ queryKey: ["workout-templates", workspaceId] });
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
  const workoutTypeOptions = useMemo(() => {
    const seen = new Map<string, string>();
    templates.forEach((template) => {
      const value = template.workout_type_tag?.trim() || template.workout_type?.trim();
      if (!value) return;
      const key = value.toLowerCase();
      if (!seen.has(key)) {
        seen.set(key, value);
      }
    });
    return Array.from(seen.values()).sort((a, b) => a.localeCompare(b));
  }, [templates]);

  const updateParams = (next: { q?: string; type?: string; sort?: string }) => {
    const params = new URLSearchParams(searchParams);
    const q = next.q ?? searchQuery;
    const type = next.type ?? typeFilter;
    const sort = next.sort ?? sortBy;

    if (q.trim()) {
      params.set("q", q.trim());
    } else {
      params.delete("q");
    }

    if (type && type !== "all") {
      params.set("type", type);
    } else {
      params.delete("type");
    }

    if (sort && sort !== "newest") {
      params.set("sort", sort);
    } else {
      params.delete("sort");
    }

    setSearchParams(params, { replace: true });
  };

  const filteredTemplates = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const typeKey = typeFilter.toLowerCase();
    const matches = formattedTemplates.filter((template) => {
      const typeValue =
        template.workout_type_tag?.trim() || template.workout_type?.trim() || "";
      if (typeFilter !== "all" && typeValue.toLowerCase() !== typeKey) return false;
      if (!query) return true;
      const name = template.name?.toLowerCase() ?? "";
      const desc = template.description?.toLowerCase() ?? "";
      const type = typeValue.toLowerCase();
      return name.includes(query) || desc.includes(query) || type.includes(query);
    });

    if (sortBy === "name") {
      return matches.sort((a, b) =>
        (a.name ?? "").localeCompare(b.name ?? "", undefined, { sensitivity: "base" })
      );
    }

    return matches.sort((a, b) => {
      const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
      const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
      return bTime - aTime;
    });
  }, [formattedTemplates, searchQuery, typeFilter, sortBy]);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-[0.3em] text-muted-foreground">CoachOS Pro</div>
          <h2 className="text-2xl font-semibold tracking-tight">Templates Library</h2>
          <p className="text-sm text-muted-foreground">
            Manage your workout templates, programs, and exercise library.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>Create template</Button>
      </div>

      <Tabs defaultValue="templates">
        <TabsList className="flex w-full flex-wrap justify-start gap-2 bg-transparent p-0">
          <TabsTrigger value="templates" className="border border-border/70 bg-muted/50">
            Workouts
          </TabsTrigger>
          <TabsTrigger value="calendar" className="border border-border/70 bg-muted/50">
            Calendar
          </TabsTrigger>
        </TabsList>

        <TabsContent value="templates">
          <Card className="border-border/70 bg-card/80">
            <CardHeader className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-2 text-xs uppercase tracking-[0.2em] text-muted-foreground">
                <Badge variant="secondary" className="text-[10px]">Workouts</Badge>
                <Badge variant="muted" className="text-[10px]">Programs</Badge>
                <Badge variant="muted" className="text-[10px]">Exercises</Badge>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative w-full sm:w-56">
                  <Input
                    placeholder="Search templates..."
                    className="h-9 rounded-full bg-secondary/40 pl-10"
                    value={searchQuery}
                    onChange={(event) => {
                      const next = event.target.value;
                      setSearchQuery(next);
                      updateParams({ q: next });
                    }}
                  />
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                    ⌕
                  </span>
                </div>
                <select
                  className="h-9 rounded-full border border-border/70 bg-secondary/40 px-3 text-xs"
                  value={typeFilter}
                  onChange={(event) => {
                    const next = event.target.value;
                    setTypeFilter(next);
                    updateParams({ type: next });
                  }}
                >
                  <option value="all">All workout types</option>
                  {workoutTypeOptions.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
                <select
                  className="h-9 rounded-full border border-border/70 bg-secondary/40 px-3 text-xs"
                  value={sortBy}
                  onChange={(event) => {
                    const next = event.target.value;
                    setSortBy(next);
                    updateParams({ sort: next });
                  }}
                >
                  <option value="newest">Sort by newest</option>
                  <option value="name">Sort by name</option>
                </select>
              </div>
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
              ) : filteredTemplates.length > 0 ? (
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {filteredTemplates.map((template, index) => (
                    <DashboardCard
                      key={template.id}
                      title={template.name ?? "Workout template"}
                      subtitle={template.workoutTypeLabel}
                      className="h-full border-border/70 bg-background/40"
                      action={
                        <Button asChild size="sm" variant="secondary">
                          <Link to={`/pt/templates/workouts/${template.id}/edit`}>Edit</Link>
                        </Button>
                      }
                    >
                      <div className="space-y-3">
                        <div className="flex items-start justify-between">
                          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-secondary/70 text-xs font-semibold text-foreground">
                            {template.name?.trim()?.[0]?.toUpperCase() ?? "W"}
                          </div>
                          <span className="text-xs text-warning">★</span>
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">
                            {template.description ?? "No description"}
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="muted" className="text-[10px] uppercase">
                            {template.workoutTypeLabel}
                          </Badge>
                          <Badge variant="secondary" className="text-[10px]">
                            {index + 4} exercises
                          </Badge>
                        </div>
                        <div className="flex items-center justify-between border-t border-border/70 pt-3 text-xs text-muted-foreground">
                          <span>Used {index + 8} times</span>
                          <span>{template.updated}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button size="sm" variant="ghost" className="flex-1">
                            Assign
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="flex-1"
                            onClick={() => {
                              setDeleteTarget(template);
                              setDeleteError(null);
                              setDeleteOpen(true);
                            }}
                          >
                            Delete
                          </Button>
                        </div>
                      </div>
                    </DashboardCard>
                  ))}
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-border bg-muted/40 p-8 text-center">
                  <p className="text-sm font-semibold">No templates found.</p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Try adjusting filters or create a new template.
                  </p>
                  <Button className="mt-4" size="sm" onClick={() => setCreateOpen(true)}>
                    Create template
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
          <Card className="mt-6 border-border/70 bg-card/80">
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
          <Card className="border-border/70 bg-card/80">
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
                    className="rounded-xl border border-border/70 bg-background/40 p-3 transition hover:border-border hover:bg-muted/40"
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
                className="min-h-[96px] w-full rounded-lg border border-border/70 bg-secondary/40 px-3 py-2 text-sm text-foreground shadow-[inset_0_1px_0_oklch(1_0_0/0.03)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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

      <Dialog
        open={deleteOpen}
        onOpenChange={(open) => {
          setDeleteOpen(open);
          if (!open) {
            setDeleteError(null);
            setDeleteStatus("idle");
            setDeleteTarget(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Delete template</DialogTitle>
            <DialogDescription>
              This will delete the template and all dependent workouts and exercises.
            </DialogDescription>
          </DialogHeader>
          {deleteError ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive">
              {deleteError}
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="secondary" onClick={() => setDeleteOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" disabled={deleteStatus === "deleting"} onClick={handleDelete}>
              {deleteStatus === "deleting" ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

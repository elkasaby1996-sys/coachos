import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, Trash2 } from "lucide-react";
import { Button } from "../../components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";
import { Input } from "../../components/ui/input";
import { Skeleton } from "../../components/ui/skeleton";
import { PageContainer } from "../../components/common/page-container";
import { supabase } from "../../lib/supabase";
import { useWorkspace } from "../../lib/use-workspace";
import { DashboardCard } from "../../components/pt/dashboard/DashboardCard";
import { WorkspacePageHeader } from "../../components/pt/workspace-page-header";

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

export function PtWorkoutTemplatesPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const {
    workspaceId,
    loading: workspaceLoading,
    error: workspaceError,
  } = useWorkspace();
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
  const [typeFilter, setTypeFilter] = useState(
    searchParams.get("type") ?? "all",
  );
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
        .select(
          "id, name, description, workout_type, workout_type_tag, created_at",
        )
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
    await queryClient.invalidateQueries({
      queryKey: ["workout-templates", workspaceId],
    });
    if (data?.id) {
      navigate(`/pt/templates/workouts/${data.id}`);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;

    setDeleteStatus("deleting");
    setDeleteError(null);

    const { error } = await supabase
      .from("workout_templates")
      .delete()
      .eq("id", deleteTarget.id);

    if (error) {
      const details = getErrorDetails(error);
      setDeleteError(`${details.code}: ${details.message}`);
      setDeleteStatus("idle");
      return;
    }

    setDeleteStatus("idle");
    setDeleteOpen(false);
    setDeleteTarget(null);
    await queryClient.invalidateQueries({
      queryKey: ["workout-templates", workspaceId],
    });
  };

  const templates = useMemo(
    () => templatesQuery.data ?? [],
    [templatesQuery.data],
  );

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
        badgeTags: [
          formatWorkoutTypeTag(template.workout_type_tag),
          template.workout_type?.trim() || null,
          "Template",
        ].filter((value, index, list): value is string => {
          return Boolean(value) && list.indexOf(value) === index;
        }),
      })),
    [templates],
  );

  const workoutTypeOptions = useMemo(() => {
    const seen = new Map<string, string>();
    templates.forEach((template) => {
      const value =
        template.workout_type_tag?.trim() || template.workout_type?.trim();
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

  const clearFilters = () => {
    setSearchQuery("");
    setTypeFilter("all");
    setSortBy("newest");
    setSearchParams(new URLSearchParams(), { replace: true });
  };

  const filteredTemplates = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const typeKey = typeFilter.toLowerCase();
    const matches = formattedTemplates.filter((template) => {
      const typeValue =
        template.workout_type_tag?.trim() ||
        template.workout_type?.trim() ||
        "";
      if (typeFilter !== "all" && typeValue.toLowerCase() !== typeKey) {
        return false;
      }
      if (!query) return true;
      const name = template.name?.toLowerCase() ?? "";
      const desc = template.description?.toLowerCase() ?? "";
      const type = typeValue.toLowerCase();
      return (
        name.includes(query) || desc.includes(query) || type.includes(query)
      );
    });

    if (sortBy === "name") {
      return matches.sort((a, b) =>
        (a.name ?? "").localeCompare(b.name ?? "", undefined, {
          sensitivity: "base",
        }),
      );
    }

    return matches.sort((a, b) => {
      const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
      const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
      return bTime - aTime;
    });
  }, [formattedTemplates, searchQuery, typeFilter, sortBy]);

  return (
    <PageContainer className="max-w-screen-2xl space-y-6">
      <WorkspacePageHeader
        title="Workout Templates"
        description="Manage the workout template library in the same operational layout as nutrition programs."
      />

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-72">
          <Search className="app-search-icon h-4 w-4" />
          <Input
            className="app-search-input"
            placeholder="Search templates"
            value={searchQuery}
            onChange={(event) => {
              const next = event.target.value;
              setSearchQuery(next);
              updateParams({ q: next });
            }}
          />
        </div>
        <select
          className="app-filter-control w-full sm:w-auto"
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
          className="app-filter-control w-full sm:w-auto"
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
        <Button
          onClick={() => {
            setCreateError(null);
            setCreateOpen(true);
          }}
        >
          <Plus className="mr-1 h-4 w-4" />
          New template
        </Button>
      </div>

      {workspaceError ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {getErrorDetails(workspaceError).code}:{" "}
          {getErrorDetails(workspaceError).message}
        </div>
      ) : null}

      {templatesQuery.error ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {getErrorDetails(templatesQuery.error).code}:{" "}
          {getErrorDetails(templatesQuery.error).message}
        </div>
      ) : null}

      {workspaceLoading || templatesQuery.isLoading ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-52 w-full" />
          ))}
        </div>
      ) : filteredTemplates.length === 0 ? (
        templates.length === 0 ? (
          <DashboardCard title="No workout templates">
            <div className="rounded-xl border border-dashed border-border bg-muted/40 p-8 text-center">
              <p className="text-sm font-semibold">Create the first template</p>
              <p className="mt-2 text-xs text-muted-foreground">
                Start with one workout template.
              </p>
              <Button
                className="mt-4"
                size="sm"
                onClick={() => setCreateOpen(true)}
              >
                Create template
              </Button>
            </div>
          </DashboardCard>
        ) : (
          <DashboardCard title="No templates match">
            <div className="rounded-xl border border-dashed border-border bg-muted/40 p-8 text-center">
              <p className="text-sm font-semibold">No templates match</p>
              <p className="mt-2 text-xs text-muted-foreground">
                Clear the search or try another filter.
              </p>
              <Button className="mt-4" size="sm" onClick={clearFilters}>
                Clear filters
              </Button>
            </div>
          </DashboardCard>
        )
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {filteredTemplates.map((template) => (
            <DashboardCard
              key={template.id}
              title={template.name ?? "Workout template"}
              subtitle={template.description ?? "No description"}
            >
              <div className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  {template.badgeTags.map((tag) => (
                    <span
                      key={`${template.id}-${tag}`}
                      className="rounded-full border border-border/70 bg-secondary/18 px-3 py-1 text-[11px] font-medium text-muted-foreground"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
                <div className="grid grid-cols-4 gap-2 rounded-lg border border-border/60 bg-muted/20 p-2 text-center text-xs">
                  <div>
                    <p className="text-muted-foreground">Type</p>
                    <p className="font-semibold">{template.workoutTypeLabel}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Format</p>
                    <p className="font-semibold">
                      {template.workout_type?.trim() || "--"}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Status</p>
                    <p className="font-semibold">Ready</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Updated</p>
                    <p className="font-semibold">{template.updated}</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() =>
                      navigate(`/pt/templates/workouts/${template.id}`)
                    }
                  >
                    Open builder
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setDeleteTarget(template);
                      setDeleteError(null);
                      setDeleteOpen(true);
                    }}
                  >
                    <Trash2 className="mr-1 h-3.5 w-3.5" />
                    Delete
                  </Button>
                </div>
              </div>
            </DashboardCard>
          ))}
        </div>
      )}

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
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <label className="text-xs font-semibold text-muted-foreground">
                Name
              </label>
              <Input
                value={form.name}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, name: event.target.value }))
                }
                placeholder="e.g., Upper Power"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-semibold text-muted-foreground">
                Workout type
              </label>
              <Input
                value={form.workout_type_tag}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    workout_type_tag: event.target.value,
                  }))
                }
                placeholder="Hypertrophy, Strength, Powerbuilding..."
              />
            </div>
            <div className="space-y-2">
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
              {createStatus === "saving"
                ? "Creating..."
                : "Create + Open Builder"}
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
            <Button
              variant="secondary"
              disabled={deleteStatus === "deleting"}
              onClick={handleDelete}
            >
              {deleteStatus === "deleting" ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}

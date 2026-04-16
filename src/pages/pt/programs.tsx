import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Archive,
  Copy,
  Layers3,
  Pencil,
  Search,
  Sparkles,
  Trash2,
} from "lucide-react";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { Select } from "../../components/ui/select";
import { Skeleton } from "../../components/ui/skeleton";
import { Badge } from "../../components/ui/badge";
import { StatCard } from "../../components/ui/coachos/stat-card";
import { DashboardCard } from "../../components/pt/dashboard/DashboardCard";
import { StatusPill } from "../../components/pt/dashboard/StatusPill";
import { EmptyState } from "../../components/pt/dashboard/EmptyState";
import { WorkspacePageHeader } from "../../components/pt/workspace-page-header";
import { supabase } from "../../lib/supabase";
import { useWorkspace } from "../../lib/use-workspace";
import { formatRelativeTime } from "../../lib/relative-time";

type ProgramTemplateRow = {
  id: string;
  name: string | null;
  description: string | null;
  program_type_tag: string | null;
  weeks_count: number | null;
  is_active: boolean | null;
  updated_at: string | null;
  created_at: string | null;
};

type ProgramTemplateDayRow = {
  week_number: number | null;
  day_of_week: number | null;
  workout_template_id: string | null;
  is_rest: boolean | null;
  notes: string | null;
  sort_order: number | null;
};

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

const formatProgramTypeTag = (value: string | null | undefined) =>
  value && value.trim().length > 0 ? value.trim() : "Program";

export function PtProgramsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const {
    workspaceId,
    loading: workspaceLoading,
    error: workspaceError,
  } = useWorkspace();
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionId, setActionId] = useState<string | null>(null);
  const [actionMode, setActionMode] = useState<
    "duplicate" | "archive" | "delete" | null
  >(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [sortBy, setSortBy] = useState("updated");

  const programsQuery = useQuery({
    queryKey: ["program-templates", workspaceId],
    enabled: !!workspaceId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("program_templates")
        .select(
          "id, name, description, program_type_tag, weeks_count, is_active, updated_at, created_at",
        )
        .eq("workspace_id", workspaceId ?? "")
        .order("updated_at", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ProgramTemplateRow[];
    },
  });

  const formattedPrograms = useMemo(() => {
    return (programsQuery.data ?? []).map((program) => ({
      ...program,
      name: program.name?.trim() || "Untitled program",
      typeTagLabel: formatProgramTypeTag(program.program_type_tag),
      updatedLabel: program.updated_at
        ? formatRelativeTime(program.updated_at)
        : program.created_at
          ? formatRelativeTime(program.created_at)
          : "Recently",
      weeksLabel: program.weeks_count
        ? `${program.weeks_count} weeks`
        : "Weeks TBD",
    }));
  }, [programsQuery.data]);
  const activeProgramsCount = useMemo(
    () => formattedPrograms.filter((program) => program.is_active).length,
    [formattedPrograms],
  );
  const archivedProgramsCount = useMemo(
    () => formattedPrograms.filter((program) => !program.is_active).length,
    [formattedPrograms],
  );
  const programTypeOptions = useMemo(() => {
    const seen = new Map<string, string>();
    formattedPrograms.forEach((program) => {
      const value = program.program_type_tag?.trim();
      if (!value) return;
      const key = value.toLowerCase();
      if (!seen.has(key)) {
        seen.set(key, value);
      }
    });
    return Array.from(seen.values()).sort((a, b) => a.localeCompare(b));
  }, [formattedPrograms]);
  const filteredPrograms = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const matches = formattedPrograms.filter((program) => {
      const name = program.name?.toLowerCase() ?? "";
      const description = program.description?.toLowerCase() ?? "";
      const typeTag = program.typeTagLabel.toLowerCase();
      if (typeFilter !== "all" && typeTag !== typeFilter.toLowerCase()) {
        return false;
      }
      if (!query) return true;
      return (
        name.includes(query) ||
        description.includes(query) ||
        typeTag.includes(query)
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
      const aTime = new Date(a.updated_at ?? a.created_at ?? 0).getTime();
      const bTime = new Date(b.updated_at ?? b.created_at ?? 0).getTime();
      return bTime - aTime;
    });
  }, [formattedPrograms, searchQuery, sortBy, typeFilter]);

  const clearFilters = () => {
    setSearchQuery("");
    setTypeFilter("all");
    setSortBy("updated");
  };

  const handleArchive = async (programId: string) => {
    setActionId(programId);
    setActionMode("archive");
    setActionError(null);

    const { error } = await supabase
      .from("program_templates")
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq("id", programId);

    if (error) {
      const details = getErrorDetails(error);
      setActionError(`${details.code}: ${details.message}`);
    } else {
      await queryClient.invalidateQueries({
        queryKey: ["program-templates", workspaceId],
      });
    }

    setActionId(null);
    setActionMode(null);
  };

  const handleDuplicate = async (program: ProgramTemplateRow) => {
    if (!workspaceId) return;
    setActionId(program.id);
    setActionMode("duplicate");
    setActionError(null);

    const { data: newProgram, error: insertError } = await supabase
      .from("program_templates")
      .insert({
        workspace_id: workspaceId,
        name: `${program.name ?? "Program"} Copy`,
        description: program.description,
        program_type_tag: program.program_type_tag,
        weeks_count: program.weeks_count ?? 4,
        is_active: true,
      })
      .select("id")
      .maybeSingle();

    if (insertError || !newProgram?.id) {
      const details = getErrorDetails(insertError);
      setActionError(`${details.code}: ${details.message}`);
      setActionId(null);
      setActionMode(null);
      return;
    }

    const { data: dayRows, error: daysError } = await supabase
      .from("program_template_days")
      .select(
        "week_number, day_of_week, workout_template_id, is_rest, notes, sort_order",
      )
      .eq("program_template_id", program.id);

    if (!daysError && dayRows && dayRows.length > 0) {
      const payload = (dayRows as ProgramTemplateDayRow[]).map((row) => ({
        program_template_id: newProgram.id,
        week_number: row.week_number ?? 1,
        day_of_week: row.day_of_week ?? 1,
        workout_template_id: row.workout_template_id ?? null,
        is_rest: row.is_rest ?? false,
        notes: row.notes ?? null,
        sort_order: row.sort_order ?? 0,
      }));
      await supabase.from("program_template_days").insert(payload);
    }

    await queryClient.invalidateQueries({
      queryKey: ["program-templates", workspaceId],
    });
    navigate(`/pt/programs/${newProgram.id}/edit`);
    setActionId(null);
    setActionMode(null);
  };

  const handleDelete = async (program: ProgramTemplateRow) => {
    if (!workspaceId) return;
    const confirmed = window.confirm(
      `Delete "${program.name ?? "Program"}"? This will permanently remove the program and its scheduled template days.`,
    );
    if (!confirmed) return;

    setActionId(program.id);
    setActionMode("delete");
    setActionError(null);

    const { error: deleteDaysError } = await supabase
      .from("program_template_days")
      .delete()
      .eq("program_template_id", program.id);

    if (deleteDaysError) {
      const details = getErrorDetails(deleteDaysError);
      setActionError(`${details.code}: ${details.message}`);
      setActionId(null);
      setActionMode(null);
      return;
    }

    const { error: deleteProgramError } = await supabase
      .from("program_templates")
      .delete()
      .eq("id", program.id);

    if (deleteProgramError) {
      const details = getErrorDetails(deleteProgramError);
      setActionError(`${details.code}: ${details.message}`);
      setActionId(null);
      setActionMode(null);
      return;
    }

    await queryClient.invalidateQueries({
      queryKey: ["program-templates", workspaceId],
    });
    setActionId(null);
    setActionMode(null);
  };

  return (
    <div className="space-y-6">
      <WorkspacePageHeader
        title="Programs"
        description="Design reusable multi-week training systems and keep edit actions close to the list."
      />

      <div className="flex justify-end">
        <Button onClick={() => navigate("/pt/programs/new")}>
          New Program
        </Button>
      </div>

      {actionError ? (
        <Card className="border-destructive/40 bg-destructive/5 p-3 text-sm">
          {actionError}
        </Card>
      ) : null}

      <div className="page-kpi-block grid gap-4 md:grid-cols-3">
        <StatCard
          label="Reusable Programs"
          value={formattedPrograms.length}
          helper="Multi-week systems ready to reuse"
          icon={Layers3}
          accent
          className="h-full"
        />
        <StatCard
          label="Active"
          value={activeProgramsCount}
          helper="Available for assignment and edits"
          icon={Sparkles}
          className="h-full"
        />
        <StatCard
          label="Archived"
          value={archivedProgramsCount}
          helper="Stored for reference without clutter"
          icon={Archive}
          className="h-full"
        />
      </div>

      <div className="grid gap-2 xl:grid-cols-[minmax(0,1fr)_12rem_12rem] xl:items-center">
        <div className="relative min-w-0">
          <Search className="app-search-icon h-4 w-4" />
          <Input
            className="app-search-input"
            placeholder="Search programs"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
          />
        </div>
        <Select
          variant="filter"
          className="w-full min-w-0"
          value={typeFilter}
          onChange={(event) => setTypeFilter(event.target.value)}
        >
          <option value="all">All program types</option>
          {programTypeOptions.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </Select>
        <Select
          variant="filter"
          className="w-full min-w-0"
          value={sortBy}
          onChange={(event) => setSortBy(event.target.value)}
        >
          <option value="updated">Sort by updated</option>
          <option value="name">Sort by name</option>
        </Select>
      </div>

      {workspaceLoading || programsQuery.isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-40 w-full" />
          ))}
        </div>
      ) : workspaceError ? (
        <Card className="border-destructive/40 bg-destructive/5 p-3 text-sm">
          {getErrorDetails(workspaceError).code}:{" "}
          {getErrorDetails(workspaceError).message}
        </Card>
      ) : programsQuery.error ? (
        <Card className="border-destructive/40 bg-destructive/5 p-3 text-sm">
          {getErrorDetails(programsQuery.error).code}:{" "}
          {getErrorDetails(programsQuery.error).message}
        </Card>
      ) : filteredPrograms.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filteredPrograms.map((program) => {
            const isBusy = actionId === program.id;
            return (
              <DashboardCard
                key={program.id}
                title={program.name}
                subtitle={program.description ?? "Multi-week program"}
                action={
                  <StatusPill
                    status={program.is_active ? "active" : "inactive"}
                  />
                }
                className="bg-card/90"
              >
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <Badge
                      variant="secondary"
                      className="text-[10px] uppercase"
                    >
                      {program.typeTagLabel}
                    </Badge>
                    <Badge variant="muted" className="text-[10px] uppercase">
                      Updated {program.updatedLabel}
                    </Badge>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      className="flex-1"
                      onClick={() =>
                        navigate(`/pt/programs/${program.id}/edit`)
                      }
                    >
                      <Pencil className="mr-1 h-3.5 w-3.5" />
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="flex-1"
                      disabled={isBusy && actionMode === "duplicate"}
                      onClick={() => handleDuplicate(program)}
                    >
                      <Copy className="mr-1 h-3.5 w-3.5" />
                      {isBusy && actionMode === "duplicate"
                        ? "Duplicating..."
                        : "Duplicate"}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="flex-1"
                      disabled={isBusy && actionMode === "archive"}
                      onClick={() => handleArchive(program.id)}
                    >
                      <Archive className="mr-1 h-3.5 w-3.5" />
                      {isBusy && actionMode === "archive"
                        ? "Archiving..."
                        : "Archive"}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="flex-1 text-destructive hover:text-destructive"
                      disabled={isBusy && actionMode === "delete"}
                      onClick={() => handleDelete(program)}
                    >
                      <Trash2 className="mr-1 h-3.5 w-3.5" />
                      {isBusy && actionMode === "delete"
                        ? "Deleting..."
                        : "Delete"}
                    </Button>
                  </div>
                </div>
              </DashboardCard>
            );
          })}
        </div>
      ) : formattedPrograms.length > 0 ? (
        <DashboardCard title="No programs match" className="bg-card/90">
          <EmptyState
            title="No programs match"
            description="Clear the search or try another filter."
            actionLabel="Clear filters"
            onAction={clearFilters}
          />
        </DashboardCard>
      ) : (
        <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
          <DashboardCard
            title="Build your first reusable program"
            subtitle="Programs become the repeatable training systems you assign, adapt, and archive over time."
          >
            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-[20px] border border-border/70 bg-background/35 p-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  Reusable block
                </div>
                <div className="mt-2 text-sm font-semibold text-foreground">
                  4-week Hypertrophy Base
                </div>
                <div className="mt-1 text-sm text-muted-foreground">
                  Clear title, duration, and progression notes so the structure
                  is reusable.
                </div>
              </div>
              <div className="rounded-[20px] border border-border/70 bg-background/35 p-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  Assignment behavior
                </div>
                <div className="mt-2 text-sm font-semibold text-foreground">
                  Build once, assign many
                </div>
                <div className="mt-1 text-sm text-muted-foreground">
                  Use the template as the planning source, then assign the right
                  block to each client.
                </div>
              </div>
              <div className="rounded-[20px] border border-border/70 bg-background/35 p-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  Lifecycle
                </div>
                <div className="mt-2 text-sm font-semibold text-foreground">
                  Active or archived
                </div>
                <div className="mt-1 text-sm text-muted-foreground">
                  Keep current systems ready to assign and move old ones out of
                  the active planning lane.
                </div>
              </div>
            </div>
          </DashboardCard>

          <DashboardCard
            title="Create flow"
            subtitle="Start deliberately so the first program already fits the long-term library."
          >
            <div className="space-y-4">
              <div className="rounded-[20px] border border-border/70 bg-background/35 p-4">
                <div className="text-sm font-semibold text-foreground">
                  Recommended first step
                </div>
                <div className="mt-1 text-sm text-muted-foreground">
                  Create one repeatable training block with a clear purpose,
                  then duplicate it when you need a variation.
                </div>
              </div>
              <EmptyState
                title="No programs yet"
                description="Create your first multi-week program to start assigning structured training blocks."
                actionLabel="New Program"
                onAction={() => navigate("/pt/programs/new")}
              />
            </div>
          </DashboardCard>
        </div>
      )}
    </div>
  );
}

import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Pencil, Archive } from "lucide-react";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { Skeleton } from "../../components/ui/skeleton";
import { Badge } from "../../components/ui/badge";
import { DashboardCard } from "../../components/pt/dashboard/DashboardCard";
import { StatusPill } from "../../components/pt/dashboard/StatusPill";
import { EmptyState } from "../../components/pt/dashboard/EmptyState";
import { supabase } from "../../lib/supabase";
import { useWorkspace } from "../../lib/use-workspace";
import { formatRelativeTime } from "../../lib/relative-time";

type ProgramTemplateRow = {
  id: string;
  name: string | null;
  description: string | null;
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

export function PtProgramsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { workspaceId, loading: workspaceLoading, error: workspaceError } = useWorkspace();
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionId, setActionId] = useState<string | null>(null);
  const [actionMode, setActionMode] = useState<"duplicate" | "archive" | null>(null);

  const programsQuery = useQuery({
    queryKey: ["program-templates", workspaceId],
    enabled: !!workspaceId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("program_templates")
        .select("id, name, description, weeks_count, is_active, updated_at, created_at")
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
      updatedLabel: program.updated_at
        ? formatRelativeTime(program.updated_at)
        : program.created_at
        ? formatRelativeTime(program.created_at)
        : "Recently",
      weeksLabel: program.weeks_count ? `${program.weeks_count} weeks` : "Weeks TBD",
    }));
  }, [programsQuery.data]);

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
      await queryClient.invalidateQueries({ queryKey: ["program-templates", workspaceId] });
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
      .select("week_number, day_of_week, workout_template_id, is_rest, notes, sort_order")
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

    await queryClient.invalidateQueries({ queryKey: ["program-templates", workspaceId] });
    navigate(`/pt/programs/${newProgram.id}/edit`);
    setActionId(null);
    setActionMode(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-[0.3em] text-muted-foreground">CoachOS Pro</div>
          <h2 className="text-2xl font-semibold tracking-tight">Programs</h2>
          <p className="text-sm text-muted-foreground">
            Design multi-week training programs for your clients.
          </p>
        </div>
        <Button onClick={() => navigate("/pt/programs/new")}>New Program</Button>
      </div>

      {actionError ? (
        <Card className="border-destructive/40 bg-destructive/5 p-3 text-sm">
          {actionError}
        </Card>
      ) : null}

      {workspaceLoading || programsQuery.isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-40 w-full" />
          ))}
        </div>
      ) : workspaceError ? (
        <Card className="border-destructive/40 bg-destructive/5 p-3 text-sm">
          {getErrorDetails(workspaceError).code}: {getErrorDetails(workspaceError).message}
        </Card>
      ) : programsQuery.error ? (
        <Card className="border-destructive/40 bg-destructive/5 p-3 text-sm">
          {getErrorDetails(programsQuery.error).code}: {getErrorDetails(programsQuery.error).message}
        </Card>
      ) : formattedPrograms.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {formattedPrograms.map((program) => {
            const isBusy = actionId === program.id;
            return (
              <DashboardCard
                key={program.id}
                title={program.name}
                subtitle={program.description ?? "Multi-week program"}
                action={<StatusPill status={program.is_active ? "active" : "inactive"} />}
                className="bg-card/90"
              >
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <Badge variant="secondary" className="text-[10px] uppercase">
                      {program.weeksLabel}
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
                      onClick={() => navigate(`/pt/programs/${program.id}/edit`)}
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
                      {isBusy && actionMode === "duplicate" ? "Duplicating..." : "Duplicate"}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="flex-1"
                      disabled={isBusy && actionMode === "archive"}
                      onClick={() => handleArchive(program.id)}
                    >
                      <Archive className="mr-1 h-3.5 w-3.5" />
                      {isBusy && actionMode === "archive" ? "Archiving..." : "Archive"}
                    </Button>
                  </div>
                </div>
              </DashboardCard>
            );
          })}
        </div>
      ) : (
        <EmptyState
          title="No programs yet."
          description="Create your first multi-week program to start assigning training blocks."
          actionLabel="New Program"
          onAction={() => navigate("/pt/programs/new")}
        />
      )}
    </div>
  );
}

import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import {
  EmptyStateBlock,
  PortalPageHeader,
  SectionCard,
  StatusBanner,
  SurfaceCard,
  SurfaceCardContent,
  SurfaceCardDescription,
  SurfaceCardHeader,
  SurfaceCardTitle,
} from "../../components/client/portal";
import { ActionStatusMessage } from "../../components/common/action-feedback";
import { Skeleton, StatusPill } from "../../components/ui/coachos";
import { useBootstrapAuth, useSessionAuth } from "../../lib/auth";
import { addDaysToDateString, getTodayInTimezone } from "../../lib/date-utils";
import {
  buildUnifiedSourceLabel,
  classifyUnifiedSourceKind,
  matchesUnifiedSourceFilter,
} from "../../lib/source-labels";
import { supabase } from "../../lib/supabase";
import {
  applyUnifiedNutritionFilter,
  groupUnifiedNutritionByDate,
  unifiedNutritionFilters,
  type UnifiedNutritionDayRow,
  type UnifiedNutritionFilterKey,
} from "./nutrition-unified";

type ClientProfileRow = {
  id: string;
  workspace_id: string | null;
  timezone: string | null;
  created_at: string | null;
};

type NutritionTemplateRelation = {
  id: string;
  name: string | null;
  duration_weeks: number | null;
  workspace_id: string | null;
  owner_client_id: string | null;
  is_active: boolean | null;
};

type AssignedNutritionPlanRow = {
  id: string;
  client_id: string;
  nutrition_template_id: string;
  start_date: string;
  end_date: string;
  status: string;
  created_at: string | null;
  updated_at: string | null;
  nutrition_template: NutritionTemplateRelation | NutritionTemplateRelation[] | null;
};

type AssignedNutritionDayRow = {
  id: string;
  assigned_nutrition_plan_id: string;
  date: string;
  week_index: number;
  day_of_week: number;
  notes: string | null;
  plan:
    | (Omit<AssignedNutritionPlanRow, "nutrition_template"> & {
        nutrition_template:
          | NutritionTemplateRelation
          | NutritionTemplateRelation[]
          | null;
      })
    | Array<
        Omit<AssignedNutritionPlanRow, "nutrition_template"> & {
          nutrition_template:
            | NutritionTemplateRelation
            | NutritionTemplateRelation[]
            | null;
        }
      >
    | null;
};

type NutritionMealLogRow = {
  id: string;
  is_completed: boolean | null;
  consumed_at: string | null;
  actual_calories: number | null;
  actual_protein_g: number | null;
  actual_carbs_g: number | null;
  actual_fat_g: number | null;
};

type AssignedNutritionMealRow = {
  id: string;
  assigned_nutrition_day_id: string;
  meal_name: string | null;
  calories: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  logs: NutritionMealLogRow[] | null;
};

type WorkspaceRow = {
  id: string;
  name: string | null;
};

type PersonalNutritionTemplateRow = {
  id: string;
  name: string | null;
  description: string | null;
  is_active: boolean;
  created_at: string | null;
};

const getSingleRelation = <T,>(value: T | T[] | null | undefined): T | null =>
  Array.isArray(value) ? (value[0] ?? null) : (value ?? null);

const n = (value: number | null | undefined) =>
  typeof value === "number" ? value : 0;

const formatDate = (value: string) => {
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    weekday: "short",
  });
};

const formatDateRange = (startDate: string, endDate: string) =>
  `${formatDate(startDate)} - ${formatDate(endDate)}`;

type NutritionDayCardProps = {
  row: UnifiedNutritionDayRow;
  onOpen: (dayId: string) => void;
};

function NutritionDayCard({ row, onOpen }: NutritionDayCardProps) {
  const completionText =
    row.mealsTotal > 0
      ? `${row.mealsCompleted}/${row.mealsTotal} meals logged`
      : "No meals logged yet";

  return (
    <SurfaceCard className="border-border/70 bg-card/55">
      <SurfaceCardHeader className="gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <SurfaceCardTitle className="text-base">{row.planName}</SurfaceCardTitle>
            <SurfaceCardDescription className="text-sm">
              {formatDate(row.date)}
            </SurfaceCardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="muted">{row.sourceLabel}</Badge>
            <StatusPill
              status={
                row.mealsTotal > 0 && row.mealsCompleted >= row.mealsTotal
                  ? "completed"
                  : "planned"
              }
            />
          </div>
        </div>
      </SurfaceCardHeader>
      <SurfaceCardContent className="space-y-3">
        <div className="grid grid-cols-4 gap-2 rounded-lg border border-border/60 bg-muted/20 p-2 text-center text-xs">
          <div>
            <p className="text-muted-foreground">Cals</p>
            <p className="font-semibold">{Math.round(row.macros.calories)}</p>
          </div>
          <div>
            <p className="text-muted-foreground">P</p>
            <p className="font-semibold">{Math.round(row.macros.protein_g)}</p>
          </div>
          <div>
            <p className="text-muted-foreground">C</p>
            <p className="font-semibold">{Math.round(row.macros.carbs_g)}</p>
          </div>
          <div>
            <p className="text-muted-foreground">F</p>
            <p className="font-semibold">{Math.round(row.macros.fat_g)}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">{completionText}</p>
          <Button size="sm" onClick={() => onOpen(row.id)}>
            Open day
          </Button>
        </div>
      </SurfaceCardContent>
    </SurfaceCard>
  );
}

export function ClientNutritionPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { session } = useSessionAuth();
  const { activeClientId } = useBootstrapAuth();
  const [activeFilter, setActiveFilter] =
    useState<UnifiedNutritionFilterKey>("all");
  const [manageError, setManageError] = useState<string | null>(null);

  const clientQuery = useQuery({
    queryKey: ["client-nutrition-profiles", session?.user?.id],
    enabled: !!session?.user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, workspace_id, timezone, created_at")
        .eq("user_id", session?.user?.id ?? "")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as ClientProfileRow[];
    },
  });

  const clientProfiles = useMemo(() => clientQuery.data ?? [], [clientQuery.data]);
  const clientProfile = useMemo(
    () =>
      clientProfiles.find((row) => row.id === activeClientId) ??
      clientProfiles[0] ??
      null,
    [activeClientId, clientProfiles],
  );
  const clientId = clientProfile?.id ?? null;
  const timezone = clientProfile?.timezone ?? "UTC";
  const todayKey = useMemo(() => getTodayInTimezone(timezone), [timezone]);
  const rangeStart = useMemo(
    () => addDaysToDateString(todayKey, -14),
    [todayKey],
  );
  const rangeEnd = useMemo(() => addDaysToDateString(todayKey, 30), [todayKey]);

  const plansQuery = useQuery({
    queryKey: ["client-nutrition-plans", clientId],
    enabled: !!clientId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("assigned_nutrition_plans")
        .select(
          "id, client_id, nutrition_template_id, start_date, end_date, status, created_at, updated_at, nutrition_template:nutrition_templates(id, name, duration_weeks, workspace_id, owner_client_id, is_active)",
        )
        .eq("client_id", clientId ?? "")
        .order("start_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as AssignedNutritionPlanRow[];
    },
  });

  const planIds = useMemo(
    () => (plansQuery.data ?? []).map((plan) => plan.id),
    [plansQuery.data],
  );

  const daysQuery = useQuery({
    queryKey: [
      "client-nutrition-days",
      clientId,
      planIds.join(","),
      rangeStart,
      rangeEnd,
    ],
    enabled: !!clientId && planIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("assigned_nutrition_days")
        .select(
          "id, assigned_nutrition_plan_id, date, week_index, day_of_week, notes, plan:assigned_nutrition_plans(id, client_id, nutrition_template_id, start_date, end_date, status, created_at, updated_at, nutrition_template:nutrition_templates(id, name, duration_weeks, workspace_id, owner_client_id, is_active))",
        )
        .in("assigned_nutrition_plan_id", planIds)
        .gte("date", rangeStart)
        .lte("date", rangeEnd)
        .order("date", { ascending: true });
      if (error) throw error;
      return (data ?? []) as AssignedNutritionDayRow[];
    },
  });

  const dayIds = useMemo(
    () => (daysQuery.data ?? []).map((day) => day.id),
    [daysQuery.data],
  );

  const mealsQuery = useQuery({
    queryKey: ["client-nutrition-meals", dayIds.join(",")],
    enabled: dayIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("assigned_nutrition_meals")
        .select(
          "id, assigned_nutrition_day_id, meal_name, calories, protein_g, carbs_g, fat_g, logs:nutrition_meal_logs(id, is_completed, consumed_at, actual_calories, actual_protein_g, actual_carbs_g, actual_fat_g)",
        )
        .in("assigned_nutrition_day_id", dayIds)
        .order("meal_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as AssignedNutritionMealRow[];
    },
  });

  const workspaceIds = useMemo(() => {
    const set = new Set<string>();
    (plansQuery.data ?? []).forEach((plan) => {
      const template = getSingleRelation(plan.nutrition_template);
      if (template?.workspace_id) set.add(template.workspace_id);
    });
    return Array.from(set);
  }, [plansQuery.data]);

  const workspacesQuery = useQuery({
    queryKey: ["client-nutrition-workspaces", workspaceIds.join(",")],
    enabled: workspaceIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workspaces")
        .select("id, name")
        .in("id", workspaceIds);
      if (error) throw error;
      return (data ?? []) as WorkspaceRow[];
    },
  });

  const personalTemplatesQuery = useQuery({
    queryKey: ["client-personal-nutrition-templates", clientId],
    enabled: !!clientId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("nutrition_templates")
        .select("id, name, description, is_active, created_at")
        .eq("owner_client_id", clientId ?? "")
        .is("workspace_id", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as PersonalNutritionTemplateRow[];
    },
  });

  const workspaceNameById = useMemo(
    () =>
      new Map((workspacesQuery.data ?? []).map((row) => [row.id, row.name ?? ""])),
    [workspacesQuery.data],
  );

  const mealsByDayId = useMemo(() => {
    const map = new Map<string, AssignedNutritionMealRow[]>();
    (mealsQuery.data ?? []).forEach((meal) => {
      const list = map.get(meal.assigned_nutrition_day_id) ?? [];
      list.push(meal);
      map.set(meal.assigned_nutrition_day_id, list);
    });
    return map;
  }, [mealsQuery.data]);

  const unifiedDayRows = useMemo(() => {
    return (daysQuery.data ?? []).map((day): UnifiedNutritionDayRow => {
      const plan = getSingleRelation(day.plan);
      const template = getSingleRelation(plan?.nutrition_template);
      const sourceWorkspaceId = template?.workspace_id ?? null;
      const sourceLabel = buildUnifiedSourceLabel({
        workspaceId: sourceWorkspaceId,
        workspaceName: sourceWorkspaceId
          ? (workspaceNameById.get(sourceWorkspaceId) ?? null)
          : null,
      });
      const sourceKind = classifyUnifiedSourceKind({
        workspaceId: sourceWorkspaceId,
      });
      const meals = mealsByDayId.get(day.id) ?? [];
      const mealsCompleted = meals.filter((meal) =>
        (meal.logs ?? []).some((log) => Boolean(log.is_completed)),
      ).length;
      const macros = meals.reduce(
        (acc, meal) => {
          const latestLog =
            (meal.logs ?? [])
              .filter((log) => Boolean(log.consumed_at))
              .sort((a, b) =>
                (a.consumed_at ?? "") < (b.consumed_at ?? "") ? 1 : -1,
              )[0] ?? null;
          acc.calories += n(latestLog?.actual_calories ?? meal.calories);
          acc.protein_g += n(latestLog?.actual_protein_g ?? meal.protein_g);
          acc.carbs_g += n(latestLog?.actual_carbs_g ?? meal.carbs_g);
          acc.fat_g += n(latestLog?.actual_fat_g ?? meal.fat_g);
          return acc;
        },
        { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 },
      );

      return {
        id: day.id,
        date: day.date,
        planId: day.assigned_nutrition_plan_id,
        planStatus: plan?.status ?? "active",
        planName: template?.name?.trim() || "Nutrition plan",
        sourceKind,
        sourceLabel,
        sourceWorkspaceId,
        mealsTotal: meals.length,
        mealsCompleted,
        macros,
      };
    });
  }, [daysQuery.data, mealsByDayId, workspaceNameById]);

  const filteredRows = useMemo(
    () => applyUnifiedNutritionFilter(unifiedDayRows, activeFilter, todayKey),
    [activeFilter, todayKey, unifiedDayRows],
  );

  const groupedRows = useMemo(
    () => groupUnifiedNutritionByDate(filteredRows, todayKey),
    [filteredRows, todayKey],
  );

  const activePlans = useMemo(() => {
    return (plansQuery.data ?? []).filter((plan) => {
      if (plan.status !== "active") return false;
      const template = getSingleRelation(plan.nutrition_template);
      const sourceKind = classifyUnifiedSourceKind({
        workspaceId: template?.workspace_id ?? null,
      });
      if (activeFilter === "assigned" || activeFilter === "personal") {
        return matchesUnifiedSourceFilter(sourceKind, activeFilter);
      }
      return true;
    });
  }, [activeFilter, plansQuery.data]);

  const usedPersonalTemplateIds = useMemo(() => {
    const used = new Set<string>();
    (plansQuery.data ?? []).forEach((plan) => {
      const template = getSingleRelation(plan.nutrition_template);
      if (template?.owner_client_id && plan.nutrition_template_id) {
        used.add(plan.nutrition_template_id);
      }
    });
    return used;
  }, [plansQuery.data]);

  const archiveTemplateMutation = useMutation({
    mutationFn: async (templateId: string) => {
      if (!clientId) throw new Error("Client profile is required.");
      const { error } = await supabase
        .from("nutrition_templates")
        .update({ is_active: false })
        .eq("id", templateId)
        .eq("owner_client_id", clientId)
        .is("workspace_id", null);
      if (error) throw error;
    },
    onSuccess: async () => {
      setManageError(null);
      await queryClient.invalidateQueries({
        queryKey: ["client-personal-nutrition-templates", clientId],
      });
      await queryClient.invalidateQueries({
        queryKey: ["client-nutrition-plans", clientId],
      });
    },
  });

  const deleteTemplateMutation = useMutation({
    mutationFn: async (templateId: string) => {
      if (!clientId) throw new Error("Client profile is required.");
      const { error } = await supabase
        .from("nutrition_templates")
        .delete()
        .eq("id", templateId)
        .eq("owner_client_id", clientId)
        .is("workspace_id", null);
      if (error) throw error;
    },
    onSuccess: async () => {
      setManageError(null);
      await queryClient.invalidateQueries({
        queryKey: ["client-personal-nutrition-templates", clientId],
      });
    },
    onError: (error) => {
      setManageError(
        error instanceof Error
          ? error.message
          : "Unable to delete template. Archive it instead.",
      );
    },
  });

  const isLoading =
    clientQuery.isLoading ||
    plansQuery.isLoading ||
    daysQuery.isLoading ||
    mealsQuery.isLoading;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-14 w-full" />
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-64 w-full" />
          ))}
        </div>
      </div>
    );
  }

  if (!clientId) {
    return (
      <div className="space-y-6">
        <PortalPageHeader
          title="Nutrition"
          subtitle="Unified nutrition for personal and coach-assigned plans."
        />
        <EmptyStateBlock
          title="Client profile not found"
          description="Finish onboarding to start logging nutrition."
          actions={
            <Button variant="secondary" onClick={() => navigate("/app/home")}>
              Back to Home
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PortalPageHeader
        title="Nutrition"
        subtitle="One nutrition experience across personal and coach-assigned plans."
        stateText={`${filteredRows.length} day${filteredRows.length === 1 ? "" : "s"} in view`}
        actions={
          <>
            <Button variant="secondary" onClick={() => navigate("/app/home")}>
              Home
            </Button>
            <Button
              onClick={() => navigate("/app/nutrition/new")}
            >
              <Plus className="mr-1 h-4 w-4" />
              Create plan
            </Button>
          </>
        }
      />

      {plansQuery.error || daysQuery.error || mealsQuery.error ? (
        <StatusBanner
          variant="warning"
          title="Some nutrition data is unavailable"
          description="We loaded what we could. You can still open available nutrition days."
        />
      ) : null}

      <SectionCard className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {unifiedNutritionFilters.map((filter) => (
            <Button
              key={filter.key}
              size="sm"
              variant={activeFilter === filter.key ? "default" : "secondary"}
              onClick={() => setActiveFilter(filter.key)}
            >
              {filter.label}
            </Button>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <SurfaceCard className="border-border/70 bg-card/55">
            <SurfaceCardHeader>
              <SurfaceCardTitle>Today</SurfaceCardTitle>
              <SurfaceCardDescription>
                Highest priority nutrition tasks for today.
              </SurfaceCardDescription>
            </SurfaceCardHeader>
            <SurfaceCardContent className="space-y-3">
              {groupedRows.today.length === 0 ? (
                <EmptyStateBlock
                  title="No nutrition tasks today"
                  description="Create a personal plan or check upcoming days."
                  centered
                />
              ) : (
                groupedRows.today.map((row) => (
                  <NutritionDayCard
                    key={row.id}
                    row={row}
                    onOpen={(dayId) => navigate(`/app/nutrition/${dayId}`)}
                  />
                ))
              )}
            </SurfaceCardContent>
          </SurfaceCard>

          <SurfaceCard className="border-border/70 bg-card/55">
            <SurfaceCardHeader>
              <SurfaceCardTitle>Upcoming</SurfaceCardTitle>
              <SurfaceCardDescription>
                Scheduled nutrition days ahead.
              </SurfaceCardDescription>
            </SurfaceCardHeader>
            <SurfaceCardContent className="space-y-3">
              {groupedRows.upcoming.length === 0 ? (
                <EmptyStateBlock
                  title="No upcoming nutrition days"
                  description="Upcoming personal and coach-assigned days will appear here."
                  centered
                />
              ) : (
                groupedRows.upcoming.slice(0, 6).map((row) => (
                  <NutritionDayCard
                    key={row.id}
                    row={row}
                    onOpen={(dayId) => navigate(`/app/nutrition/${dayId}`)}
                  />
                ))
              )}
            </SurfaceCardContent>
          </SurfaceCard>
        </div>
      </SectionCard>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <SectionCard className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Active Plans</h2>
            <p className="text-sm text-muted-foreground">
              Personal and coach-assigned plans are merged here.
            </p>
          </div>
          {activePlans.length === 0 ? (
            <EmptyStateBlock
              title="No active plans"
              description="Create a personal plan or wait for coach assignment."
              centered
            />
          ) : (
            <div className="space-y-3">
              {activePlans.map((plan) => {
                const template = getSingleRelation(plan.nutrition_template);
                const sourceWorkspaceId = template?.workspace_id ?? null;
                const sourceLabel = buildUnifiedSourceLabel({
                  workspaceId: sourceWorkspaceId,
                  workspaceName: sourceWorkspaceId
                    ? (workspaceNameById.get(sourceWorkspaceId) ?? null)
                    : null,
                });
                const sourceKind = classifyUnifiedSourceKind({
                  workspaceId: sourceWorkspaceId,
                });
                const openDay =
                  unifiedDayRows.find(
                    (day) =>
                      day.planId === plan.id &&
                      (day.date >= todayKey || day.date === todayKey),
                  ) ?? unifiedDayRows.find((day) => day.planId === plan.id);

                return (
                  <SurfaceCard key={plan.id} className="border-border/70 bg-card/55">
                    <SurfaceCardHeader className="gap-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <SurfaceCardTitle className="text-base">
                          {template?.name ?? "Nutrition plan"}
                        </SurfaceCardTitle>
                        <div className="flex items-center gap-2">
                          <Badge variant="muted">{sourceLabel}</Badge>
                          <StatusPill status="planned" />
                        </div>
                      </div>
                      <SurfaceCardDescription>
                        {formatDateRange(plan.start_date, plan.end_date)}
                      </SurfaceCardDescription>
                    </SurfaceCardHeader>
                    <SurfaceCardContent className="flex flex-wrap items-center gap-2">
                      {openDay ? (
                        <Button
                          size="sm"
                          onClick={() => navigate(`/app/nutrition/${openDay.id}`)}
                        >
                          Open day
                        </Button>
                      ) : null}
                      {sourceKind === "personal" && template?.id ? (
                        <>
                          {usedPersonalTemplateIds.has(template.id) ? (
                            <Button
                              size="sm"
                              variant="secondary"
                              disabled={archiveTemplateMutation.isPending}
                              onClick={() =>
                                archiveTemplateMutation.mutate(template.id)
                              }
                            >
                              Archive
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              variant="secondary"
                              className="text-destructive hover:text-destructive"
                              disabled={deleteTemplateMutation.isPending}
                              onClick={() => deleteTemplateMutation.mutate(template.id)}
                            >
                              <Trash2 className="mr-1 h-3.5 w-3.5" />
                              Delete
                            </Button>
                          )}
                        </>
                      ) : null}
                    </SurfaceCardContent>
                  </SurfaceCard>
                );
              })}
            </div>
          )}
        </SectionCard>

        <SectionCard className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Recent Activity</h2>
            <p className="text-sm text-muted-foreground">
              Latest completed nutrition days and logging progress.
            </p>
          </div>
          {groupedRows.recent.length === 0 ? (
            <EmptyStateBlock
              title="No recent nutrition history"
              description="Completed days will appear here once you start logging."
              centered
            />
          ) : (
            <div className="space-y-3">
              {groupedRows.recent.slice(0, 6).map((row) => (
                <NutritionDayCard
                  key={row.id}
                  row={row}
                  onOpen={(dayId) => navigate(`/app/nutrition/${dayId}`)}
                />
              ))}
            </div>
          )}
        </SectionCard>
      </div>

      <SectionCard className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">
            Personal Templates
          </h2>
          <p className="text-sm text-muted-foreground">
            Used templates are history-safe and archive-only. Unused templates can be deleted.
          </p>
        </div>
        {(personalTemplatesQuery.data ?? []).length === 0 ? (
          <EmptyStateBlock
            title="No personal templates yet"
            description="Create your first personal plan to get started."
            centered
          />
        ) : (
          <div className="space-y-3">
            {(personalTemplatesQuery.data ?? []).map((template) => {
              const isUsed = usedPersonalTemplateIds.has(template.id);
              return (
                <SurfaceCard key={template.id} className="border-border/70 bg-card/55">
                  <SurfaceCardHeader className="gap-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <SurfaceCardTitle className="text-base">
                        {template.name ?? "Personal template"}
                      </SurfaceCardTitle>
                      <div className="flex items-center gap-2">
                        <Badge variant="muted">Personal</Badge>
                        {!template.is_active ? <Badge variant="neutral">Archived</Badge> : null}
                      </div>
                    </div>
                    <SurfaceCardDescription>
                      {template.description?.trim() || "No description"}
                    </SurfaceCardDescription>
                  </SurfaceCardHeader>
                  <SurfaceCardContent className="flex flex-wrap items-center gap-2">
                    {isUsed ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={archiveTemplateMutation.isPending || !template.is_active}
                        onClick={() => archiveTemplateMutation.mutate(template.id)}
                      >
                        Archive
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="secondary"
                        className="text-destructive hover:text-destructive"
                        disabled={deleteTemplateMutation.isPending}
                        onClick={() => deleteTemplateMutation.mutate(template.id)}
                      >
                        <Trash2 className="mr-1 h-3.5 w-3.5" />
                        Delete
                      </Button>
                    )}
                  </SurfaceCardContent>
                </SurfaceCard>
              );
            })}
          </div>
        )}
      </SectionCard>

      {manageError ? <ActionStatusMessage tone="error">{manageError}</ActionStatusMessage> : null}
    </div>
  );
}

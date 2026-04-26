import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Badge } from "../../components/ui/badge";
import {
  DashboardCard,
  EmptyState,
  Skeleton,
  StatusPill,
} from "../../components/ui/coachos";
import { PageContainer } from "../../components/common/page-container";
import { supabase } from "../../lib/supabase";
import { buildUnifiedSourceLabel } from "../../lib/source-labels";
import {
  useAssignedNutritionDay,
  useAssignedNutritionMeals,
} from "../../lib/nutrition";

const n = (value: number | null | undefined) =>
  typeof value === "number" ? value : 0;

const formatServing = (quantity: number | null, unit: string | null) => {
  if (quantity === null && !unit) return "Serving";
  return [quantity ?? null, unit?.trim() || null].filter(Boolean).join(" ");
};

const formatMacroLine = (values: {
  calories?: number | null;
  protein_g?: number | null;
  carbs_g?: number | null;
  fat_g?: number | null;
}) =>
  `${Math.round(n(values.calories))} cals / ${Math.round(n(values.protein_g))}p / ${Math.round(n(values.carbs_g))}c / ${Math.round(n(values.fat_g))}f`;

const getSingleRelation = <T,>(value: T | T[] | null | undefined): T | null =>
  Array.isArray(value) ? (value[0] ?? null) : (value ?? null);

export function ClientNutritionDayPage() {
  const { assigned_nutrition_day_id } = useParams();
  const assignedDayId = assigned_nutrition_day_id ?? null;
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const dayQuery = useAssignedNutritionDay(assignedDayId);
  const mealsQuery = useAssignedNutritionMeals(assignedDayId);

  const [selectedMealId, setSelectedMealId] = useState<string | null>(null);
  const [actualCalories, setActualCalories] = useState("");
  const [actualProtein, setActualProtein] = useState("");
  const [actualCarbs, setActualCarbs] = useState("");
  const [actualFat, setActualFat] = useState("");
  const [completed, setCompleted] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const meals = useMemo(() => mealsQuery.data ?? [], [mealsQuery.data]);
  const dayPlan = getSingleRelation(dayQuery.data?.plan as any);
  const dayTemplate = getSingleRelation(dayPlan?.nutrition_template as any);
  const sourceWorkspaceId =
    (dayTemplate?.workspace_id as string | null | undefined) ?? null;

  const sourceWorkspaceQuery = useQuery({
    queryKey: ["client-nutrition-day-workspace", sourceWorkspaceId],
    enabled: Boolean(sourceWorkspaceId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workspaces")
        .select("id, name")
        .eq("id", sourceWorkspaceId ?? "")
        .maybeSingle();
      if (error) throw error;
      return data ?? null;
    },
  });

  const sourceLabel = buildUnifiedSourceLabel({
    workspaceId: sourceWorkspaceId,
    workspaceName: sourceWorkspaceQuery.data?.name ?? null,
  });

  useEffect(() => {
    const firstMeal = meals[0];
    if (!selectedMealId && firstMeal) {
      setSelectedMealId(firstMeal.id);
    }
  }, [meals, selectedMealId]);

  const selectedMeal = useMemo(
    () => meals.find((meal) => meal.id === selectedMealId) ?? null,
    [meals, selectedMealId],
  );

  useEffect(() => {
    if (!selectedMeal) {
      setActualCalories("");
      setActualProtein("");
      setActualCarbs("");
      setActualFat("");
      setCompleted(false);
      return;
    }
    setActualCalories(
      (
        selectedMeal.latest_log?.actual_calories ??
        selectedMeal.calories ??
        ""
      ).toString(),
    );
    setActualProtein(
      (
        selectedMeal.latest_log?.actual_protein_g ??
        selectedMeal.protein_g ??
        ""
      ).toString(),
    );
    setActualCarbs(
      (
        selectedMeal.latest_log?.actual_carbs_g ??
        selectedMeal.carbs_g ??
        ""
      ).toString(),
    );
    setActualFat(
      (
        selectedMeal.latest_log?.actual_fat_g ??
        selectedMeal.fat_g ??
        ""
      ).toString(),
    );
    setCompleted(Boolean(selectedMeal.latest_log?.is_completed));
  }, [selectedMeal]);

  const totals = useMemo(() => {
    const planned = meals.reduce(
      (acc, meal) => {
        acc.calories += n(meal.calories);
        acc.protein_g += n(meal.protein_g);
        acc.carbs_g += n(meal.carbs_g);
        acc.fat_g += n(meal.fat_g);
        return acc;
      },
      { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 },
    );

    const actual = meals.reduce(
      (acc, meal) => {
        acc.calories += n(meal.latest_log?.actual_calories ?? meal.calories);
        acc.protein_g += n(meal.latest_log?.actual_protein_g ?? meal.protein_g);
        acc.carbs_g += n(meal.latest_log?.actual_carbs_g ?? meal.carbs_g);
        acc.fat_g += n(meal.latest_log?.actual_fat_g ?? meal.fat_g);
        return acc;
      },
      { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 },
    );

    return { planned, actual };
  }, [meals]);

  const toIntOrNull = (value: string) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.round(parsed) : null;
  };

  const toNumOrNull = (value: string) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  };

  const saveMealLog = async () => {
    if (!selectedMeal) return;

    setSaving(true);
    setSaveError(null);

    const payload = {
      assigned_nutrition_meal_id: selectedMeal.id,
      is_completed: completed,
      actual_calories: toIntOrNull(actualCalories),
      actual_protein_g: toNumOrNull(actualProtein),
      actual_carbs_g: toNumOrNull(actualCarbs),
      actual_fat_g: toNumOrNull(actualFat),
      consumed_at: new Date().toISOString(),
    };

    const existingLogId = selectedMeal.latest_log?.id ?? null;
    const query = existingLogId
      ? supabase
          .from("nutrition_meal_logs")
          .update(payload)
          .eq("id", existingLogId)
      : supabase.from("nutrition_meal_logs").insert(payload);

    const { error } = await query;
    if (error) {
      setSaveError(error.message);
      setSaving(false);
      return;
    }

    await queryClient.invalidateQueries({
      queryKey: ["assigned-nutrition-meals-v1", assignedDayId],
    });
    setSaving(false);
  };

  if (dayQuery.isLoading || mealsQuery.isLoading) {
    return (
      <PageContainer className="max-w-screen-2xl space-y-4">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-[520px] w-full" />
          ))}
        </div>
      </PageContainer>
    );
  }

  if (!dayQuery.data) {
    return (
      <PageContainer className="max-w-screen-2xl">
        <EmptyState
          title="Nutrition day not found"
          description="No assigned nutrition was found for this day."
        />
      </PageContainer>
    );
  }

  return (
    <PageContainer className="max-w-screen-2xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
            Client Portal
          </div>
          <h2 className="text-2xl font-semibold tracking-tight">
            Nutrition Day
          </h2>
          <p className="text-sm text-muted-foreground">{dayQuery.data.date}</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="muted">{sourceLabel}</Badge>
          <StatusPill
            status={
              mealsQuery.completion.percent === 100 &&
              mealsQuery.completion.total > 0
                ? "completed"
                : "planned"
            }
          />
          <Button variant="secondary" onClick={() => navigate("/app/nutrition")}>
            Back
          </Button>
        </div>
      </div>

      {meals.length === 0 ? (
        <EmptyState
          title="No meals assigned"
          description="This nutrition day has no meals yet."
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <DashboardCard title="Meals" subtitle="Tap to edit completion">
            <div className="space-y-2">
              {meals.map((meal) => {
                const isSelected = meal.id === selectedMealId;
                const done = Boolean(meal.latest_log?.is_completed);
                return (
                  <button
                    key={meal.id}
                    type="button"
                    onClick={() => setSelectedMealId(meal.id)}
                    className={`w-full rounded-lg border px-3 py-2 text-left ${isSelected ? "border-primary/60 bg-primary/10" : "border-border/60 bg-muted/20"}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-medium">{meal.meal_name}</p>
                      <Badge variant={done ? "success" : "muted"}>
                        {done ? "Done" : "Pending"}
                      </Badge>
                    </div>
                  </button>
                );
              })}
            </div>
          </DashboardCard>

          <DashboardCard title="Meal Detail" subtitle="Update actual intake">
            {!selectedMeal ? (
              <EmptyState
                title="Select a meal"
                description="Choose a meal from the left rail."
              />
            ) : (
              <div className="space-y-3">
                <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
                  <p className="font-semibold">{selectedMeal.meal_name}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {formatMacroLine(selectedMeal)}
                  </p>
                </div>

                {dayQuery.data.notes ? (
                  <div className="rounded-lg border border-border/60 bg-background/45 p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Day note
                    </p>
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-6">
                      {dayQuery.data.notes}
                    </p>
                  </div>
                ) : null}

                {selectedMeal.notes || selectedMeal.recipe_text ? (
                  <div className="rounded-lg border border-border/60 bg-background/45 p-3">
                    {selectedMeal.notes ? (
                      <div className="space-y-1">
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Meal note
                        </p>
                        <p className="whitespace-pre-wrap text-sm leading-6">
                          {selectedMeal.notes}
                        </p>
                      </div>
                    ) : null}
                    {selectedMeal.recipe_text ? (
                      <div className={selectedMeal.notes ? "mt-3 space-y-1" : "space-y-1"}>
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Instructions
                        </p>
                        <p className="whitespace-pre-wrap text-sm leading-6">
                          {selectedMeal.recipe_text}
                        </p>
                      </div>
                    ) : null}
                  </div>
                ) : null}

                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Meal components
                  </p>
                  {selectedMeal.components.length > 0 ? (
                    <div className="space-y-2">
                      {selectedMeal.components.map((component) => (
                        <div
                          key={component.id}
                          className="rounded-lg border border-border/60 bg-muted/20 p-3"
                        >
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div>
                              <p className="font-medium">
                                {component.component_name}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {formatServing(component.quantity, component.unit)}
                              </p>
                            </div>
                            <Badge variant="muted">
                              {formatMacroLine(component)}
                            </Badge>
                          </div>
                          {component.recipe_text ? (
                            <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
                              {component.recipe_text}
                            </p>
                          ) : null}
                          {component.notes ? (
                            <div className="mt-2 rounded-md border border-border/50 bg-background/45 p-2">
                              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                Note
                              </p>
                              <p className="mt-1 whitespace-pre-wrap text-sm leading-6">
                                {component.notes}
                              </p>
                            </div>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="rounded-lg border border-border/60 bg-muted/20 p-3 text-sm text-muted-foreground">
                      No meal components have been added yet.
                    </p>
                  )}
                </div>

                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={completed}
                    onChange={(e) => setCompleted(e.target.checked)}
                  />
                  Mark complete
                </label>

                <div className="grid grid-cols-2 gap-2">
                  <Input
                    placeholder="Actual calories"
                    value={actualCalories}
                    onChange={(e) => setActualCalories(e.target.value)}
                  />
                  <Input
                    placeholder="Actual protein"
                    value={actualProtein}
                    onChange={(e) => setActualProtein(e.target.value)}
                  />
                  <Input
                    placeholder="Actual carbs"
                    value={actualCarbs}
                    onChange={(e) => setActualCarbs(e.target.value)}
                  />
                  <Input
                    placeholder="Actual fat"
                    value={actualFat}
                    onChange={(e) => setActualFat(e.target.value)}
                  />
                </div>

                {saveError ? (
                  <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
                    {saveError}
                  </div>
                ) : null}

                <Button onClick={saveMealLog} disabled={saving}>
                  {saving ? "Saving..." : "Save meal log"}
                </Button>
              </div>
            )}
          </DashboardCard>

          <DashboardCard title="Summary" subtitle="Planned vs actual">
            <div className="space-y-3 text-sm">
              <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
                <p className="text-xs text-muted-foreground">Completion</p>
                <p className="font-semibold">
                  {mealsQuery.completion.completed}/
                  {mealsQuery.completion.total} meals (
                  {mealsQuery.completion.percent}%)
                </p>
              </div>

              <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
                <p className="mb-2 text-xs text-muted-foreground">
                  Planned totals
                </p>
                <p>{Math.round(totals.planned.calories)} cals</p>
                <p>
                  {Math.round(totals.planned.protein_g)}p /{" "}
                  {Math.round(totals.planned.carbs_g)}c /{" "}
                  {Math.round(totals.planned.fat_g)}f
                </p>
              </div>

              <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
                <p className="mb-2 text-xs text-muted-foreground">
                  Actual totals
                </p>
                <p>{Math.round(totals.actual.calories)} cals</p>
                <p>
                  {Math.round(totals.actual.protein_g)}p /{" "}
                  {Math.round(totals.actual.carbs_g)}c /{" "}
                  {Math.round(totals.actual.fat_g)}f
                </p>
              </div>
            </div>
          </DashboardCard>
        </div>
      )}
    </PageContainer>
  );
}

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "./supabase";

export type MacroTotals = {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
};

export type NutritionTemplateMealComponent = {
  id: string;
  nutrition_template_meal_id: string;
  sort_order: number;
  component_name: string;
  quantity: number | null;
  unit: string | null;
  calories: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  recipe_text: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type NutritionTemplateMeal = {
  id: string;
  nutrition_template_day_id: string;
  meal_order: number;
  meal_name: string;
  recipe_text: string | null;
  calories: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  components: NutritionTemplateMealComponent[];
};

export type NutritionTemplateDay = {
  id: string;
  nutrition_template_id: string;
  week_index: number;
  day_of_week: number;
  title: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  meals: NutritionTemplateMeal[];
};

export type NutritionTemplate = {
  id: string;
  workspace_id: string;
  name: string;
  description: string | null;
  duration_weeks: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  days: NutritionTemplateDay[];
  totals: MacroTotals;
  meal_count: number;
};

export type AssignedNutritionPlan = {
  id: string;
  client_id: string;
  nutrition_template_id: string;
  start_date: string;
  end_date: string;
  status: "active" | "completed" | "cancelled";
  created_at: string;
  updated_at: string;
  nutrition_template?: {
    id: string;
    name: string;
    duration_weeks: number;
  } | null;
};

export type NutritionMealLog = {
  id: string;
  assigned_nutrition_meal_id: string;
  consumed_at: string;
  is_completed: boolean;
  actual_calories: number | null;
  actual_protein_g: number | null;
  actual_carbs_g: number | null;
  actual_fat_g: number | null;
  created_at: string;
  updated_at: string;
};

export type AssignedNutritionMealComponent = {
  id: string;
  assigned_nutrition_meal_id: string;
  template_component_id: string | null;
  sort_order: number;
  component_name: string;
  quantity: number | null;
  unit: string | null;
  calories: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  recipe_text: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type AssignedNutritionMeal = {
  id: string;
  assigned_nutrition_day_id: string;
  template_meal_id: string | null;
  meal_order: number;
  meal_name: string;
  recipe_text: string | null;
  calories: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  components: AssignedNutritionMealComponent[];
  latest_log?: NutritionMealLog | null;
};

export type AssignedNutritionDay = {
  id: string;
  assigned_nutrition_plan_id: string;
  date: string;
  week_index: number;
  day_of_week: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
  plan?: AssignedNutritionPlan | null;
};

const n = (value: number | null | undefined) => (typeof value === "number" ? value : 0);

export const sumMacros = (
  rows: Array<{
    calories?: number | null;
    protein_g?: number | null;
    carbs_g?: number | null;
    fat_g?: number | null;
  }>
): MacroTotals => {
  return rows.reduce<MacroTotals>(
    (acc, row) => {
      acc.calories += n(row.calories);
      acc.protein_g += n(row.protein_g);
      acc.carbs_g += n(row.carbs_g);
      acc.fat_g += n(row.fat_g);
      return acc;
    },
    { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }
  );
};

const hydrateTemplate = (
  templateRows: Array<Omit<NutritionTemplate, "days" | "totals" | "meal_count">>,
  dayRows: Array<Omit<NutritionTemplateDay, "meals">>,
  mealRows: Array<Omit<NutritionTemplateMeal, "components">>,
  componentRows: NutritionTemplateMealComponent[]
): NutritionTemplate[] => {
  return templateRows.map((template) => {
    const templateDays: NutritionTemplateDay[] = dayRows
      .filter((day) => day.nutrition_template_id === template.id)
      .map((day) => {
        const mealsForDay: NutritionTemplateMeal[] = mealRows
          .filter((meal) => meal.nutrition_template_day_id === day.id)
          .sort((a, b) => a.meal_order - b.meal_order)
          .map((meal) => ({
            ...meal,
            components: componentRows
              .filter((component) => component.nutrition_template_meal_id === meal.id)
              .sort((a, b) => a.sort_order - b.sort_order),
          }));

        return {
          ...day,
          meals: mealsForDay,
        };
      });

    const allComponents = templateDays.flatMap((day) => day.meals.flatMap((meal) => meal.components));
    const fallbackMeals = templateDays.flatMap((day) => day.meals);
    const totals = allComponents.length > 0 ? sumMacros(allComponents) : sumMacros(fallbackMeals);

    return {
      ...template,
      days: templateDays,
      totals,
      meal_count: templateDays.reduce((sum, day) => sum + day.meals.length, 0),
    };
  });
};

export function useNutritionTemplates(workspaceId: string | null) {
  return useQuery({
    queryKey: ["nutrition-templates-v1", workspaceId],
    enabled: !!workspaceId,
    queryFn: async () => {
      const { data: templates, error: templateError } = await supabase
        .from("nutrition_templates")
        .select("id, workspace_id, name, description, duration_weeks, is_active, created_at, updated_at")
        .eq("workspace_id", workspaceId ?? "")
        .order("created_at", { ascending: false });
      if (templateError) throw templateError;

      const templateRows = (templates ?? []) as Array<Omit<NutritionTemplate, "days" | "totals" | "meal_count">>;
      const templateIds = templateRows.map((row) => row.id);
      if (!templateIds.length) return [] as NutritionTemplate[];

      const { data: days, error: daysError } = await supabase
        .from("nutrition_template_days")
        .select("id, nutrition_template_id, week_index, day_of_week, title, notes, created_at, updated_at")
        .in("nutrition_template_id", templateIds)
        .order("week_index", { ascending: true })
        .order("day_of_week", { ascending: true });
      if (daysError) throw daysError;

      const dayRows = (days ?? []) as Array<Omit<NutritionTemplateDay, "meals">>;
      const dayIds = dayRows.map((row) => row.id);

      const { data: meals, error: mealsError } = dayIds.length
        ? await supabase
            .from("nutrition_template_meals")
            .select("id, nutrition_template_day_id, meal_order, meal_name, recipe_text, calories, protein_g, carbs_g, fat_g, notes, created_at, updated_at")
            .in("nutrition_template_day_id", dayIds)
            .order("meal_order", { ascending: true })
        : { data: [], error: null };
      if (mealsError) throw mealsError;

      const mealRows = (meals ?? []) as Array<Omit<NutritionTemplateMeal, "components">>;
      const mealIds = mealRows.map((row) => row.id);

      const { data: components, error: componentError } = mealIds.length
        ? await supabase
            .from("nutrition_template_meal_components")
            .select("id, nutrition_template_meal_id, sort_order, component_name, quantity, unit, calories, protein_g, carbs_g, fat_g, recipe_text, notes, created_at, updated_at")
            .in("nutrition_template_meal_id", mealIds)
            .order("sort_order", { ascending: true })
        : { data: [], error: null };
      if (componentError) throw componentError;

      const componentRows = (components ?? []) as NutritionTemplateMealComponent[];

      return hydrateTemplate(templateRows, dayRows, mealRows, componentRows);
    },
  });
}

export function useNutritionTemplate(templateId: string | null) {
  return useQuery({
    queryKey: ["nutrition-template-v1", templateId],
    enabled: !!templateId,
    queryFn: async () => {
      const { data: template, error: templateError } = await supabase
        .from("nutrition_templates")
        .select("id, workspace_id, name, description, duration_weeks, is_active, created_at, updated_at")
        .eq("id", templateId ?? "")
        .maybeSingle();
      if (templateError) throw templateError;
      if (!template) return null;

      const templateRows = [template as Omit<NutritionTemplate, "days" | "totals" | "meal_count">];

      const { data: days, error: daysError } = await supabase
        .from("nutrition_template_days")
        .select("id, nutrition_template_id, week_index, day_of_week, title, notes, created_at, updated_at")
        .eq("nutrition_template_id", template.id)
        .order("week_index", { ascending: true })
        .order("day_of_week", { ascending: true });
      if (daysError) throw daysError;

      const dayRows = (days ?? []) as Array<Omit<NutritionTemplateDay, "meals">>;
      const dayIds = dayRows.map((row) => row.id);

      const { data: meals, error: mealsError } = dayIds.length
        ? await supabase
            .from("nutrition_template_meals")
            .select("id, nutrition_template_day_id, meal_order, meal_name, recipe_text, calories, protein_g, carbs_g, fat_g, notes, created_at, updated_at")
            .in("nutrition_template_day_id", dayIds)
            .order("meal_order", { ascending: true })
        : { data: [], error: null };
      if (mealsError) throw mealsError;

      const mealRows = (meals ?? []) as Array<Omit<NutritionTemplateMeal, "components">>;
      const mealIds = mealRows.map((row) => row.id);

      const { data: components, error: componentError } = mealIds.length
        ? await supabase
            .from("nutrition_template_meal_components")
            .select("id, nutrition_template_meal_id, sort_order, component_name, quantity, unit, calories, protein_g, carbs_g, fat_g, recipe_text, notes, created_at, updated_at")
            .in("nutrition_template_meal_id", mealIds)
            .order("sort_order", { ascending: true })
        : { data: [], error: null };
      if (componentError) throw componentError;

      const componentRows = (components ?? []) as NutritionTemplateMealComponent[];
      return hydrateTemplate(templateRows, dayRows, mealRows, componentRows)[0] ?? null;
    },
  });
}

export function useAssignedNutritionDay(assignedDayId: string | null) {
  return useQuery({
    queryKey: ["assigned-nutrition-day-v1", assignedDayId],
    enabled: !!assignedDayId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("assigned_nutrition_days")
        .select(
          "id, assigned_nutrition_plan_id, date, week_index, day_of_week, notes, created_at, updated_at, plan:assigned_nutrition_plans(id, client_id, nutrition_template_id, start_date, end_date, status, created_at, updated_at, nutrition_template:nutrition_templates(id, name, duration_weeks))"
        )
        .eq("id", assignedDayId ?? "")
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as AssignedNutritionDay | null;
    },
  });
}

export function useAssignedNutritionMeals(assignedDayId: string | null) {
  const query = useQuery({
    queryKey: ["assigned-nutrition-meals-v1", assignedDayId],
    enabled: !!assignedDayId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("assigned_nutrition_meals")
        .select(
          "id, assigned_nutrition_day_id, template_meal_id, meal_order, meal_name, recipe_text, calories, protein_g, carbs_g, fat_g, notes, created_at, updated_at, logs:nutrition_meal_logs(id, assigned_nutrition_meal_id, consumed_at, is_completed, actual_calories, actual_protein_g, actual_carbs_g, actual_fat_g, created_at, updated_at)"
        )
        .eq("assigned_nutrition_day_id", assignedDayId ?? "")
        .order("meal_order", { ascending: true });
      if (error) throw error;

      const rows = (data ?? []) as Array<AssignedNutritionMeal & { logs?: NutritionMealLog[] }>;
      const mealIds = rows.map((row) => row.id);

      const { data: components, error: componentError } = mealIds.length
        ? await supabase
            .from("assigned_nutrition_meal_components")
            .select("id, assigned_nutrition_meal_id, template_component_id, sort_order, component_name, quantity, unit, calories, protein_g, carbs_g, fat_g, recipe_text, notes, created_at, updated_at")
            .in("assigned_nutrition_meal_id", mealIds)
            .order("sort_order", { ascending: true })
        : { data: [], error: null };
      if (componentError) throw componentError;

      const componentRows = (components ?? []) as AssignedNutritionMealComponent[];

      return rows.map((row) => {
        const logs = (row.logs ?? []).slice().sort((a, b) => (a.consumed_at < b.consumed_at ? 1 : -1));
        const latest_log = logs[0] ?? null;
        const { logs: _logs, ...rest } = row;
        return {
          ...rest,
          latest_log,
          components: componentRows
            .filter((component) => component.assigned_nutrition_meal_id === row.id)
            .sort((a, b) => a.sort_order - b.sort_order),
        } as AssignedNutritionMeal;
      });
    },
  });

  const totals = useMemo(() => {
    const rows = query.data ?? [];
    return sumMacros(
      rows.map((meal) => {
        if (meal.components.length > 0) {
          const c = sumMacros(meal.components);
          return c;
        }
        return meal;
      })
    );
  }, [query.data]);

  const completion = useMemo(() => {
    const rows = query.data ?? [];
    const total = rows.length;
    const completed = rows.filter((row) => row.latest_log?.is_completed).length;
    return {
      completed,
      total,
      percent: total > 0 ? Math.round((completed / total) * 100) : 0,
    };
  }, [query.data]);

  return {
    ...query,
    totals,
    completion,
  };
}

export function useAssignedNutritionByDate(clientId: string | null, fromDate: string, toDate: string) {
  return useQuery({
    queryKey: ["assigned-nutrition-days-range-v1", clientId, fromDate, toDate],
    enabled: !!clientId,
    queryFn: async () => {
      const { data: plans, error: planError } = await supabase
        .from("assigned_nutrition_plans")
        .select("id")
        .eq("client_id", clientId ?? "");
      if (planError) throw planError;

      const planIds = (plans ?? []).map((row: { id: string }) => row.id);
      if (!planIds.length) return [] as AssignedNutritionDay[];

      const { data, error } = await supabase
        .from("assigned_nutrition_days")
        .select("id, assigned_nutrition_plan_id, date, week_index, day_of_week, notes, created_at, updated_at")
        .in("assigned_nutrition_plan_id", planIds)
        .gte("date", fromDate)
        .lte("date", toDate)
        .order("date", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as AssignedNutritionDay[];
    },
  });
}

import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion, useReducedMotion } from "framer-motion";
import { ChevronDown, Copy, Plus, X } from "lucide-react";
import { ActionStatusMessage } from "../../components/common/action-feedback";
import {
  EmptyStateBlock,
  PortalPageHeader,
  SectionCard,
} from "../../components/client/portal";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Select } from "../../components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
import { useBootstrapAuth, useSessionAuth } from "../../lib/auth";
import { getTodayInTimezone } from "../../lib/date-utils";
import { supabase } from "../../lib/supabase";

type ClientProfileRow = { id: string; timezone: string | null };
type PersonalMealComponentDraft = {
  componentName: string;
  quantity: string;
  unit: string;
  calories: string;
  protein: string;
  carbs: string;
  fat: string;
};
type PersonalMealDraft = {
  mealName: string;
  notes: string;
  components: PersonalMealComponentDraft[];
};
type CleanComponent = {
  component_name: string;
  quantity: number | null;
  unit: string | null;
  calories: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
};
type CleanMeal = {
  meal_name: string;
  meal_order: number;
  notes: string | null;
  calories: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  components: CleanComponent[];
};

const DAY_TABS = [
  { day: 1, label: "Mon" },
  { day: 2, label: "Tue" },
  { day: 3, label: "Wed" },
  { day: 4, label: "Thu" },
  { day: 5, label: "Fri" },
  { day: 6, label: "Sat" },
  { day: 7, label: "Sun" },
];
const dayTabValue = (day: number) => `day-${day}`;

const createComponentDraft = (): PersonalMealComponentDraft => ({
  componentName: "",
  quantity: "",
  unit: "g",
  calories: "",
  protein: "",
  carbs: "",
  fat: "",
});
const createMealDraft = (): PersonalMealDraft => ({
  mealName: "",
  notes: "",
  components: [createComponentDraft()],
});
const cloneMealDraft = (meal: PersonalMealDraft): PersonalMealDraft => ({
  mealName: meal.mealName,
  notes: meal.notes,
  components: meal.components.map((component) => ({ ...component })),
});
const createWeekMealsDraft = (): PersonalMealDraft[][] =>
  Array.from({ length: 7 }, () => [createMealDraft()]);
const normalizeMealDraftSignature = (meal: PersonalMealDraft) =>
  JSON.stringify({
    mealName: meal.mealName.trim().toLowerCase(),
    notes: meal.notes.trim().toLowerCase(),
    components: meal.components.map((component) => ({
      componentName: component.componentName.trim().toLowerCase(),
      quantity: component.quantity.trim(),
      unit: component.unit.trim().toLowerCase(),
      calories: component.calories.trim(),
      protein: component.protein.trim(),
      carbs: component.carbs.trim(),
      fat: component.fat.trim(),
    })),
  });
const mealHasDraftContent = (meal: PersonalMealDraft) =>
  meal.mealName.trim().length > 0 ||
  meal.notes.trim().length > 0 ||
  meal.components.some((component) =>
    [
      component.componentName,
      component.quantity,
      component.unit,
      component.calories,
      component.protein,
      component.carbs,
      component.fat,
    ].some((value) => value.trim().length > 0),
  );

const toIntOrNull = (value: string) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed) : null;
};
const toNumOrNull = (value: string) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const sumComponents = (components: CleanComponent[]) =>
  components.reduce(
    (acc, component) => ({
      calories: acc.calories + (component.calories ?? 0),
      protein_g: acc.protein_g + (component.protein_g ?? 0),
      carbs_g: acc.carbs_g + (component.carbs_g ?? 0),
      fat_g: acc.fat_g + (component.fat_g ?? 0),
    }),
    { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 },
  );

const UNIT_OPTIONS = ["g", "kg", "ml", "l", "oz", "lb", "cup", "tbsp", "tsp", "piece", "serving"];

export function ClientNutritionCreatePlanPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const reduceMotion = useReducedMotion();
  const { session } = useSessionAuth();
  const { activeClientId } = useBootstrapAuth();

  const [selectedDay, setSelectedDay] = useState(1);
  const [planName, setPlanName] = useState("");
  const [planDescription, setPlanDescription] = useState("");
  const [planStartDate, setPlanStartDate] = useState("");
  const [weekMeals, setWeekMeals] = useState<PersonalMealDraft[][]>(createWeekMealsDraft());
  const [expandedMeals, setExpandedMeals] = useState<Record<string, boolean>>({});
  const [duplicationMessage, setDuplicationMessage] = useState<{
    tone: "success" | "info";
    text: string;
  } | null>(null);

  const clientQuery = useQuery({
    queryKey: ["client-nutrition-create-profile", session?.user?.id],
    enabled: !!session?.user?.id,
    queryFn: async (): Promise<ClientProfileRow | null> => {
      if (!session?.user?.id) return null;
      const { data, error } = await supabase
        .from("client_profiles")
        .select("id, timezone")
        .eq("auth_user_id", session.user.id)
        .maybeSingle();
      if (error) throw error;
      return data as ClientProfileRow | null;
    },
  });

  const clientId = activeClientId ?? clientQuery.data?.id ?? null;
  const timezone = clientQuery.data?.timezone ?? "UTC";
  const todayKey = getTodayInTimezone(timezone);
  const selectedDayMeals = useMemo(
    () => weekMeals[selectedDay - 1] ?? [],
    [selectedDay, weekMeals],
  );

  const selectedDayMacros = useMemo(
    () =>
      selectedDayMeals.reduce(
        (acc, meal) => {
          const cleanComponents = meal.components
            .map((component) => ({
              component_name: component.componentName.trim(),
              quantity: toNumOrNull(component.quantity),
              unit: component.unit.trim() || null,
              calories: toIntOrNull(component.calories),
              protein_g: toNumOrNull(component.protein),
              carbs_g: toNumOrNull(component.carbs),
              fat_g: toNumOrNull(component.fat),
            }))
            .filter((component) => component.component_name.length > 0);
          const componentTotals = sumComponents(cleanComponents);
          return {
            calories: acc.calories + componentTotals.calories,
            protein_g: acc.protein_g + componentTotals.protein_g,
            carbs_g: acc.carbs_g + componentTotals.carbs_g,
            fat_g: acc.fat_g + componentTotals.fat_g,
          };
        },
        { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 },
      ),
    [selectedDayMeals],
  );
  const updateSelectedDayMeals = (updater: (previous: PersonalMealDraft[]) => PersonalMealDraft[]) => {
    setWeekMeals((previous) =>
      previous.map((dayMeals, dayIndex) => (dayIndex === selectedDay - 1 ? updater(dayMeals) : dayMeals)),
    );
  };
  const mealKey = (day: number, mealIndex: number) => `day-${day}-meal-${mealIndex}`;
  const isMealExpanded = (day: number, mealIndex: number) => {
    const key = mealKey(day, mealIndex);
    return expandedMeals[key] ?? mealIndex === 0;
  };
  const toggleMealExpanded = (mealIndex: number) => {
    const key = mealKey(selectedDay, mealIndex);
    setExpandedMeals((previous) => ({ ...previous, [key]: !(previous[key] ?? mealIndex === 0) }));
  };

  const addMeal = () => {
    const nextIndex = selectedDayMeals.length;
    updateSelectedDayMeals((previous) => [...previous, createMealDraft()]);
    setExpandedMeals((previous) => ({ ...previous, [mealKey(selectedDay, nextIndex)]: true }));
    setDuplicationMessage(null);
  };
  const removeMeal = (mealIndex: number) => {
    updateSelectedDayMeals((previous) =>
      previous.length <= 1 ? previous : previous.filter((_, index) => index !== mealIndex),
    );
    setDuplicationMessage(null);
  };
  const updateMealField = (mealIndex: number, field: keyof Omit<PersonalMealDraft, "components">, value: string) => {
    updateSelectedDayMeals((previous) =>
      previous.map((meal, index) => (index === mealIndex ? { ...meal, [field]: value } : meal)),
    );
    setDuplicationMessage(null);
  };
  const addMealComponent = (mealIndex: number) => {
    updateSelectedDayMeals((previous) =>
      previous.map((meal, index) =>
        index === mealIndex ? { ...meal, components: [...meal.components, createComponentDraft()] } : meal,
      ),
    );
    setDuplicationMessage(null);
  };
  const removeMealComponent = (mealIndex: number, componentIndex: number) => {
    updateSelectedDayMeals((previous) =>
      previous.map((meal, index) => {
        if (index !== mealIndex || meal.components.length <= 1) return meal;
        return {
          ...meal,
          components: meal.components.filter((_, rowIndex) => rowIndex !== componentIndex),
        };
      }),
    );
    setDuplicationMessage(null);
  };
  const updateMealComponentField = (
    mealIndex: number,
    componentIndex: number,
    field: keyof PersonalMealComponentDraft,
    value: string,
  ) => {
    updateSelectedDayMeals((previous) =>
      previous.map((meal, index) => {
        if (index !== mealIndex) return meal;
        return {
          ...meal,
          components: meal.components.map((component, rowIndex) =>
            rowIndex === componentIndex ? { ...component, [field]: value } : component,
          ),
        };
      }),
    );
    setDuplicationMessage(null);
  };
  const duplicateMealToAllDays = (mealIndex: number) => {
    const sourceMeal = selectedDayMeals[mealIndex];
    if (!sourceMeal || !mealHasDraftContent(sourceMeal)) return;

    const sourceSignature = normalizeMealDraftSignature(sourceMeal);
    let addedCount = 0;
    let skippedCount = 0;

    setWeekMeals((previous) =>
      previous.map((dayMeals, dayIndex) => {
        if (dayIndex === selectedDay - 1) return dayMeals;
        if (dayMeals.some((meal) => normalizeMealDraftSignature(meal) === sourceSignature)) {
          skippedCount += 1;
          return dayMeals;
        }
        addedCount += 1;
        return [...dayMeals, cloneMealDraft(sourceMeal)];
      }),
    );

    const mealLabel = sourceMeal.mealName.trim() || `Meal ${mealIndex + 1}`;
    if (addedCount > 0 && skippedCount > 0) {
      setDuplicationMessage({
        tone: "success",
        text: `"${mealLabel}" was added to ${addedCount} ${addedCount === 1 ? "day" : "days"} and skipped on ${skippedCount} where it already exists.`,
      });
      return;
    }
    if (addedCount > 0) {
      setDuplicationMessage({
        tone: "success",
        text: `"${mealLabel}" was added to ${addedCount} ${addedCount === 1 ? "day" : "days"}.`,
      });
      return;
    }
    setDuplicationMessage({
      tone: "info",
      text: `"${mealLabel}" is already present across the other days in this plan.`,
    });
  };

  const createPersonalPlanMutation = useMutation({
    mutationFn: async () => {
      if (!clientId) throw new Error("Client profile is required.");
      const safePlanName = planName.trim();
      if (!safePlanName) throw new Error("Plan name is required.");
      const safeStartDate = planStartDate || todayKey;
      if (!safeStartDate) throw new Error("Start date is required.");

      const cleanedPlanByDay: CleanMeal[][] = weekMeals.map((dayMeals) => {
        const validMeals = dayMeals
          .map((meal) => {
            const cleanedComponents = meal.components
              .map((component) => ({
                component_name: component.componentName.trim(),
                quantity: toNumOrNull(component.quantity),
                unit: component.unit.trim() || null,
                calories: toIntOrNull(component.calories),
                protein_g: toNumOrNull(component.protein),
                carbs_g: toNumOrNull(component.carbs),
                fat_g: toNumOrNull(component.fat),
              }))
              .filter((component) => component.component_name.length > 0);

            if (!meal.mealName.trim() || cleanedComponents.length === 0) return null;
            const totals = sumComponents(cleanedComponents);
            return {
              meal_name: meal.mealName.trim(),
              meal_order: 0,
              notes: meal.notes.trim() || null,
              calories: Math.round(totals.calories),
              protein_g: totals.protein_g,
              carbs_g: totals.carbs_g,
              fat_g: totals.fat_g,
              components: cleanedComponents,
            } as CleanMeal;
          })
          .filter((meal): meal is CleanMeal => meal !== null);
        return validMeals.map((meal, index) => ({ ...meal, meal_order: index + 1 }));
      });

      const totalMeals = cleanedPlanByDay.reduce((sum, dayMeals) => sum + dayMeals.length, 0);
      if (totalMeals === 0) {
        throw new Error("Add at least one meal with at least one component before creating the plan.");
      }

      const { data: template, error: templateError } = await supabase
        .from("nutrition_templates")
        .insert({
          workspace_id: null,
          owner_client_id: clientId,
          name: safePlanName,
          description: planDescription.trim() || null,
          duration_weeks: 1,
          is_active: true,
        })
        .select("id")
        .maybeSingle();
      if (templateError || !template?.id) {
        throw new Error(templateError?.message ?? "Failed to create personal template.");
      }

      const templateId = template.id as string;
      const { data: insertedDays, error: daysError } = await supabase
        .from("nutrition_template_days")
        .insert(
          Array.from({ length: 7 }).map((_, index) => ({
            nutrition_template_id: templateId,
            week_index: 1,
            day_of_week: index + 1,
            title: `Day ${index + 1}`,
            notes: null,
          })),
        )
        .select("id, day_of_week");
      if (daysError || !(insertedDays ?? []).length) throw new Error(daysError?.message ?? "Failed to create plan days.");

      const dayIdByDayOfWeek = new Map<number, string>();
      (insertedDays ?? []).forEach((day) =>
        dayIdByDayOfWeek.set((day as { day_of_week: number }).day_of_week, (day as { id: string }).id),
      );

      const mealPayload = cleanedPlanByDay.flatMap((dayMeals, dayIndex) => {
        const dayId = dayIdByDayOfWeek.get(dayIndex + 1);
        if (!dayId) return [];
        return dayMeals.map((meal) => ({
          nutrition_template_day_id: dayId,
          meal_order: meal.meal_order,
          meal_name: meal.meal_name,
          calories: meal.calories,
          protein_g: meal.protein_g,
          carbs_g: meal.carbs_g,
          fat_g: meal.fat_g,
          notes: meal.notes,
          recipe_text: null,
        }));
      });
      if (mealPayload.length === 0) throw new Error("No valid meals found to create this plan.");

      const { data: insertedMeals, error: mealsError } = await supabase
        .from("nutrition_template_meals")
        .insert(mealPayload)
        .select("id, nutrition_template_day_id, meal_order");
      if (mealsError || !(insertedMeals ?? []).length) throw new Error(mealsError?.message ?? "Failed to create plan meals.");

      const mealIdByDayAndOrder = new Map<string, string>();
      (insertedMeals ?? []).forEach((meal) => {
        const row = meal as { id: string; nutrition_template_day_id: string; meal_order: number };
        mealIdByDayAndOrder.set(`${row.nutrition_template_day_id}:${row.meal_order}`, row.id);
      });

      const componentPayload = cleanedPlanByDay.flatMap((dayMeals, dayIndex) => {
        const dayId = dayIdByDayOfWeek.get(dayIndex + 1);
        if (!dayId) return [];
        return dayMeals.flatMap((meal) => {
          const mealId = mealIdByDayAndOrder.get(`${dayId}:${meal.meal_order}`);
          if (!mealId) return [];
          return meal.components.map((component, componentIndex) => ({
            nutrition_template_meal_id: mealId,
            sort_order: componentIndex + 1,
            component_name: component.component_name,
            quantity: component.quantity,
            unit: component.unit,
            calories: component.calories,
            protein_g: component.protein_g,
            carbs_g: component.carbs_g,
            fat_g: component.fat_g,
            recipe_text: null,
            notes: null,
          }));
        });
      });
      if (componentPayload.length > 0) {
        const { error: componentsError } = await supabase
          .from("nutrition_template_meal_components")
          .insert(componentPayload);
        if (componentsError) throw new Error(componentsError.message);
      }

      const { error: assignError } = await supabase.rpc("assign_nutrition_template_to_client", {
        p_client_id: clientId,
        p_template_id: templateId,
        p_start_date: safeStartDate,
      });
      if (assignError) throw new Error(assignError.message);
      return templateId;
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["client-nutrition-plans", clientId] }),
        queryClient.invalidateQueries({ queryKey: ["client-nutrition-days"] }),
        queryClient.invalidateQueries({ queryKey: ["client-nutrition-meals"] }),
        queryClient.invalidateQueries({ queryKey: ["assigned-nutrition-today"] }),
        queryClient.invalidateQueries({ queryKey: ["assigned-nutrition-week"] }),
        queryClient.invalidateQueries({ queryKey: ["client-personal-nutrition-templates", clientId] }),
      ]);
      navigate("/app/nutrition");
    },
  });

  if (!clientId) {
    return (
      <div className="space-y-6">
        <PortalPageHeader title="Create Personal Plan" subtitle="Set up a 1-week nutrition plan using the shared nutrition system." />
        <EmptyStateBlock
          title="Client profile not found"
          description="Finish onboarding to create your personal nutrition plan."
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
    <div className="space-y-6 pb-6">
      <PortalPageHeader
        title="Create Personal Plan"
        subtitle="1-week builder using the same nutrition runtime and day-detail flow."
      />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[220px_minmax(0,1fr)]">
        <SectionCard className="space-y-3 border-border/70 bg-card p-3.5 xl:sticky xl:top-24 xl:h-fit">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Plan</p>

          <div className="space-y-1">
            <label className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Name</label>
            <Input value={planName} onChange={(event) => setPlanName(event.target.value)} placeholder="Personal Nutrition Week" className="h-9" />
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Start date</label>
            <Input type="date" value={planStartDate || todayKey} onChange={(event) => setPlanStartDate(event.target.value)} className="h-9" />
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Description</label>
            <Input value={planDescription} onChange={(event) => setPlanDescription(event.target.value)} placeholder="Optional notes" className="h-9" />
          </div>

        </SectionCard>

        <div className="space-y-3">
          <SectionCard className="space-y-3 border-border/70 bg-card p-3.5">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Day</p>
            <Tabs
              value={dayTabValue(selectedDay)}
              onValueChange={(value) => {
                const nextDay = Number(value.replace("day-", ""));
                if (!Number.isNaN(nextDay)) {
                  setSelectedDay(nextDay);
                  setDuplicationMessage(null);
                }
              }}
            >
              <TabsList className="pt-hub-tab-rail h-auto min-h-[3.75rem] w-full justify-center !border-border/60 [background:none] !bg-card/45 !shadow-none backdrop-blur-0">
                {DAY_TABS.map((tab) => (
                  <TabsTrigger
                    key={tab.day}
                    value={dayTabValue(tab.day)}
                    className="pt-hub-tab-trigger group !h-11 min-w-0 flex-1 !px-2"
                  >
                    {selectedDay === tab.day ? (
                      <>
                        <motion.span
                          layoutId={reduceMotion ? undefined : "client-nutrition-day-active-halo"}
                          className="pointer-events-none absolute -inset-1 z-0 rounded-[20px] bg-primary/28 blur-md"
                          transition={{ type: "spring", stiffness: 260, damping: 28, mass: 0.85 }}
                        />
                        <motion.span
                          layoutId={reduceMotion ? undefined : "client-nutrition-day-active-pill"}
                          className="pt-hub-tab-active-pill absolute inset-0 rounded-[18px] border"
                          transition={{ type: "spring", stiffness: 280, damping: 30, mass: 0.8 }}
                        />
                      </>
                    ) : null}

                    <motion.span
                      className="relative z-10"
                      animate={
                        reduceMotion
                          ? undefined
                          : {
                              y: selectedDay === tab.day ? -0.5 : 0,
                              opacity: selectedDay === tab.day ? 1 : 0.86,
                            }
                      }
                      transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                    >
                      {tab.label}
                    </motion.span>
                  </TabsTrigger>
                ))}
              </TabsList>

              <TabsContent value={dayTabValue(selectedDay)} className="mt-3 space-y-3">
                <div className="space-y-3 rounded-lg border border-border/60 bg-muted/20 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="space-y-0.5">
                      <p className="text-base font-semibold text-foreground">
                        {DAY_TABS.find((tab) => tab.day === selectedDay)?.label} summary
                      </p>
                      <p className="text-xs text-muted-foreground">{selectedDayMeals.length} meals planned</p>
                    </div>
                    <Button size="sm" variant="secondary" onClick={addMeal} className="h-8 px-2.5">
                      <Plus className="mr-1 h-3.5 w-3.5" />
                      Add meal
                    </Button>
                  </div>

                  <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
                    <div className="rounded-lg border border-border/70 bg-card p-2.5">
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Calories</p>
                      <p className="text-lg font-semibold tabular-nums text-foreground">{Math.round(selectedDayMacros.calories)}</p>
                    </div>
                    <div className="rounded-lg border border-border/70 bg-card p-2.5">
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Protein</p>
                      <p className="text-lg font-semibold tabular-nums text-foreground">{Math.round(selectedDayMacros.protein_g)}g</p>
                    </div>
                    <div className="rounded-lg border border-border/70 bg-card p-2.5">
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Fats</p>
                      <p className="text-lg font-semibold tabular-nums text-foreground">{Math.round(selectedDayMacros.fat_g)}g</p>
                    </div>
                    <div className="rounded-lg border border-border/70 bg-card p-2.5">
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Carbs</p>
                      <p className="text-lg font-semibold tabular-nums text-foreground">{Math.round(selectedDayMacros.carbs_g)}g</p>
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  {duplicationMessage ? (
                    <ActionStatusMessage tone={duplicationMessage.tone}>
                      {duplicationMessage.text}
                    </ActionStatusMessage>
                  ) : null}

                  {selectedDayMeals.map((meal, mealIndex) => {
                    const mealTotals = meal.components.reduce(
                      (acc, component) => ({
                        calories: acc.calories + (toNumOrNull(component.calories) ?? 0),
                        protein: acc.protein + (toNumOrNull(component.protein) ?? 0),
                        carbs: acc.carbs + (toNumOrNull(component.carbs) ?? 0),
                        fat: acc.fat + (toNumOrNull(component.fat) ?? 0),
                      }),
                      { calories: 0, protein: 0, carbs: 0, fat: 0 },
                    );
                    const expanded = isMealExpanded(selectedDay, mealIndex);

                    return (
                      <SectionCard
                        key={`day-${selectedDay}-meal-${mealIndex}`}
                        className="overflow-hidden border-border/70 bg-card p-0"
                      >
                        <div className="space-y-2 px-3.5 py-3">
                          <div className="flex items-start justify-between gap-2">
                            <button
                              type="button"
                              onClick={() => toggleMealExpanded(mealIndex)}
                              className="flex min-w-0 flex-1 items-start gap-2 text-left"
                            >
                              <ChevronDown className={`mt-0.5 h-4 w-4 shrink-0 transition-transform ${expanded ? "rotate-0" : "-rotate-90"}`} />
                              <div className="min-w-0">
                                <p className="truncate text-[15px] font-semibold text-foreground">
                                  {meal.mealName.trim() || `Meal ${mealIndex + 1}`}
                                </p>
                                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                                  <Badge variant="muted" className="px-2 py-0.5 text-[10px] tracking-[0.12em] tabular-nums">
                                    {Math.round(mealTotals.calories)} CAL
                                  </Badge>
                                  <Badge variant="muted" className="px-2 py-0.5 text-[10px] tracking-[0.12em] tabular-nums">
                                    P {Math.round(mealTotals.protein)}G
                                  </Badge>
                                  <Badge variant="muted" className="px-2 py-0.5 text-[10px] tracking-[0.12em] tabular-nums">
                                    F {Math.round(mealTotals.fat)}G
                                  </Badge>
                                  <Badge variant="muted" className="px-2 py-0.5 text-[10px] tracking-[0.12em] tabular-nums">
                                    C {Math.round(mealTotals.carbs)}G
                                  </Badge>
                                </div>
                              </div>
                            </button>

                            <div className="flex shrink-0 items-center gap-1.5">
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                                onClick={() => removeMeal(mealIndex)}
                                disabled={selectedDayMeals.length <= 1}
                              >
                                <X className="h-4 w-4" />
                                <span className="sr-only">Remove meal</span>
                              </Button>
                            </div>
                          </div>

                          <div className="flex items-center justify-between rounded-lg border border-border/60 bg-muted/10 px-2.5 py-2">
                            <div className="space-y-0.5">
                              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                                Reuse this meal
                              </p>
                              <p className="text-xs text-muted-foreground">
                                Copy it to the other days in this week.
                              </p>
                            </div>
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              className="h-8 px-2.5"
                              onClick={() => duplicateMealToAllDays(mealIndex)}
                              disabled={!mealHasDraftContent(meal)}
                              title="Duplicate this meal across all days"
                            >
                              <Copy className="mr-1 h-3.5 w-3.5" />
                              Apply to all days
                            </Button>
                          </div>
                        </div>

                        {expanded ? (
                          <div className="space-y-3 border-t border-border/60 px-3.5 py-3.5">
                            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                              <div className="space-y-1">
                                <label className="block text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                  Meal name
                                </label>
                                <Input
                                  value={meal.mealName}
                                  onChange={(event) => updateMealField(mealIndex, "mealName", event.target.value)}
                                  placeholder="Breakfast"
                                  className="h-8"
                                />
                              </div>
                              <div className="space-y-1">
                                <label className="block text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                  Meal notes
                                </label>
                                <Input
                                  value={meal.notes}
                                  onChange={(event) => updateMealField(mealIndex, "notes", event.target.value)}
                                  placeholder="Optional notes"
                                  className="h-8"
                                />
                              </div>
                            </div>

                            <div className="flex items-center justify-between">
                              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Components</p>
                              <Button size="sm" variant="secondary" onClick={() => addMealComponent(mealIndex)} className="h-8 px-2.5">
                                <Plus className="mr-1 h-3.5 w-3.5" />
                                Add component
                              </Button>
                            </div>

                            <div className="overflow-x-auto rounded-md border border-border/60 bg-muted/10">
                              <table className="w-full min-w-[980px] table-fixed">
                                <colgroup>
                                  <col className="w-[48%]" />
                                  <col className="w-[16%]" />
                                  <col className="w-[8%]" />
                                  <col className="w-[8%]" />
                                  <col className="w-[8%]" />
                                  <col className="w-[8%]" />
                                  <col className="w-[4%]" />
                                </colgroup>
                                <thead>
                                  <tr className="border-b border-border/60 bg-muted/20 text-left text-[10px] uppercase tracking-wide text-muted-foreground">
                                    <th className="px-2.5 py-2 font-medium">Component</th>
                                    <th className="px-2 py-2 font-medium">Qty / Unit</th>
                                    <th className="px-2 py-2 font-medium">Cal</th>
                                    <th className="px-2 py-2 font-medium">Protein</th>
                                    <th className="px-2 py-2 font-medium">Fats</th>
                                    <th className="px-2 py-2 font-medium">Carbs</th>
                                    <th className="px-2 py-2" />
                                  </tr>
                                </thead>
                                <tbody>
                                  {meal.components.map((component, componentIndex) => (
                                    <tr key={`day-${selectedDay}-meal-${mealIndex}-component-${componentIndex}`} className="border-b border-border/40 last:border-b-0">
                                      <td className="px-2.5 py-1.5 align-middle">
                                        <Input
                                          aria-label="Component"
                                          value={component.componentName}
                                          onChange={(event) =>
                                            updateMealComponentField(mealIndex, componentIndex, "componentName", event.target.value)
                                          }
                                          placeholder="Chicken breast"
                                          className="h-8 w-full min-w-[460px]"
                                        />
                                      </td>
                                      <td className="px-2 py-1.5 align-middle">
                                        <div className="flex items-center gap-1.5">
                                          <Input
                                            aria-label="Quantity"
                                            type="text"
                                            inputMode="decimal"
                                            value={component.quantity}
                                            onChange={(event) =>
                                              updateMealComponentField(mealIndex, componentIndex, "quantity", event.target.value)
                                            }
                                            placeholder="150"
                                            className="h-8 w-[5ch] min-w-[5ch] px-1.5 text-center text-xs tabular-nums"
                                          />
                                          <Select
                                            aria-label="Unit"
                                            value={component.unit}
                                            onChange={(event) =>
                                              updateMealComponentField(mealIndex, componentIndex, "unit", event.target.value)
                                            }
                                            size="sm"
                                            className="h-9 min-h-9 w-[68px] rounded-md px-2 pr-6 text-xs leading-5"
                                            contentClassName="min-w-[9rem]"
                                          >
                                            {UNIT_OPTIONS.map((unit) => (
                                              <option key={unit} value={unit}>
                                                {unit}
                                              </option>
                                            ))}
                                          </Select>
                                        </div>
                                      </td>
                                      <td className="px-2 py-1.5 align-middle">
                                        <Input
                                          aria-label="Calories"
                                          type="text"
                                          inputMode="numeric"
                                          value={component.calories}
                                          onChange={(event) =>
                                            updateMealComponentField(mealIndex, componentIndex, "calories", event.target.value)
                                          }
                                          placeholder="kcal"
                                          className="h-8 w-[4.8ch] min-w-[4.8ch] px-1.5 text-center text-xs tabular-nums"
                                        />
                                      </td>
                                      <td className="px-2 py-1.5 align-middle">
                                        <Input
                                          aria-label="Protein"
                                          type="text"
                                          inputMode="decimal"
                                          value={component.protein}
                                          onChange={(event) =>
                                            updateMealComponentField(mealIndex, componentIndex, "protein", event.target.value)
                                          }
                                          placeholder="g"
                                          className="h-8 w-[4.8ch] min-w-[4.8ch] px-1.5 text-center text-xs tabular-nums"
                                        />
                                      </td>
                                      <td className="px-2 py-1.5 align-middle">
                                        <Input
                                          aria-label="Fats"
                                          type="text"
                                          inputMode="decimal"
                                          value={component.fat}
                                          onChange={(event) =>
                                            updateMealComponentField(mealIndex, componentIndex, "fat", event.target.value)
                                          }
                                          placeholder="g"
                                          className="h-8 w-[4.8ch] min-w-[4.8ch] px-1.5 text-center text-xs tabular-nums"
                                        />
                                      </td>
                                      <td className="px-2 py-1.5 align-middle">
                                        <Input
                                          aria-label="Carbs"
                                          type="text"
                                          inputMode="decimal"
                                          value={component.carbs}
                                          onChange={(event) =>
                                            updateMealComponentField(mealIndex, componentIndex, "carbs", event.target.value)
                                          }
                                          placeholder="g"
                                          className="h-8 w-[4.8ch] min-w-[4.8ch] px-1.5 text-center text-xs tabular-nums"
                                        />
                                      </td>
                                      <td className="px-2 py-1.5 align-middle">
                                        <Button
                                          type="button"
                                          variant="ghost"
                                          size="sm"
                                          className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                                          onClick={() => removeMealComponent(mealIndex, componentIndex)}
                                          disabled={meal.components.length <= 1}
                                        >
                                          <X className="h-3.5 w-3.5" />
                                          <span className="sr-only">Remove component</span>
                                        </Button>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        ) : null}
                      </SectionCard>
                    );
                  })}
                </div>
              </TabsContent>
            </Tabs>
          </SectionCard>

          {createPersonalPlanMutation.error ? (
            <ActionStatusMessage tone="error">
              {createPersonalPlanMutation.error instanceof Error
                ? createPersonalPlanMutation.error.message
                : "Failed to create personal nutrition plan."}
            </ActionStatusMessage>
          ) : null}
        </div>
      </div>

      <div className="flex items-center justify-end gap-2 rounded-lg bg-card px-3 py-2.5">
        <Button
          variant="secondary"
          className="transition-[transform,box-shadow] duration-200 ease-out hover:-translate-y-0.5 hover:shadow-[0_10px_18px_-14px_hsl(var(--foreground)/0.7)] disabled:hover:translate-y-0 disabled:hover:shadow-none"
          onClick={() => navigate("/app/nutrition")}
          disabled={createPersonalPlanMutation.isPending}
        >
          Cancel
        </Button>
        <Button
          className="transition-[transform,box-shadow] duration-200 ease-out hover:-translate-y-0.5 hover:shadow-[0_12px_22px_-14px_hsl(var(--primary)/0.85)] disabled:hover:translate-y-0 disabled:hover:shadow-none"
          onClick={() => createPersonalPlanMutation.mutate()}
          disabled={createPersonalPlanMutation.isPending}
        >
          {createPersonalPlanMutation.isPending ? "Creating..." : "Create personal plan"}
        </Button>
      </div>
    </div>
  );
}



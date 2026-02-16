import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";
import {
  DashboardCard,
  EmptyState,
  Skeleton,
} from "../../components/ui/coachos";
import { PageContainer } from "../../components/common/page-container";
import { supabase } from "../../lib/supabase";
import { sumMacros, useNutritionTemplate } from "../../lib/nutrition";
import { SaveActions } from "../../components/common/save-actions";

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const SLOT_NAMES = [
  "Breakfast",
  "Lunch",
  "Pre Workout Meal",
  "Post Workout Meal",
  "Dinner",
  "Snacks",
];

const isUuid = (value: string | undefined | null) =>
  Boolean(
    value &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    ),
  );

const toNumOrNull = (value: string) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const toIntOrNull = (value: string) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed) : null;
};

export function PtNutritionTemplateBuilderPage() {
  const { id } = useParams();
  const templateId: string | null = isUuid(id) ? (id as string) : null;
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const templateQuery = useNutritionTemplate(templateId);
  const template = templateQuery.data;

  const [selectedWeek, setSelectedWeek] = useState(1);
  const [selectedDay, setSelectedDay] = useState(1);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [componentOpen, setComponentOpen] = useState(false);
  const [componentMealId, setComponentMealId] = useState<string | null>(null);
  const [componentName, setComponentName] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState("");
  const [calories, setCalories] = useState("");
  const [protein, setProtein] = useState("");
  const [carbs, setCarbs] = useState("");
  const [fat, setFat] = useState("");
  const [recipeText, setRecipeText] = useState("");
  const [notes, setNotes] = useState("");

  const activeDay = useMemo(
    () =>
      template?.days.find(
        (day) =>
          day.week_index === selectedWeek && day.day_of_week === selectedDay,
      ) ?? null,
    [template, selectedWeek, selectedDay],
  );

  const slots = useMemo(() => {
    const map = new Map<
      string,
      { id: string | null; components: any[]; meal_order: number }
    >();

    SLOT_NAMES.forEach((slot, idx) => {
      map.set(slot, { id: null, components: [], meal_order: idx + 1 });
    });

    (activeDay?.meals ?? []).forEach((meal) => {
      const key = meal.meal_name;
      map.set(key, {
        id: meal.id,
        components: meal.components,
        meal_order: meal.meal_order,
      });
    });

    return Array.from(map.entries())
      .map(([slot, value]) => ({ slot, ...value }))
      .sort((a, b) => a.meal_order - b.meal_order);
  }, [activeDay]);

  const dayTotals = useMemo(() => {
    return sumMacros(slots.flatMap((slot) => slot.components));
  }, [slots]);

  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: ["nutrition-template-v1", templateId],
      }),
      queryClient.invalidateQueries({ queryKey: ["nutrition-templates-v1"] }),
    ]);
  };

  const ensureDay = async () => {
    if (!templateId) return null;
    if (activeDay?.id) return activeDay.id;

    const { data, error } = await supabase
      .from("nutrition_template_days")
      .insert({
        nutrition_template_id: templateId,
        week_index: selectedWeek,
        day_of_week: selectedDay,
        title: `${DAY_LABELS[selectedDay - 1]} plan`,
      })
      .select("id")
      .maybeSingle();

    if (error || !data?.id) {
      setErrorMessage(error?.message ?? "Failed to create day.");
      return null;
    }

    await invalidate();
    return data.id as string;
  };

  const ensureSlot = async (slotName: string) => {
    const existing = slots.find((slot) => slot.slot === slotName);
    if (existing?.id) return existing.id;

    const dayId = await ensureDay();
    if (!dayId) return null;

    const nextOrder = slots.length
      ? Math.max(...slots.map((s) => s.meal_order)) + 1
      : 1;

    const { data, error } = await supabase
      .from("nutrition_template_meals")
      .insert({
        nutrition_template_day_id: dayId,
        meal_order: nextOrder,
        meal_name: slotName,
      })
      .select("id")
      .maybeSingle();

    if (error || !data?.id) {
      setErrorMessage(error?.message ?? "Failed to create slot.");
      return null;
    }

    await invalidate();
    return data.id as string;
  };

  const initializeSlots = async () => {
    const dayId = await ensureDay();
    if (!dayId) return;

    for (const slot of SLOT_NAMES) {
      const existing = slots.find((s) => s.slot === slot);
      if (existing?.id) continue;

      const { error } = await supabase.from("nutrition_template_meals").insert({
        nutrition_template_day_id: dayId,
        meal_order: SLOT_NAMES.indexOf(slot) + 1,
        meal_name: slot,
      });
      if (error) {
        setErrorMessage(error.message);
        return;
      }
    }

    await invalidate();
  };

  const addComponent = async () => {
    if (!componentMealId || !componentName.trim()) {
      setErrorMessage("Component name is required.");
      return;
    }

    const targetSlot = slots.find((slot) => slot.id === componentMealId);
    const nextOrder = (targetSlot?.components?.length ?? 0) + 1;

    const { error } = await supabase
      .from("nutrition_template_meal_components")
      .insert({
        nutrition_template_meal_id: componentMealId,
        sort_order: nextOrder,
        component_name: componentName.trim(),
        quantity: toNumOrNull(quantity),
        unit: unit.trim() || null,
        calories: toIntOrNull(calories),
        protein_g: toNumOrNull(protein),
        carbs_g: toNumOrNull(carbs),
        fat_g: toNumOrNull(fat),
        recipe_text: recipeText.trim() || null,
        notes: notes.trim() || null,
      });

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    setComponentOpen(false);
    setComponentName("");
    setQuantity("");
    setUnit("");
    setCalories("");
    setProtein("");
    setCarbs("");
    setFat("");
    setRecipeText("");
    setNotes("");

    await invalidate();
  };

  const removeComponent = async (componentId: string) => {
    const { error } = await supabase
      .from("nutrition_template_meal_components")
      .delete()
      .eq("id", componentId);
    if (error) {
      setErrorMessage(error.message);
      return;
    }
    await invalidate();
  };

  const moveComponent = async (
    mealId: string,
    componentId: string,
    direction: "up" | "down",
  ) => {
    const slot = slots.find((s) => s.id === mealId);
    const list = (slot?.components ?? [])
      .slice()
      .sort((a, b) => a.sort_order - b.sort_order);
    const index = list.findIndex((item) => item.id === componentId);
    const swapIndex = direction === "up" ? index - 1 : index + 1;
    if (index < 0 || swapIndex < 0 || swapIndex >= list.length) return;

    const source = list[index];
    const target = list[swapIndex];

    const { error: e1 } = await supabase
      .from("nutrition_template_meal_components")
      .update({ sort_order: target.sort_order })
      .eq("id", source.id);
    if (e1) {
      setErrorMessage(e1.message);
      return;
    }

    const { error: e2 } = await supabase
      .from("nutrition_template_meal_components")
      .update({ sort_order: source.sort_order })
      .eq("id", target.id);
    if (e2) {
      setErrorMessage(e2.message);
      return;
    }

    await invalidate();
  };

  const openAddComponent = async (slotName: string) => {
    const mealId = await ensureSlot(slotName);
    if (!mealId) return;
    setComponentMealId(mealId);
    setComponentOpen(true);
  };

  if (templateQuery.isLoading) {
    return (
      <PageContainer className="max-w-screen-2xl space-y-4">
        <Skeleton className="h-10 w-72" />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-[560px] w-full" />
          ))}
        </div>
      </PageContainer>
    );
  }

  if (!template) {
    return (
      <PageContainer className="max-w-screen-2xl">
        <EmptyState
          title="Program not found"
          description="This nutrition program is unavailable."
        />
      </PageContainer>
    );
  }

  return (
    <PageContainer className="max-w-screen-2xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
            CoachOS Pro
          </div>
          <h2 className="text-2xl font-semibold tracking-tight">
            {template.name}
          </h2>
          <p className="text-sm text-muted-foreground">
            Nutrition program builder: slots + meal components with macro
            details.
          </p>
        </div>
        <Button
          variant="secondary"
          onClick={() => navigate("/pt/nutrition-programs")}
        >
          Back
        </Button>
      </div>

      {errorMessage ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {errorMessage}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <DashboardCard title="Program Scope" subtitle="Week + day selector">
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {Array.from({ length: template.duration_weeks }).map((_, idx) => {
                const week = idx + 1;
                return (
                  <Button
                    key={week}
                    size="sm"
                    variant={selectedWeek === week ? "default" : "secondary"}
                    onClick={() => setSelectedWeek(week)}
                  >
                    Week {week}
                  </Button>
                );
              })}
            </div>

            <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
              {DAY_LABELS.map((label, idx) => {
                const day = idx + 1;
                return (
                  <Button
                    key={label}
                    size="sm"
                    variant={selectedDay === day ? "default" : "secondary"}
                    onClick={() => setSelectedDay(day)}
                  >
                    {label}
                  </Button>
                );
              })}
            </div>

            <Button variant="secondary" onClick={initializeSlots}>
              Initialize default slots
            </Button>
          </div>
        </DashboardCard>

        <DashboardCard title="Meal Slots" subtitle="Breakfast/Lunch/Dinner/etc">
          <div className="space-y-3">
            {slots.map((slot) => {
              const slotTotals = sumMacros(slot.components);
              return (
                <div
                  key={slot.slot}
                  className="rounded-lg border border-border/60 bg-muted/20 p-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="font-medium">{slot.slot}</p>
                      <p className="text-xs text-muted-foreground">
                        {slot.components.length} components
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => openAddComponent(slot.slot)}
                    >
                      <Plus className="mr-1 h-3.5 w-3.5" />
                      Add
                    </Button>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {Math.round(slotTotals.calories)} cals |{" "}
                    {Math.round(slotTotals.protein_g)}p |{" "}
                    {Math.round(slotTotals.carbs_g)}c |{" "}
                    {Math.round(slotTotals.fat_g)}f
                  </p>
                </div>
              );
            })}
          </div>
        </DashboardCard>

        <DashboardCard
          title="Components"
          subtitle="All components for selected day"
        >
          {slots.every((slot) => slot.components.length === 0) ? (
            <EmptyState
              title="No components yet"
              description="Initialize slots and start adding meal components."
              actionLabel="Initialize slots"
              onAction={initializeSlots}
            />
          ) : (
            <div className="space-y-3">
              {slots.map((slot) => (
                <div key={slot.slot} className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {slot.slot}
                  </p>
                  {slot.components.map((component) => (
                    <div
                      key={component.id}
                      className="rounded-lg border border-border/60 bg-muted/20 p-3"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-medium">
                            {component.component_name}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {component.quantity ?? "-"} {component.unit ?? ""}
                          </p>
                          <p className="text-xs text-muted-foreground line-clamp-2">
                            {component.recipe_text ?? "No recipe"}
                          </p>
                        </div>
                        <div className="flex gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() =>
                              moveComponent(slot.id ?? "", component.id, "up")
                            }
                          >
                            <ArrowUp className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() =>
                              moveComponent(slot.id ?? "", component.id, "down")
                            }
                          >
                            <ArrowDown className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => removeComponent(component.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                      <div className="mt-2 grid grid-cols-4 gap-2 text-center text-xs">
                        <div>
                          <p className="text-muted-foreground">Cals</p>
                          <p>{component.calories ?? 0}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">P</p>
                          <p>{component.protein_g ?? 0}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">C</p>
                          <p>{component.carbs_g ?? 0}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">F</p>
                          <p>{component.fat_g ?? 0}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ))}

              <div className="rounded-lg border border-border/60 bg-muted/20 p-3 text-xs">
                <p className="mb-1 font-semibold text-foreground">Day totals</p>
                <p className="text-muted-foreground">
                  {Math.round(dayTotals.calories)} cals |{" "}
                  {Math.round(dayTotals.protein_g)}p |{" "}
                  {Math.round(dayTotals.carbs_g)}c |{" "}
                  {Math.round(dayTotals.fat_g)}f
                </p>
              </div>
            </div>
          )}
        </DashboardCard>
      </div>

      <Dialog open={componentOpen} onOpenChange={setComponentOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add meal component</DialogTitle>
            <DialogDescription>
              Component inside the selected slot meal program.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Input
              className="sm:col-span-2"
              placeholder="Component name"
              value={componentName}
              onChange={(e) => setComponentName(e.target.value)}
            />
            <Input
              placeholder="Quantity"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
            />
            <Input
              placeholder="Unit (g/ml/pcs)"
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
            />
            <Input
              placeholder="Calories"
              value={calories}
              onChange={(e) => setCalories(e.target.value)}
            />
            <Input
              placeholder="Protein g"
              value={protein}
              onChange={(e) => setProtein(e.target.value)}
            />
            <Input
              placeholder="Carbs g"
              value={carbs}
              onChange={(e) => setCarbs(e.target.value)}
            />
            <Input
              placeholder="Fat g"
              value={fat}
              onChange={(e) => setFat(e.target.value)}
            />
            <textarea
              className="sm:col-span-2 min-h-[100px] rounded-lg border border-input bg-background px-3 py-2 text-sm"
              placeholder="Recipe text"
              value={recipeText}
              onChange={(e) => setRecipeText(e.target.value)}
            />
            <Input
              className="sm:col-span-2"
              placeholder="Notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
          <SaveActions
            onCancel={() => setComponentOpen(false)}
            onSave={addComponent}
            saveLabel="Save component"
          />
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}

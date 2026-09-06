import { useState } from "react";
import type {
  NutritionTemplate,
  NutritionTemplateMeal,
} from "../../lib/nutrition";
import { Badge } from "../ui/badge";
import { Select } from "../ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";

const days = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];
const macros = [
  { key: "calories", label: "Calories", unit: "kcal" },
  { key: "protein_g", label: "Protein", unit: "g" },
  { key: "carbs_g", label: "Carbs", unit: "g" },
  { key: "fat_g", label: "Fat", unit: "g" },
] as const;

function mealMacro(
  meal: NutritionTemplateMeal,
  key: (typeof macros)[number]["key"],
) {
  if (!meal.components.length) return meal[key];
  const values = meal.components
    .map((component) => component[key])
    .filter((value): value is number => value != null);
  return values.length
    ? values.reduce((total, value) => total + value, 0)
    : null;
}

export function NutritionProgramPreviewDialog({
  template,
  onClose,
}: {
  template: NutritionTemplate;
  onClose: () => void;
}) {
  const [week, setWeek] = useState(1);
  const [day, setDay] = useState(1);
  const selectedDay = template.days.find(
    (entry) => entry.week_index === week && entry.day_of_week === day,
  );
  const meals = [...(selectedDay?.meals ?? [])].sort(
    (a, b) => a.meal_order - b.meal_order,
  );

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="space-y-5 sm:max-w-[760px]">
        <DialogHeader className="pr-10">
          <DialogTitle className="break-words">{template.name}</DialogTitle>
          <DialogDescription className="whitespace-pre-wrap break-words">
            {template.description?.trim() ||
              "Meals and nutrition program details."}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap items-center gap-2">
          {template.nutrition_type_tag ? (
            <Badge variant="muted">{template.nutrition_type_tag}</Badge>
          ) : null}
          <span className="text-sm text-muted-foreground">
            {template.duration_weeks}{" "}
            {template.duration_weeks === 1 ? "week" : "weeks"}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="relative min-w-0">
            <Select
              aria-label="Program week"
              value={week}
              onChange={(event) => setWeek(Number(event.target.value))}
            >
              {Array.from(
                { length: Math.max(1, template.duration_weeks) },
                (_, index) => (
                  <option key={index + 1} value={index + 1}>
                    Week {index + 1}
                  </option>
                ),
              )}
            </Select>
          </div>
          <div className="relative min-w-0">
            <Select
              aria-label="Program day"
              value={day}
              onChange={(event) => setDay(Number(event.target.value))}
            >
              {days.map((name, index) => (
                <option key={name} value={index + 1}>
                  {name}
                </option>
              ))}
            </Select>
          </div>
        </div>
        {selectedDay?.title || selectedDay?.notes ? (
          <div className="space-y-1">
            {selectedDay.title ? (
              <h3 className="font-semibold break-words">{selectedDay.title}</h3>
            ) : null}
            {selectedDay.notes ? (
              <p className="whitespace-pre-wrap break-words text-sm text-muted-foreground">
                {selectedDay.notes}
              </p>
            ) : null}
          </div>
        ) : null}
        {meals.length ? (
          <ol className="space-y-3" aria-label="Meals">
            {meals.map((meal) => (
              <li key={meal.id} className="ui-inset space-y-4 p-4">
                <h3 className="break-words font-semibold">{meal.meal_name}</h3>
                <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {macros.map(({ key, label, unit }) => {
                    const value = mealMacro(meal, key);
                    return (
                      <div key={key}>
                        <dt className="text-xs text-muted-foreground">
                          {label}
                        </dt>
                        <dd className="text-sm font-medium tabular-nums">
                          {value == null
                            ? "—"
                            : `${value.toLocaleString(undefined, { maximumFractionDigits: 1 })} ${unit}`}
                        </dd>
                      </div>
                    );
                  })}
                </dl>
                {meal.components.length ? (
                  <ul className="divide-y divide-border/60">
                    {[...meal.components]
                      .sort((a, b) => a.sort_order - b.sort_order)
                      .map((component) => (
                        <li
                          key={component.id}
                          className="space-y-1 py-2 text-sm first:pt-0 last:pb-0"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <span className="min-w-0 break-words">
                              {component.component_name}
                            </span>
                            {component.quantity != null || component.unit ? (
                              <span className="shrink-0 text-muted-foreground">
                                {[component.quantity, component.unit]
                                  .filter(
                                    (value) => value != null && value !== "",
                                  )
                                  .join(" ")}
                              </span>
                            ) : null}
                          </div>
                          {component.recipe_text ? (
                            <p className="whitespace-pre-wrap break-words text-muted-foreground">
                              {component.recipe_text}
                            </p>
                          ) : null}
                          {component.notes ? (
                            <p className="whitespace-pre-wrap break-words text-muted-foreground">
                              {component.notes}
                            </p>
                          ) : null}
                        </li>
                      ))}
                  </ul>
                ) : null}
                {meal.recipe_text ? (
                  <p className="whitespace-pre-wrap break-words text-sm">
                    {meal.recipe_text}
                  </p>
                ) : null}
                {meal.notes ? (
                  <p className="whitespace-pre-wrap break-words text-sm text-muted-foreground">
                    {meal.notes}
                  </p>
                ) : null}
              </li>
            ))}
          </ol>
        ) : (
          <p className="ui-inset p-5 text-sm text-muted-foreground">
            No meals added for this day yet.
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}

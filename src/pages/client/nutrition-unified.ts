import {
  matchesUnifiedSourceFilter,
  type UnifiedSourceKind,
} from "../../lib/source-labels";

export type UnifiedNutritionFilterKey =
  | "all"
  | "assigned"
  | "personal"
  | "today"
  | "upcoming";

export const unifiedNutritionFilters: Array<{
  key: UnifiedNutritionFilterKey;
  label: string;
}> = [
  { key: "all", label: "All" },
  { key: "assigned", label: "Assigned" },
  { key: "personal", label: "Personal" },
  { key: "today", label: "Today" },
  { key: "upcoming", label: "Upcoming" },
];

export type UnifiedNutritionDayRow = {
  id: string;
  date: string;
  planId: string;
  planStatus: string;
  planName: string;
  sourceKind: UnifiedSourceKind;
  sourceLabel: string;
  sourceWorkspaceId: string | null;
  mealsTotal: number;
  mealsCompleted: number;
  macros: {
    calories: number;
    protein_g: number;
    carbs_g: number;
    fat_g: number;
  };
};

export type UnifiedNutritionSections = {
  today: UnifiedNutritionDayRow[];
  upcoming: UnifiedNutritionDayRow[];
  recent: UnifiedNutritionDayRow[];
};

export function applyUnifiedNutritionFilter(
  rows: UnifiedNutritionDayRow[],
  filter: UnifiedNutritionFilterKey,
  todayKey: string,
) {
  switch (filter) {
    case "assigned":
      return rows.filter((row) =>
        matchesUnifiedSourceFilter(row.sourceKind, "assigned"),
      );
    case "personal":
      return rows.filter((row) =>
        matchesUnifiedSourceFilter(row.sourceKind, "personal"),
      );
    case "today":
      return rows.filter((row) => row.date === todayKey);
    case "upcoming":
      return rows.filter((row) => row.date > todayKey);
    case "all":
    default:
      return rows;
  }
}

export function groupUnifiedNutritionByDate(
  rows: UnifiedNutritionDayRow[],
  todayKey: string,
): UnifiedNutritionSections {
  const today = rows
    .filter((row) => row.date === todayKey)
    .sort((a, b) => a.planName.localeCompare(b.planName));
  const upcoming = rows
    .filter((row) => row.date > todayKey)
    .sort((a, b) => a.date.localeCompare(b.date));
  const recent = rows
    .filter((row) => row.date < todayKey)
    .sort((a, b) => b.date.localeCompare(a.date));

  return {
    today,
    upcoming,
    recent,
  };
}

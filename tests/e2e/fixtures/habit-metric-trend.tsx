import { createRoot } from "react-dom/client";
import { HabitMetricTrend } from "../../../src/components/pt/habit-metric-trend";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "../../../src/components/ui/dialog";
import { applyTheme } from "../../../src/lib/theme";
import "../../../src/styles/globals.css";
import "../../../src/styles/style.css";
import "../../../src/styles/color-language.css";
import "../../../src/styles/component-system.css";

const mode = new URLSearchParams(location.search).get("mode");
applyTheme(mode === "dark" ? "dark" : "light");
const values =
  mode === "empty"
    ? [null, null, null, null, null, null, null]
    : mode === "single"
      ? [0, null, null, null, null, null, null]
      : mode === "gaps"
        ? [1995, null, 2035, 2110, null, null, null]
        : [1995, 2110, 2035, null, null, null, null];
const dates = [
  "2026-08-31",
  "2026-09-01",
  "2026-09-02",
  "2026-09-03",
  "2026-09-04",
  "2026-09-05",
  "2026-09-06",
];

createRoot(document.getElementById("root")!).render(
  <Dialog open>
    <DialogContent className="sm:max-w-[720px]">
      <DialogHeader className="mb-6 pr-10">
        <DialogTitle>Calories trend</DialogTitle>
        <DialogDescription>
          Your client's logged entries over the last 7 days.
        </DialogDescription>
      </DialogHeader>
      <HabitMetricTrend
        label="Calories"
        points={dates.map((date, index) => ({
          date,
          value: values[index] ?? null,
        }))}
        initialDate={dates[0]!}
        formatValue={(value) => Math.round(value).toString()}
      />
    </DialogContent>
  </Dialog>,
);

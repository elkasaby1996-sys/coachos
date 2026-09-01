import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (...segments: string[]) =>
  readFileSync(resolve(process.cwd(), ...segments), "utf8");

const builder = read("src", "pages", "pt", "workout-template-builder.tsx");
const picker = read(
  "src",
  "components",
  "pt",
  "exercise-picker",
  "exercise-picker.tsx",
);
const pickerResults = read(
  "src",
  "components",
  "pt",
  "exercise-picker",
  "exercise-picker-results.tsx",
);
const pickerTray = read(
  "src",
  "components",
  "pt",
  "exercise-picker",
  "exercise-picker-selection-tray.tsx",
);
const pickerModel = read("src", "lib", "exercise-picker.ts");
const browser = read("src", "lib", "exercise-browser.ts");
const libraryPage = read("src", "pages", "pt", "settings-exercises.tsx");
const libraryComponents = read(
  "src",
  "components",
  "pt",
  "exercise-library",
  "exercise-library-browser.tsx",
);
const pickerRow = read(
  "src",
  "components",
  "pt",
  "exercise-picker",
  "exercise-picker-selectable-row.tsx",
);
const pickerFilters = read(
  "src",
  "components",
  "pt",
  "exercise-picker",
  "exercise-picker-filter-panel.tsx",
);
const ptLayout = read("src", "components", "layouts", "pt-layout.tsx");

describe("PR-EXLIB-06 shared picker contracts", () => {
  it("uses focused picker components and shared browser items/adapters", () => {
    const files = readdirSync(
      resolve(process.cwd(), "src", "components", "pt", "exercise-picker"),
    );
    expect(files).toEqual(
      expect.arrayContaining([
        "exercise-picker.tsx",
        "exercise-picker-toolbar.tsx",
        "exercise-picker-filter-panel.tsx",
        "exercise-picker-results.tsx",
        "exercise-picker-selectable-row.tsx",
        "exercise-picker-selection-tray.tsx",
      ]),
    );
    expect(picker).toContain("adaptPersistedExerciseBrowserItem");
    expect(picker).toContain("adaptProviderExerciseBrowserItem");
    expect(pickerResults).toContain("FilteredExerciseBrowserItem");
    expect(builder).toContain("<ExercisePicker");
  });

  it("gates provider access by the active tab and makes Load more explicit", () => {
    expect(picker).toContain(
      'enabled: open && view === "provider" && exerciseDatasetConfigured',
    );
    expect(picker).toContain('setView(value === "provider"');
    expect(picker.match(/fetchNextPage\(\)/g)).toHaveLength(1);
    expect(picker).toContain("cursor: pageParam");
    expect(picker).not.toMatch(/while\s*\(/);
    expect(picker).not.toContain("for (;;)");
  });

  it("keeps selection independent from filters, tabs, and visible pages", () => {
    expect(pickerModel).toContain("Map<");
    expect(picker).toContain("selection.has(key)");
    expect(picker).toContain('setQuery("")');
    expect(picker).toContain("setMuscleKey(null)");
    expect(picker).not.toContain(
      "onSelectionChange(emptyExercisePickerSelection())\n    setQuery",
    );
    expect(pickerTray).toContain("Clear selection");
    expect(pickerTray).toContain("onRemove(entry)");
  });

  it("canonicalizes exact matches and blocks name conflicts", () => {
    expect(pickerModel).toContain('item.savedMatch.status === "exact"');
    expect(pickerModel).toContain('makeExerciseSelectionKey("library"');
    expect(pickerModel).toContain('item.savedMatch.status === "name_conflict"');
    expect(picker).toContain("Name conflict — review the saved exercise");
  });

  it("marks saved and exact provider rows already added", () => {
    expect(picker).toContain("existingExerciseIds.has(internalId)");
    expect(picker).toContain('? "Already added"');
    expect(pickerResults).toContain("disabledReasonForItem");
  });

  it("revalidates every selection and current WTE ids before the locked write", () => {
    const handler = builder.slice(
      builder.indexOf("const handleAddExercise"),
      builder.indexOf("const handleCreateExercise"),
    );
    expect(handler).toContain("resolveExercisePickerSelections(");
    expect(handler).toContain("unresolvedKeys.length > 0");
    expect(handler).toContain("nameConflictKeys.length > 0");
    expect(
      handler.indexOf('.from("workout_template_exercises")'),
    ).toBeGreaterThan(handler.indexOf("for (const candidate of candidates)"));
    expect(handler).toContain("partitionNewExerciseSelections(");
    expect(handler).toContain("buildWorkoutTemplateExerciseInsertRows(");
    expect(handler).toContain("getExerciseDatasetExercise(");
    expect(handler).toContain("buildCurrentProviderExerciseInsertPayload(");
    expect(handler).toContain("importExercise,");
    expect(handler).not.toContain(
      "resolvedSelections.push({ exerciseId: candidate.exercise.id",
    );
  });

  it("preserves inline canonical creation and selects without inserting WTE", () => {
    const handler = builder.slice(
      builder.indexOf("const handleCreateExercise"),
      builder.indexOf("const openEdit"),
    );
    expect(handler).toContain("buildCustomExerciseMusclePersistenceFields");
    expect(handler).toContain("EXERCISE_LIBRARY_FULL_PROJECTION");
    expect(handler).toContain("next.set(selectionKey");
    expect(handler).not.toContain("workout_template_exercises");
  });

  it("shares direct and related grouping with the dedicated library", () => {
    expect(browser).toContain("groupExerciseBrowserMatches");
    expect(pickerResults).toContain("groupExerciseBrowserMatches(");
    expect(libraryComponents).toContain("groupExerciseBrowserMatches(");
    for (const source of [pickerResults, libraryComponents]) {
      expect(source).toContain("Direct matches");
      expect(source).toContain("Related exercises");
      expect(source).toContain("No direct matches for");
    }
  });

  it("keeps provider media inert and provider failures isolated", () => {
    expect(picker).not.toContain("<video");
    expect(picker).not.toContain("autoPlay");
    expect(picker).toContain("My Library remains available");
    expect(picker).toContain('view === "library" && libraryError');
  });

  it("keeps mobile filters, selected footer, and dedicated-library polish", () => {
    expect(builder).toContain("h-[calc(100dvh-1rem)]");
    expect(pickerTray).toContain("Add selected");
    expect(pickerFilters).toContain("onKeyDown={handleSummaryKeyDown}");
    expect(pickerFilters).toContain("details.open = !details.open");
    expect(pickerRow).toContain('event.key !== "Enter"');
    expect(pickerRow).toContain('event.key !== " "');
    expect(libraryComponents).not.toContain("group-open:hidden");
    expect(libraryComponents).toContain("Selected: {selectedLabel}");
    expect(libraryPage).toContain('title="Exercise Library"');
    expect(ptLayout).toContain(
      'location.pathname === "/pt/settings/exercises"',
    );
    expect(ptLayout).toContain("whitespace-normal break-words");
  });
});

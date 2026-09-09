import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const page = readFileSync(
  resolve(process.cwd(), "src", "pages", "pt", "settings-exercises.tsx"),
  "utf8",
);
const browserHelpers = readFileSync(
  resolve(process.cwd(), "src", "lib", "exercise-browser.ts"),
  "utf8",
);
const browserComponents = readFileSync(
  resolve(
    process.cwd(),
    "src",
    "components",
    "pt",
    "exercise-library",
    "exercise-library-browser.tsx",
  ),
  "utf8",
);
const providerAnatomyFields = readFileSync(
  resolve(
    process.cwd(),
    "src",
    "components",
    "pt",
    "provider-anatomy-filter-fields.tsx",
  ),
  "utf8",
);

const normalizeLineEndings = (source: string) => source.replace(/\r\n?/g, "\n");

const getSelfClosingJsxTag = (source: string, componentName: string) => {
  const normalized = normalizeLineEndings(source);
  return (
    normalized.match(
      new RegExp(`<${componentName}\\b[\\s\\S]*?\\/>`, "m"),
    )?.[0] ?? ""
  );
};

describe("rebuilt Exercise Library page contract", () => {
  it("keeps the provider query disabled until Provider Catalog is active", () => {
    expect(page).toContain('enabled: view === "provider"');
    expect(page).toContain("view={view}");
    expect(page).toContain("onViewChange={(nextView)");
    expect(browserComponents).toContain(
      '<option value="provider">Provider Catalog</option>',
    );
  });

  it("places the source selector in the toolbar without a separate count card", () => {
    expect(browserComponents).toContain('id="exercise-library-view"');
    expect(browserComponents).toContain('aria-label="Exercise source"');
    expect(page).not.toContain("<TabsList");
    expect(page).not.toContain("saved result");
    expect(page).not.toContain("filteredProviderItems.length} match");
  });

  it("keeps result cards free of the redundant provider tag line", () => {
    expect(browserComponents).not.toContain(
      'item.tags.slice(0, 3).join(" · ")',
    );
    expect(browserComponents).toContain("getMuscleSummary(item)");
    expect(browserComponents).toContain('item.equipment ?? "No equipment"');
  });

  it("uses provider metadata for accessible exact-value dropdown filters", () => {
    expect(page).toContain("getExerciseDatasetMetadataCatalog");
    expect(browserComponents).toContain('id="exercise-library-equipment"');
    expect(browserComponents).toContain("<ProviderAnatomyFilterFields");
    expect(providerAnatomyFields).toContain("PROVIDER_BODY_PART_OPTIONS");
    expect(providerAnatomyFields).toContain("PROVIDER_TARGET_MUSCLE_OPTIONS");
    expect(browserComponents).toContain('id="exercise-library-type"');
    expect(browserComponents).toContain("All equipment");
    expect(page).toContain("Retry filters");
  });

  it("keeps all metadata dropdowns visible and functional in My Library", () => {
    const filterRow = browserComponents.slice(
      browserComponents.indexOf('aria-label="Exercise metadata filters"'),
      browserComponents.indexOf("function MuscleSelectorContent"),
    );
    expect(filterRow).toContain('id="exercise-library-equipment"');
    expect(filterRow).toContain("<ProviderAnatomyFilterFields");
    expect(filterRow).toContain('id="exercise-library-type"');
    expect(filterRow).not.toContain('view === "provider"');
    expect(page).toContain("filterExerciseBrowserItemsByProviderFacets(");
    expect(page).toContain("exerciseTypeOptions={exerciseTypeOptions}");
  });

  it("maps one Load more action to one cursor request without crawling", () => {
    expect(page).toContain("cursor: pageParam");
    expect(page.match(/fetchNextPage\(\)/g)).toHaveLength(1);
    expect(page).not.toMatch(/while\s*\(/);
    expect(page).not.toContain("for (;;)");
  });

  it("keeps provider errors isolated from the My Library branch", () => {
    expect(page).toContain('view === "library" ?');
    expect(page).toContain("providerQuery.isError");
    expect(page).toContain("Saved exercises remain available");
  });

  it("uses the shared classification and canonical import contracts", () => {
    expect(page).toContain("<ExerciseMuscleClassificationFields");
    expect(page).toContain("buildCustomExerciseMusclePersistenceFields");
    expect(page).toContain("buildCurrentProviderExerciseInsertPayload(");
  });

  it("loads provider video detail on demand and preserves it on import", () => {
    expect(page).toContain("getExerciseDatasetExercise");
    expect(page).toContain('queryKey: ["exercise-provider-detail"');
    expect(page).toContain('preload="none"');
    expect(page).toContain("providerDetailQuery.data.videoUrl");
    expect(page).toContain("const importExercise = exercise.videoUrl");
    const importHandler = page.slice(
      page.indexOf("const handleImportExercise"),
      page.indexOf("const handleMuscleChange"),
    );
    expect(importHandler).toContain(
      "buildCurrentProviderExerciseInsertPayload(",
    );
    expect(importHandler).toContain("importExercise,");
  });

  it("preserves imported provenance on edits", () => {
    const saveHandler = page.slice(
      page.indexOf("const handleSave"),
      page.indexOf("const handleDelete"),
    );
    expect(saveHandler).toContain("!selected || muscleClassificationChanged");
    expect(saveHandler).toContain('.update(payload).eq("id", selected.id)');
    expect(saveHandler).not.toContain("source_exercise_id:");
    expect(saveHandler).not.toContain("source_payload:");
  });

  it("uses restrictive-delete copy and a safe in-use error", () => {
    expect(page).toContain("dependent records are never cascaded");
    expect(page).not.toContain("dependent template rows");
    expect(page).toContain("getExerciseDeleteErrorMessage(error)");
    expect(browserHelpers).toContain('code === "23503"');
    expect(browserHelpers).toContain("cannot be deleted");
  });

  it("does not insert workout-template rows or fetch the provider directly", () => {
    expect(page).not.toContain("workout_template_exercises");
    expect(page).not.toMatch(/\bfetch\s*\(/);
    expect(page).not.toContain("axios");
    expect(page).toContain("searchExerciseDataset");
  });

  it("uses URL-backed canonical filter state", () => {
    expect(page).toContain("useSearchParams");
    expect(page).toContain("parseExerciseBrowserSearchParams");
    expect(page).toContain("serializeExerciseBrowserSearchState");
    expect(page).toContain("replace,");
  });

  it("treats the anatomical selector as a replaceable controlled component", () => {
    const normalizedBrowser = normalizeLineEndings(browserComponents);
    const selectorTag = getSelfClosingJsxTag(
      normalizedBrowser,
      "AnatomicalMuscleSelector",
    );
    expect(selectorTag).not.toBe("");
    expect(selectorTag).toMatch(/\bvalue\s*=\s*\{\s*muscleKey\s*\}/);
    expect(selectorTag).toMatch(
      /\bonValueChange\s*=\s*\{\s*onMuscleChange\s*\}/,
    );
    expect(selectorTag).not.toMatch(/\bclassName\s*=/);
    expect(selectorTag).not.toMatch(
      /\b(?:front|back|svg|path)\w*ClassName\s*=/i,
    );

    const selectorOffset = normalizedBrowser.indexOf(selectorTag);
    const containingTag = normalizedBrowser
      .slice(0, selectorOffset)
      .match(/<div\b([^>]*)>\s*$/)?.[1];
    const containerClasses =
      containingTag?.match(/\bclassName\s*=\s*"([^"]*)"/)?.[1].split(/\s+/) ??
      [];
    expect(containerClasses).toEqual(
      expect.arrayContaining(["min-w-0", "max-w-full"]),
    );

    expect(normalizeLineEndings(page)).toMatch(
      /xl:grid-cols-\[minmax\(0,\s*2fr\)_minmax\(20rem,\s*0\.88fr\)\]/,
    );
    expect(page).toContain('aria-label="Exercise library controls"');
    expect(page).toContain("xl:order-1");
    expect(page).toContain("xl:order-2");
    expect(page).toContain("xl:sticky xl:top-5 xl:self-start");
    expect(normalizedBrowser).toMatch(
      /<details\b[^>]*className="[^"]*\bxl:hidden\b[^"]*"/,
    );
  });

  it("exposes the selector's map and equivalent list without adding library scope filters", () => {
    // PR-EXLIB-UI-01 makes the equivalent list reachable in the library too.
    // Runtime coverage exercises both tabs at all three integration widths.
    expect(browserComponents).not.toMatch(/\[&_\.anatomy-view-tabs\]:hidden/);
    expect(browserComponents).not.toContain("<Filter");
    expect(browserComponents).not.toContain("Library scope");
    expect(page).toContain('origin: "all"');
    expect(page).toContain('classification: "all"');
    expect(page).not.toContain("handleLibraryScopeChange");
  });

  it("keeps the mobile filter disclosure keyboard-operable", () => {
    expect(browserComponents).toContain(
      "onKeyDown={handleMobileFilterSummaryKeyDown}",
    );
    expect(browserComponents).toContain('event.key !== "Enter"');
    expect(browserComponents).toContain('event.key !== " "');
    expect(browserComponents).toContain("details.open = !details.open");
  });
});

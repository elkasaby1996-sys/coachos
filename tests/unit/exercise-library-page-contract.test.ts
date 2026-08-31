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

describe("rebuilt Exercise Library page contract", () => {
  it("keeps the provider query disabled until Provider Catalog is active", () => {
    expect(page).toContain('enabled: view === "provider"');
    expect(page).toContain('<TabsTrigger value="provider"');
    expect(page).toContain(
      'view: value === "provider" ? "provider" : "library"',
    );
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
    expect(page).toContain(
      "...buildCurrentProviderCanonicalMuscleFields(exercise)",
    );
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
    expect(browserComponents).toContain(
      "<AnatomicalMuscleSelector\n          value={muscleKey}\n          onValueChange={onMuscleChange}\n        />",
    );
    expect(browserComponents).toContain('<div className="min-w-0 max-w-full">');
    expect(browserComponents).not.toMatch(
      /AnatomicalMuscleSelector[\s\S]{0,160}className=/,
    );
    expect(page).toContain("xl:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]");
    expect(page).not.toContain("minmax(21rem");
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

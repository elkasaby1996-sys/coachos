import { expect, test } from "@playwright/test";
import { signInWithEmail } from "./utils/test-helpers";

test.skip(
  process.env.E2E_WORKSPACE_DEMO !== "1",
  "Requires the local PT demo account",
);

test("Duplicate copies the workout and prescriptions, and cleans up a failed copy", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1099, height: 732 });
  await signInWithEmail(page, "demo.pt@repsync.test", "DemoPass123!");
  const source = {
    id: "00000000-0000-4000-8000-000000000001",
    name: "Strength sample",
    description: "Main lift, upper push, and trunk finisher.",
    workout_type: "bodybuilding",
    workout_type_tag: "Strength",
    created_at: "2026-09-06T09:00:00Z",
  };
  const templates = [source];
  const prescription = {
    exercise_id: "00000000-0000-4000-8000-000000000002",
    sort_order: 2,
    sets: 3,
    reps: "8–10",
    superset_group: "A",
    rest_seconds: 0,
    tempo: "3-1-1",
    rpe: 8,
    video_url: "https://example.com/exercise",
    notes: "Controlled descent.",
  };
  const writes: Array<{
    method: string;
    id: string | null;
    body: Record<string, unknown>;
  }> = [];
  let copiedExercises: Array<Record<string, unknown>> = [];
  let failExercises = false;
  let empty = false;
  let workspaceId: string | null = null;
  await page.route("**/rest/v1/workout_templates?*", async (route) => {
    const request = route.request();
    const params = new URL(request.url()).searchParams;
    if (request.method() === "GET") {
      workspaceId = params.get("workspace_id");
      return route.fulfill({ json: params.has("id") ? source : templates });
    }
    const id = params.get("id");
    const body = request.method() === "POST" ? request.postDataJSON() : {};
    writes.push({ method: request.method(), id, body });
    if (request.method() === "DELETE") {
      const index = templates.findIndex((row) => `eq.${row.id}` === id);
      if (index >= 0) templates.splice(index, 1);
      return route.fulfill({ status: 204 });
    }
    templates.push({ ...source, ...body });
    return route.fulfill({ json: { id: body.id } });
  });
  await page.route("**/rest/v1/workout_template_exercises?*", (route) => {
    if (route.request().method() === "GET")
      return route.fulfill({ json: empty ? [] : [prescription] });
    copiedExercises = route.request().postDataJSON();
    return failExercises
      ? route.fulfill({
          status: 400,
          json: { message: "Exercise copy failed" },
        })
      : route.fulfill({
          json: copiedExercises.map((_, index) => ({
            id: `new-exercise-${index}`,
          })),
        });
  });
  await page.goto("/pt/templates/workouts");
  const cards = page
    .locator(".ui-card")
    .filter({
      has: page.getByRole("button", { name: "Duplicate", exact: true }),
    });
  const original = cards.filter({
    has: page.getByRole("heading", { name: source.name, exact: true }),
  });
  await expect(original).toBeVisible({ timeout: 30000 });
  await expect(
    original
      .locator(".ui-card-header")
      .getByRole("button", { name: "Duplicate", exact: true }),
  ).toBeVisible();
  await original
    .getByRole("button", { name: "Duplicate", exact: true })
    .click();
  await expect(page.getByRole("status")).toHaveText(
    "Created Strength sample (copy).",
  );
  await expect(cards).toHaveCount(2);
  expect(writes[0].body).toMatchObject({
    name: "Strength sample (copy)",
    description: source.description,
    workout_type: source.workout_type,
    workout_type_tag: source.workout_type_tag,
    workspace_id: workspaceId?.replace("eq.", ""),
  });
  expect(writes[0].body.id).not.toBe(source.id);
  expect(copiedExercises).toEqual([
    { ...prescription, workout_template_id: writes[0].body.id },
  ]);
  const sizes = await cards.evaluateAll((elements) =>
    elements.map((el) => el.getBoundingClientRect().height),
  );
  expect(sizes[0]).toBeCloseTo(sizes[1], 0);
  await page.screenshot({
    path: "test-results/workout-duplicate-1099.png",
    animations: "disabled",
  });

  failExercises = true;
  await original
    .getByRole("button", { name: "Duplicate", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("Exercise copy failed");
  await expect(cards).toHaveCount(2);
  expect(writes.at(-1)).toMatchObject({
    method: "DELETE",
    id: `eq.${writes[1].body.id}`,
  });
  expect(writes.every((write) => write.id !== `eq.${source.id}`)).toBe(true);

  failExercises = false;
  empty = true;
  copiedExercises = [];
  await original
    .getByRole("button", { name: "Duplicate", exact: true })
    .click();
  await expect(page.getByRole("status")).toHaveText(
    "Created Strength sample (copy).",
  );
  await expect(cards).toHaveCount(3);
  expect(copiedExercises).toEqual([]);
  await page.setViewportSize({ width: 375, height: 732 });
  await original.scrollIntoViewIfNeeded();
  for (const name of ["View", "Edit", "Duplicate", "Delete"]) {
    await expect(
      original
        .locator(".ui-card-header")
        .getByRole("button", { name, exact: true }),
    ).toBeVisible();
  }
  expect(
    await original.evaluate((el) => el.scrollWidth <= el.clientWidth),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/workout-duplicate-375.png",
    animations: "disabled",
  });
});

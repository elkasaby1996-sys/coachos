import { test, expect, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";

// Local-only review accounts. Each mutating test creates its own records.
const clientId = "a9082026-a001-4000-8000-000000000101";
async function sql(query: string) {
  query = `begin; select set_config('request.jwt.claim.sub',(select id::text from auth.users where email='demo.pt.review0908@repsync.test'),true); select set_config('request.jwt.claim.role','authenticated',true); ${query} commit;`;
  const response = await fetch("http://127.0.0.1:54321/pg/query", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  const result = await response.json();
  if (result.error) throw new Error(result.error);
  return result;
}
async function login(page: Page) {
  await page.goto("/login");
  await page.evaluate(async () => {
    const { supabase } = await import(
      /* @vite-ignore */ "/src/lib/supabase.ts"
    );
    const { error } = await supabase.auth.signInWithPassword({
      email: "zoe.ramirez.review0908@repsync.test",
      password: "DemoPass123!",
    });
    if (error) throw error;
  });
  await page.goto("/app/home");
  await expect(
    page.getByText("Today's workout", { exact: true }),
  ).toBeVisible();
}
test("IndexedDB recovers actual photo bytes and isolates account and record keys", async ({
  page,
}) => {
  await page.goto("/login");
  const result = await page.evaluate(async () => {
    // Vite compiles the application module; this exercises real browser IndexedDB.
    const { draftStore, draftKey } = await import(
      /* @vite-ignore */ "/src/lib/record-drafts.ts"
    );
    const key = draftKey("review-account-a", "checkin", "one");
    await draftStore(key, "write", {
      answer: "eight",
      photo: new File(["photo bytes"], "front.png", { type: "image/png" }),
    });
    const row = await draftStore(key, "read");
    const otherAccount = await draftStore(
      draftKey("review-account-b", "checkin", "one"),
      "read",
    );
    const otherRecord = await draftStore(
      draftKey("review-account-a", "checkin", "two"),
      "read",
    );
    await draftStore(key, "delete");
    return {
      answer: row.answer,
      photo: await row.photo.text(),
      otherAccount,
      otherRecord,
      deleted: await draftStore(key, "read"),
    };
  });
  expect(result).toEqual({
    answer: "eight",
    photo: "photo bytes",
    otherAccount: undefined,
    otherRecord: undefined,
    deleted: undefined,
  });
});
test("workout draft survives failed save and refresh without appearing in another session", async ({
  page,
}) => {
  const ids = [randomUUID(), randomUUID()];
  for (const id of ids)
    await sql(
      `insert into assigned_workouts(id,client_id,workout_template_id,scheduled_date) values ('${id}','${clientId}','a9082026-a001-4000-8000-000000000201',date '2000-01-01' + ${Math.floor(Math.random() * 8000)});`,
    );
  await sql(
    `update assigned_workout_exercises set superset_group='A', reps=case when sort_order=0 then '8-10' else '30 sec' end where assigned_workout_id='${ids[1]}';`,
  );
  await login(page);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(`/app/workout-run/${ids[0]}`);
  await page
    .getByRole("button", { name: "Start workout", exact: true })
    .click();
  const weight = page
    .getByRole("spinbutton", { name: /set 1, Weight/ })
    .first();
  await expect(weight).toBeEnabled();
  await weight.fill("112");
  await expect(
    page.getByRole("status").filter({ hasText: "Draft saved" }),
  ).toBeVisible();
  await page.route("**/rest/v1/workout_set_logs*", (route) =>
    route.request().method() === "POST" ? route.abort() : route.continue(),
  );
  await page.getByRole("button", { name: "Save sets", exact: true }).click();
  await page.reload();
  await expect(weight).toHaveValue("112");
  await page.unroute("**/rest/v1/workout_set_logs*");
  await page.goto(`/app/workout-run/${ids[1]}`);
  await page
    .getByRole("button", { name: "Start workout", exact: true })
    .click();
  await expect(weight).toBeEnabled();
  await expect(weight).toHaveValue("");
  await page.goto(`/app/workout-run/${ids[0]}`);
  await expect(weight).toHaveValue("112");
  for (const workoutId of ids) {
    await page.goto(`/app/workout-run/${workoutId}`);
    await expect(weight).toBeEnabled();
    for (const width of [375, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 812 });
      for (const input of await page.getByRole("spinbutton").all()) {
        const rect = await input.boundingBox();
        expect(rect).not.toBeNull();
        expect(rect!.x).toBeGreaterThanOrEqual(0);
        expect(rect!.x + rect!.width).toBeLessThanOrEqual(width);
        expect(rect!.height).toBeGreaterThanOrEqual(44);
      }
    }
  }
});
test("check-in draft stays with its record and a reviewed result cannot restore it", async ({
  page,
}) => {
  const id = randomUUID(),
    second = randomUUID();
  const available = await fetch("http://127.0.0.1:54321/pg/query", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query: `select d::date as day from generate_series(date '2025-01-04',date '2026-08-01',interval '7 days') d where not exists(select 1 from checkins c where c.client_id='${clientId}' and c.week_ending_saturday in (d::date,d::date+7)) order by d desc limit 1`,
    }),
  });
  const date = (await available.json())[0].day;
  await sql(
    `insert into checkins(id,client_id,template_id,week_ending_saturday) values ('${id}','${clientId}','a9082026-a001-4000-8000-000000000401','${date}'),('${second}','${clientId}','a9082026-a001-4000-8000-000000000401',date '${date}'+7);`,
  );
  await sql(
    `update clients set checkin_start_date='${date}' where id='${clientId}';`,
  );
  try {
    await login(page);
    await page.goto(`/app/checkins?checkin=${id}`);
    const answer = page.getByRole("textbox", {
      name: "Biggest win or blocker?",
    });
    await expect(answer).toBeEnabled();
    await answer.fill("Recovery test belongs to this check-in");
    await page.getByRole("radio", { name: "8", exact: true }).check();
    await expect(
      page.getByRole("status").filter({ hasText: "Draft saved" }),
    ).toBeVisible();
    await page.reload();
    await expect(answer).toHaveValue("Recovery test belongs to this check-in");
    await expect(
      page.getByRole("radio", { name: "8", exact: true }),
    ).toBeChecked();
    await page.goto(`/app/checkins?checkin=${second}`);
    await expect(answer).toHaveValue("");
    await page.goto(`/app/checkins?checkin=${id}`);
    await expect(answer).toHaveValue("Recovery test belongs to this check-in");
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jM9kAAAAASUVORK5CYII=",
      "base64",
    );
    for (let index = 0; index < 3; index++)
      await page.locator("input[type=file]").nth(index).setInputFiles({
        name: "review.png",
        mimeType: "image/png",
        buffer: png,
      });
    await expect(
      page.getByRole("status").filter({ hasText: "Draft saved" }),
    ).toBeVisible();
    await page.reload();
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await expect(page.locator('img[alt$="preview"]')).toHaveCount(3);
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await page.evaluate(async (id) => {
      const { supabase } = await import(
        /* @vite-ignore */ "/src/lib/supabase.ts"
      );
      const { draftStore, draftKey } = await import(
        /* @vite-ignore */ "/src/lib/record-drafts.ts"
      );
      const {
        data: { user },
      } = await supabase.auth.getUser();
      (window as any).__reviewDraft = {
        key: draftKey(user.id, "checkin", id),
        data: await draftStore(draftKey(user.id, "checkin", id), "read"),
      };
    }, id);
    await page.route("**/rest/v1/checkins*", (route) =>
      route.request().method() === "PATCH" ? route.abort() : route.continue(),
    );
    await page
      .getByRole("button", { name: "Submit check-in", exact: true })
      .click();
    await expect(
      page.getByText("Unable to submit check-in.", { exact: true }),
    ).toBeVisible();
    await page.unroute("**/rest/v1/checkins*");
    await page
      .getByRole("button", { name: "Submit check-in", exact: true })
      .click();
    await expect(
      page.getByText("Check-in submitted.", { exact: true }),
    ).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`checkin=${id}`));
    await expect(
      page.getByText("Recovery test belongs to this check-in", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("Required photo missing from submission", { exact: true }),
    ).toHaveCount(0);
    await sql(
      `select public.review_checkin('${id}','Reviewed record is authoritative',true);`,
    );
    await page.evaluate(async () => {
      const { draftStore } = await import(
        /* @vite-ignore */ "/src/lib/record-drafts.ts"
      );
      const stale = (window as any).__reviewDraft;
      stale.data.savedAt = Date.now() + 1;
      stale.data.value.answers["a9082026-a001-4000-8000-000000000403"] = {
        text: "Obsolete unsent draft",
      };
      await draftStore(stale.key, "write", stale.data);
    });
    await page.goto(`/app/checkins?checkin=${id}`);
    await expect(
      page.getByText("Reviewed record is authoritative", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("Obsolete unsent draft", { exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("textbox", { name: "Biggest win or blocker?" }),
    ).toHaveCount(0);
  } finally {
    await sql(
      `update clients set checkin_start_date='2026-08-15' where id='${clientId}';`,
    );
  }
});

test("meal targets stay separate from missing and zero actual intake", async ({
  page,
}) => {
  const plan = randomUUID(),
    day = randomUUID(),
    meal = randomUUID();
  await sql(`insert into assigned_nutrition_plans(id,client_id,nutrition_template_id,start_date,end_date,status) values ('${plan}','${clientId}','a9082026-a001-4000-8000-000000000301',current_date,current_date+7,'active');
    insert into assigned_nutrition_days(id,assigned_nutrition_plan_id,date,week_index,day_of_week) values ('${day}','${plan}',current_date,1,2);
    insert into assigned_nutrition_meals(id,assigned_nutrition_day_id,meal_order,meal_name,calories,protein_g,carbs_g,fat_g) values ('${meal}','${day}',1,'Recovery test meal',600,40,65,20);`);
  try {
    await login(page);
    await page.goto(`/app/nutrition/${day}`);
    const calories = page.getByRole("spinbutton", {
      name: "Calories (kcal)",
      exact: true,
    });
    await expect(calories).toHaveValue("");
    await expect(
      page.getByText("Calories: Not logged", { exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Use planned amounts", exact: true })
      .click();
    await expect(calories).toHaveValue("600");
    await calories.fill("");
    const save = page.getByRole("button", {
      name: "Save meal log",
      exact: true,
    });
    await save.click();
    await expect(save).toBeEnabled();
    await page.reload();
    await expect(calories).toHaveValue("");
    await expect(
      page.getByText("Calories: Not logged", { exact: true }),
    ).toBeVisible();
    await calories.fill("0");
    await save.click();
    await expect(save).toBeEnabled();
    await page.reload();
    await expect(calories).toHaveValue("0");
    await expect(
      page.getByText("Calories: 0 kcal", { exact: true }),
    ).toBeVisible();
  } finally {
    await sql(`delete from assigned_nutrition_plans where id='${plan}';`);
  }
});

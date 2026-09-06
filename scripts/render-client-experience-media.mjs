import fs from "node:fs";
import { execSync } from "node:child_process";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDirectory, "..");
const outputDirectory = join(projectRoot, "public", "media");
const outputVideo = join(outputDirectory, "repsync-client-experience.webm");
const outputPoster = join(
  outputDirectory,
  "repsync-client-experience-poster.png",
);
const temporaryDirectory = await mkdtemp(
  join(tmpdir(), "repsync-client-media-"),
);

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) return {};

  return Object.fromEntries(
    fs
      .readFileSync(filePath, "utf8")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => {
        const separator = line.indexOf("=");
        return [
          line.slice(0, separator).trim(),
          line.slice(separator + 1).trim(),
        ];
      }),
  );
}

function loadLocalSupabaseStatus() {
  const output = execSync("npx supabase@latest status -o env", {
    cwd: projectRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  return Object.fromEntries(
    output
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.includes("="))
      .map((line) => {
        const separator = line.indexOf("=");
        const value = line
          .slice(separator + 1)
          .trim()
          .replace(/^"|"$/g, "");
        return [line.slice(0, separator), value];
      }),
  );
}

const env = {
  ...loadEnv(join(projectRoot, ".env.local")),
  ...loadEnv(join(projectRoot, ".env.e2e.local")),
};
const localSupabaseStatus = loadLocalSupabaseStatus();
const config = {
  baseURL:
    process.env.E2E_BASE_URL || env.E2E_BASE_URL || "http://127.0.0.1:5173",
  supabaseURL: process.env.VITE_SUPABASE_URL || env.VITE_SUPABASE_URL,
  supabaseAnonKey:
    process.env.VITE_SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY,
  supabaseServiceRoleKey:
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    env.SUPABASE_SERVICE_ROLE_KEY ||
    localSupabaseStatus.SERVICE_ROLE_KEY,
  ptEmail: process.env.E2E_PT_EMAIL || env.E2E_PT_EMAIL,
  ptPassword: process.env.E2E_PT_PASSWORD || env.E2E_PT_PASSWORD,
  clientEmail: process.env.E2E_CLIENT_EMAIL || env.E2E_CLIENT_EMAIL,
  clientPassword: process.env.E2E_CLIENT_PASSWORD || env.E2E_CLIENT_PASSWORD,
  clientId:
    process.env.E2E_CLIENT_ID ||
    env.E2E_CLIENT_ID ||
    "00000000-0000-4000-8000-000000000101",
  nutritionTemplateId:
    process.env.E2E_NUTRITION_TEMPLATE_ID ||
    env.E2E_NUTRITION_TEMPLATE_ID ||
    "00000000-0000-4000-8000-000000000301",
  workoutAssignmentId:
    process.env.E2E_WORKOUT_ASSIGNMENT_ID ||
    env.E2E_WORKOUT_ASSIGNMENT_ID ||
    "00000000-0000-4000-8000-000000001101",
  captureDate: "2026-07-17",
  fixedNow: "2026-07-17T10:00:00+03:00",
};

const requiredConfig = [
  "supabaseURL",
  "supabaseAnonKey",
  "supabaseServiceRoleKey",
  "ptEmail",
  "ptPassword",
  "clientEmail",
  "clientPassword",
];
for (const key of requiredConfig) {
  if (!config[key]) throw new Error(`Missing ${key} in the local environment.`);
}

function addClientCaptureInitScript(context) {
  return context.addInitScript(
    ({ fixedNow }) => {
      const NativeDate = Date;
      class FixedDate extends NativeDate {
        constructor(...args) {
          super(...(args.length ? args : [fixedNow]));
        }

        static now() {
          return new NativeDate(fixedNow).getTime();
        }
      }

      window.Date = FixedDate;
      window.localStorage.setItem("coachos_cached_role", "client");
      window.localStorage.setItem("coachos-theme-preference", "light");
      window.localStorage.setItem("coachos-theme-light-default-migrated", "1");
    },
    { fixedNow: config.fixedNow },
  );
}

async function waitForUi(page, readyText) {
  await page.waitForLoadState("domcontentloaded");
  await page
    .locator("main")
    .first()
    .waitFor({ state: "visible", timeout: 20_000 });
  if (readyText) {
    await page
      .getByText(readyText, { exact: false })
      .first()
      .waitFor({ state: "visible", timeout: 20_000 });
  }
  await page.waitForTimeout(900);
}

async function signIn(email, password) {
  const supabase = createClient(config.supabaseURL, config.supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: authError } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (authError) throw authError;
  return supabase;
}

async function prepareCaptureData() {
  const adminSupabase = createClient(
    config.supabaseURL,
    config.supabaseServiceRoleKey,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const ptSupabase = await signIn(config.ptEmail, config.ptPassword);
  const clientSupabase = await signIn(
    config.clientEmail,
    config.clientPassword,
  );

  const { data, error } = await ptSupabase.rpc(
    "assign_nutrition_template_to_client",
    {
      p_client_id: config.clientId,
      p_template_id: config.nutritionTemplateId,
      p_start_date: config.captureDate,
    },
  );
  if (error) throw error;

  const assignedPlanId = data?.[0]?.assigned_plan_id ?? null;
  const { data: existingHabitLog, error: habitQueryError } =
    await clientSupabase
      .from("habit_logs")
      .select("id")
      .eq("client_id", config.clientId)
      .eq("log_date", config.captureDate)
      .maybeSingle();
  if (habitQueryError) throw habitQueryError;

  let insertedHabitLogId = null;
  if (!existingHabitLog) {
    const { data: insertedHabitLog, error: habitInsertError } =
      await clientSupabase
        .from("habit_logs")
        .insert({
          client_id: config.clientId,
          log_date: config.captureDate,
          calories: 1790,
          protein_g: 140,
          carbs_g: 182,
          fats_g: 54,
          weight_value: 67.6,
          weight_unit: "kg",
          sleep_hours: 7.5,
          steps: 10240,
          energy: 8,
          hunger: 4,
          stress: 3,
          notes: "Energy steady. Lower-body session felt strong.",
        })
        .select("id")
        .single();
    if (habitInsertError) throw habitInsertError;
    insertedHabitLogId = insertedHabitLog.id;
  }

  const captureStartedAt = new Date(config.fixedNow).toISOString();
  const { data: discoveredWorkoutSessions, error: sessionQueryError } =
    await adminSupabase
      .from("workout_sessions")
      .select("id, started_at, completed_at")
      .eq("assigned_workout_id", config.workoutAssignmentId);
  if (sessionQueryError) throw sessionQueryError;
  const staleCaptureSessionIds = (discoveredWorkoutSessions ?? [])
    .filter(
      (session) =>
        session.started_at === captureStartedAt && !session.completed_at,
    )
    .map((session) => session.id);
  if (staleCaptureSessionIds.length > 0) {
    const { error: staleSessionCleanupError } = await adminSupabase
      .from("workout_sessions")
      .delete()
      .in("id", staleCaptureSessionIds);
    if (staleSessionCleanupError) throw staleSessionCleanupError;
  }
  const existingWorkoutSessionIds = new Set(
    (discoveredWorkoutSessions ?? [])
      .map((session) => session.id)
      .filter((id) => !staleCaptureSessionIds.includes(id)),
  );
  return {
    cleanup: async () => {
      const { data: currentWorkoutSessions, error: currentSessionError } =
        await adminSupabase
          .from("workout_sessions")
          .select("id")
          .eq("assigned_workout_id", config.workoutAssignmentId);
      if (currentSessionError) {
        console.warn(
          `Could not inspect temporary workout session: ${currentSessionError.message}`,
        );
      } else {
        const temporarySessionIds = (currentWorkoutSessions ?? [])
          .map((session) => session.id)
          .filter((id) => !existingWorkoutSessionIds.has(id));
        if (temporarySessionIds.length > 0) {
          const { error: workoutCleanupError } = await adminSupabase
            .from("workout_sessions")
            .delete()
            .in("id", temporarySessionIds);
          if (workoutCleanupError) {
            console.warn(
              `Could not remove temporary workout session: ${workoutCleanupError.message}`,
            );
          }
        }
      }

      if (insertedHabitLogId) {
        const { error: habitCleanupError } = await adminSupabase
          .from("habit_logs")
          .delete()
          .eq("id", insertedHabitLogId);
        if (habitCleanupError) {
          console.warn(
            `Could not remove temporary habit log: ${habitCleanupError.message}`,
          );
        }
      }

      if (assignedPlanId) {
        const { error: nutritionCleanupError } = await adminSupabase
          .from("assigned_nutrition_plans")
          .delete()
          .eq("id", assignedPlanId);
        if (nutritionCleanupError) {
          console.warn(
            `Could not remove temporary nutrition plan: ${nutritionCleanupError.message}`,
          );
        }
      }
    },
  };
}

async function loginClient(browser) {
  const context = await browser.newContext({
    viewport: { width: 430, height: 800 },
    deviceScaleFactor: 1,
    colorScheme: "light",
  });
  await addClientCaptureInitScript(context);
  const page = await context.newPage();
  await page.goto(`${config.baseURL}/login`, { waitUntil: "domcontentloaded" });
  await page
    .locator('input[type="email"], input[name="email"]')
    .first()
    .fill(config.clientEmail);
  await page
    .locator('input[type="password"], input[name="password"]')
    .first()
    .fill(config.clientPassword);
  await page.locator('button[type="submit"]').last().click();
  await page.waitForURL((url) => !url.pathname.includes("/login"), {
    timeout: 20_000,
  });
  return { context, page };
}

async function prepareCapturePage(page) {
  await page.addStyleTag({
    content: `
      nav, footer { display: none !important; }
      body { padding-bottom: 0 !important; }
      [class*="fixed"][class*="bottom-"] { display: none !important; }
    `,
  });
}

async function captureRoute(
  page,
  { route, readyText, target, fileName, setup, scrollOffset = 0 },
) {
  await page.goto(`${config.baseURL}${route}`, {
    waitUntil: "domcontentloaded",
    timeout: 20_000,
  });
  await waitForUi(page, readyText);
  await prepareCapturePage(page);
  if (setup) await setup(page);
  return captureCurrentPage(page, { target, fileName, scrollOffset });
}

async function captureCurrentPage(
  page,
  { target, fileName, setup, scrollOffset = 0 },
) {
  if (setup) await setup(page);
  if (target) {
    const locator = page.locator(target).first();
    if (await locator.isVisible().catch(() => false)) {
      await locator.evaluate((element) =>
        element.scrollIntoView({ block: "start" }),
      );
      if (scrollOffset) {
        await page.evaluate(
          (offset) => window.scrollBy(0, offset),
          scrollOffset,
        );
      }
      await page.waitForTimeout(700);
    }
  }
  const path = join(temporaryDirectory, fileName);
  await page.screenshot({ path, type: "png" });
  return path;
}

async function captureClientFrames(browser) {
  const { context, page } = await loginClient(browser);
  const todayFrame = await captureRoute(page, {
    route: "/app/home",
    readyText: "Today's agenda",
    target: "#home-section-next-up",
    fileName: "01-today.png",
    setup: async (capturePage) => {
      const emptyNutritionLabel = capturePage
        .getByText("Your coach has not assigned a nutrition plan yet.", {
          exact: true,
        })
        .first();
      if (await emptyNutritionLabel.isVisible().catch(() => false)) {
        await emptyNutritionLabel.evaluate((element) => {
          element.textContent = "Performance nutrition targets";
        });
      }
    },
  });
  await page.goto(
    `${config.baseURL}/app/workout-run/${config.workoutAssignmentId}`,
    { waitUntil: "domcontentloaded", timeout: 20_000 },
  );
  await waitForUi(page);
  await prepareCapturePage(page);
  const startWorkoutButton = page
    .getByRole("button", { name: "Start workout", exact: true })
    .first();
  if (await startWorkoutButton.isVisible().catch(() => false)) {
    await startWorkoutButton.click();
  }
  await page
    .getByRole("button", { name: "Finish workout", exact: true })
    .waitFor({ state: "visible", timeout: 20_000 });

  const activeExercise = page
    .getByRole("button", { name: "Save sets", exact: true })
    .first()
    .locator("xpath=..")
    .locator("xpath=..");
  const setInputs = activeExercise.locator('input[type="number"]');
  if ((await setInputs.count()) >= 3) {
    await setInputs.nth(0).fill("42.5");
    await setInputs.nth(1).fill("8");
    await setInputs.nth(2).fill("7.5");
  }
  const firstSetDone = activeExercise.locator('input[type="checkbox"]').first();
  if (await firstSetDone.isVisible().catch(() => false)) {
    await firstSetDone.check();
  }
  const activeWorkoutFrame = await captureCurrentPage(page, {
    target: 'label:has-text("Exercise / Superset")',
    fileName: "03-active-workout.png",
  });

  const restTimerFrame = await captureCurrentPage(page, {
    target: "text=Rest timer",
    fileName: "04-rest-timer.png",
    setup: async (capturePage) => {
      const timerHeading = capturePage
        .getByText("Rest timer", { exact: true })
        .first();
      await timerHeading.evaluate((element) =>
        element.scrollIntoView({ block: "start" }),
      );
      const startTimerButton = capturePage
        .getByRole("button", { name: "Start", exact: true })
        .first();
      if (await startTimerButton.isVisible().catch(() => false)) {
        await startTimerButton.click();
      }
      await capturePage.waitForTimeout(1250);
    },
  });
  const workoutsFrame = await captureRoute(page, {
    route: "/app/workouts",
    readyText: "Active sessions ready to resume",
    target: "text=Active sessions ready to resume",
    fileName: "02-workouts.png",
    setup: async (capturePage) => {
      for (const description of [
        "Workouts scheduled for today.",
        "Planned sessions scheduled ahead.",
      ]) {
        const emptySection = capturePage
          .getByText(description, { exact: true })
          .first();
        if (await emptySection.isVisible().catch(() => false)) {
          await emptySection.evaluate((element) => {
            const card = element.closest(".surface-panel-portal");
            if (card instanceof HTMLElement) card.style.display = "none";
          });
        }
      }
    },
  });

  const frames = [
    {
      label: "TODAY",
      path: todayFrame,
    },
    {
      label: "WORKOUTS",
      path: workoutsFrame,
    },
    {
      label: "ACTIVE WORKOUT",
      path: activeWorkoutFrame,
    },
    {
      label: "REST TIMER",
      path: restTimerFrame,
    },
    {
      label: "NUTRITION",
      path: await captureRoute(page, {
        route: "/app/nutrition",
        readyText: "Nutrition",
        fileName: "05-nutrition.png",
      }),
    },
    {
      label: "HABITS",
      path: await captureRoute(page, {
        route: "/app/habits",
        readyText: "Habits",
        fileName: "06-habits.png",
      }),
    },
    {
      label: "CHECK-IN",
      path: await captureRoute(page, {
        route: "/app/checkins",
        readyText: "Check-in",
        fileName: "07-checkin.png",
      }),
    },
    {
      label: "MESSAGES",
      path: await captureRoute(page, {
        route: "/app/messages",
        readyText: "Messages",
        fileName: "08-messages.png",
      }),
    },
    {
      label: "PROGRESS",
      path: await captureRoute(page, {
        route: "/app/progress",
        readyText: "Progress",
        target: "text=Body weight",
        scrollOffset: -120,
        fileName: "09-progress.png",
      }),
    },
  ];

  await context.close();
  return frames;
}

function frameDataUrl(filePath) {
  return `data:image/png;base64,${fs.readFileSync(filePath).toString("base64")}`;
}

function buildSlideshowHtml(frames) {
  const images = frames
    .map(
      (frame, index) =>
        `<img class="client-frame${index === 0 ? " is-active" : ""}" src="${frameDataUrl(frame.path)}" alt="" />`,
    )
    .join("");
  const steps = frames
    .map(
      (frame, index) =>
        `<li class="client-step${index === 0 ? " is-active" : ""}"><span>${String(index + 1).padStart(2, "0")}</span>${frame.label}</li>`,
    )
    .join("");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      * { box-sizing: border-box; }
      html, body { width: 960px; height: 660px; margin: 0; overflow: hidden; }
      body {
        background: #fbf9f1;
        color: #18211d;
        cursor: none;
        font-family: Arial, Helvetica, sans-serif;
      }
      .stage { display: grid; grid-template-columns: 440px 1fr; gap: 48px; height: 100%; padding: 28px 48px; }
      .phone {
        position: relative;
        overflow: hidden;
        width: 406px;
        height: 604px;
        border: 1px solid rgba(40, 93, 73, 0.26);
        border-radius: 28px;
        background: #eef3f1;
        box-shadow: 0 24px 55px -38px rgba(20, 53, 42, 0.42);
      }
      .phone::before {
        position: absolute;
        top: 10px;
        left: 50%;
        z-index: 5;
        width: 54px;
        height: 4px;
        border-radius: 999px;
        background: rgba(24, 33, 29, 0.22);
        content: "";
        transform: translateX(-50%);
      }
      .client-frame {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        object-fit: cover;
        object-position: top center;
        opacity: 0;
        transform: scale(1.004);
        transition: opacity 300ms ease, transform 1650ms ease-out;
      }
      .client-frame.is-active { opacity: 1; transform: scale(1); }
      .copy { align-self: center; }
      .eyebrow { margin: 0 0 16px; color: #285d49; font-size: 11px; font-weight: 700; letter-spacing: 0.12em; }
      h1 { max-width: 350px; margin: 0 0 24px; font-family: Georgia, serif; font-size: 42px; font-weight: 500; line-height: 0.98; }
      ol { margin: 0; padding: 0; list-style: none; }
      .client-step {
        display: flex;
        gap: 14px;
        align-items: center;
        min-height: 34px;
        border-top: 1px solid rgba(40, 93, 73, 0.14);
        color: #68736e;
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.04em;
        transition: color 220ms ease, padding-left 220ms ease;
      }
      .client-step:last-child { border-bottom: 1px solid rgba(40, 93, 73, 0.14); }
      .client-step span { color: #8b958f; font-size: 10px; }
      .client-step.is-active { padding-left: 10px; color: #285d49; }
      .client-step.is-active span { color: #285d49; }
    </style>
  </head>
  <body>
    <main class="stage">
      <div class="phone">${images}</div>
      <section class="copy">
        <p class="eyebrow">REPSYNC CLIENT</p>
        <h1>Your coaching, in one clear view.</h1>
        <ol>${steps}</ol>
      </section>
    </main>
  </body>
</html>`;
}

await mkdir(outputDirectory, { recursive: true });
const captureData = await prepareCaptureData();
const browser = await chromium.launch({ headless: true });

try {
  const frames = await captureClientFrames(browser);
  const context = await browser.newContext({
    viewport: { width: 960, height: 660 },
    deviceScaleFactor: 1,
    colorScheme: "light",
    recordVideo: {
      dir: temporaryDirectory,
      size: { width: 960, height: 660 },
    },
  });
  const page = await context.newPage();
  const video = page.video();

  await page.setContent(buildSlideshowHtml(frames), { waitUntil: "load" });
  await page.waitForFunction(() =>
    Array.from(document.images).every((image) => image.complete),
  );
  await page.screenshot({ path: outputPoster, type: "png" });
  await page.waitForTimeout(1_800);

  for (let index = 1; index < frames.length; index += 1) {
    await page.evaluate((activeIndex) => {
      document
        .querySelectorAll(".client-frame")
        .forEach((frame, frameIndex) => {
          frame.classList.toggle("is-active", frameIndex === activeIndex);
        });
      document.querySelectorAll(".client-step").forEach((step, stepIndex) => {
        step.classList.toggle("is-active", stepIndex === activeIndex);
      });
    }, index);
    await page.waitForTimeout(index === frames.length - 1 ? 1_650 : 1_350);
  }

  await context.close();
  await video.saveAs(outputVideo);
} finally {
  await browser.close();
  await captureData.cleanup();
  await rm(temporaryDirectory, { recursive: true, force: true });
}

console.log(`Created ${outputVideo}`);
console.log(`Created ${outputPoster}`);

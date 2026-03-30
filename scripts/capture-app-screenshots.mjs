import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { chromium } from "playwright";

const repoRoot = process.cwd();
const envPath = path.join(repoRoot, ".env.e2e.local");
const outputRoot = path.join(
  repoRoot,
  "docs",
  "screenshots",
  `${new Date().toISOString().slice(0, 10)}-app-review`,
);

function loadEnvFile(filePath) {
  const env = {};
  if (!fs.existsSync(filePath)) return env;
  const raw = fs.readFileSync(filePath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const equalsIndex = trimmed.indexOf("=");
    if (equalsIndex === -1) continue;
    const key = trimmed.slice(0, equalsIndex).trim();
    const value = trimmed.slice(equalsIndex + 1).trim();
    env[key] = value;
  }
  return env;
}

const fileEnv = loadEnvFile(envPath);
const config = {
  baseURL:
    process.env.E2E_BASE_URL || fileEnv.E2E_BASE_URL || "http://127.0.0.1:4173",
  ptEmail: process.env.E2E_PT_EMAIL || fileEnv.E2E_PT_EMAIL,
  ptPassword: process.env.E2E_PT_PASSWORD || fileEnv.E2E_PT_PASSWORD,
  clientEmail: process.env.E2E_CLIENT_EMAIL || fileEnv.E2E_CLIENT_EMAIL,
  clientPassword:
    process.env.E2E_CLIENT_PASSWORD || fileEnv.E2E_CLIENT_PASSWORD,
  clientId: process.env.E2E_CLIENT_ID || fileEnv.E2E_CLIENT_ID,
};

function sanitizeName(value) {
  return value
    .replace(/[^a-z0-9-_]+/gi, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

async function waitForUi(page, timeoutMs = 15000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const loadingVisible = await page
      .getByText(/^Loading\.\.\.$/)
      .first()
      .isVisible()
      .catch(() => false);
    if (!loadingVisible) return;
    await page.waitForTimeout(250);
  }
}

async function waitForStable(page) {
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(1200);
  await waitForUi(page);
  await page.waitForTimeout(600);
}

async function isServerReachable(url) {
  try {
    const response = await fetch(url);
    return response.ok || response.status < 500;
  } catch {
    return false;
  }
}

async function waitForServer(url, timeoutMs = 120000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await isServerReachable(url)) return true;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  return false;
}

function startDevServer() {
  const child = spawn(
    "cmd.exe",
    ["/c", "npm run dev -- --host 127.0.0.1 --port 4173"],
    {
      cwd: repoRoot,
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
      windowsHide: true,
    },
  );

  child.stdout.on("data", (chunk) => {
    process.stdout.write(String(chunk));
  });
  child.stderr.on("data", (chunk) => {
    process.stderr.write(String(chunk));
  });

  return child;
}

async function login(page, email, password) {
  await page.goto(`${config.baseURL}/login`, { waitUntil: "domcontentloaded" });
  await waitForStable(page);
  if (!page.url().includes("/login")) return;

  const emailInput = page
    .locator(
      'input[type="email"], input[name="email"], input[autocomplete="email"]',
    )
    .first();
  const passwordInput = page
    .locator(
      'input[type="password"], input[name="password"], input[autocomplete="current-password"]',
    )
    .first();
  await emailInput.fill(email);
  await passwordInput.fill(password);
  await page.getByRole("button", { name: /^sign in$/i }).click();
  await page.waitForTimeout(2000);
  await waitForUi(page, 20000);
}

async function capture(page, relativePath, options = {}) {
  const target = path.join(outputRoot, `${relativePath}.png`);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  if (options.beforeShot) {
    await options.beforeShot();
    await page.waitForTimeout(500);
  }
  await waitForStable(page);
  await page.screenshot({
    path: target,
    fullPage: options.fullPage ?? true,
    animations: "disabled",
  });
  console.log(`saved ${path.relative(repoRoot, target)}`);
}

async function gotoAndCapture(page, relativePath, urlPath, options = {}) {
  await page.goto(`${config.baseURL}${urlPath}`, {
    waitUntil: "domcontentloaded",
  });
  await capture(page, relativePath, options);
}

async function clickIfVisible(page, role, name, timeout = 2000) {
  const locator = page.getByRole(role, { name }).first();
  if (await locator.isVisible({ timeout }).catch(() => false)) {
    await locator.click();
    return true;
  }
  return false;
}

async function captureClientDetailTabs(page) {
  const tabNames = [
    "Overview",
    "Onboarding",
    "Workout",
    "Nutrition",
    "Habits",
    "Progress",
    "Logs",
    "Check-ins",
    "Notes",
    "Baseline",
  ];

  await page.goto(`${config.baseURL}/pt/clients/${config.clientId}`, {
    waitUntil: "domcontentloaded",
  });
  await waitForStable(page);

  for (const tabName of tabNames) {
    const tabButton = page
      .getByRole("tab", { name: new RegExp(`^${tabName}$`, "i") })
      .first();
    if (!(await tabButton.isVisible().catch(() => false))) continue;
    await tabButton.click();
    await page.waitForTimeout(800);
    await capture(page, `pt/client-detail/tab-${sanitizeName(tabName)}`);
  }
}

async function captureLifecycleModal(page) {
  await page.goto(`${config.baseURL}/pt/clients/${config.clientId}`, {
    waitUntil: "domcontentloaded",
  });
  await waitForStable(page);
  const opened = await clickIfVisible(page, "button", /mark paused/i, 4000);
  if (!opened) {
    console.log("skipped lifecycle modal screenshot");
    return;
  }
  await capture(page, "pt/client-detail/modal-lifecycle", { fullPage: false });
  await page.keyboard.press("Escape");
}

async function captureCheckinReviewModal(page) {
  await page.goto(`${config.baseURL}/pt/clients/${config.clientId}`, {
    waitUntil: "domcontentloaded",
  });
  await waitForStable(page);
  const checkinsTab = page.getByRole("tab", { name: /^Check-ins$/i }).first();
  if (!(await checkinsTab.isVisible().catch(() => false))) {
    console.log("skipped check-in review screenshots");
    return;
  }
  await checkinsTab.click();
  await page.waitForTimeout(1200);

  const reviewButton = page
    .getByRole("button", { name: /review|edit review/i })
    .first();
  if (!(await reviewButton.isVisible({ timeout: 4000 }).catch(() => false))) {
    console.log("skipped check-in review screenshots");
    return;
  }

  await reviewButton.click();
  await page.waitForTimeout(1200);
  await capture(page, "pt/client-detail/modal-review-answers", {
    fullPage: false,
  });

  const photosTab = page.getByRole("tab", { name: /^Photos/i }).first();
  if (await photosTab.isVisible().catch(() => false)) {
    await photosTab.click();
    await page.waitForTimeout(700);
    await capture(page, "pt/client-detail/modal-review-photos", {
      fullPage: false,
    });
  }

  const notesTab = page.getByRole("tab", { name: /^Notes$/i }).first();
  if (await notesTab.isVisible().catch(() => false)) {
    await notesTab.click();
    await page.waitForTimeout(700);
    await capture(page, "pt/client-detail/modal-review-notes", {
      fullPage: false,
    });
  }

  await page.keyboard.press("Escape");
}

async function tryCaptureFirstLinkedPage(
  page,
  listPath,
  linkPattern,
  savePath,
) {
  await page.goto(`${config.baseURL}${listPath}`, {
    waitUntil: "domcontentloaded",
  });
  await waitForStable(page);
  const link = page.locator(`a[href*="${linkPattern}"]`).first();
  if (!(await link.isVisible().catch(() => false))) {
    console.log(`skipped ${savePath}`);
    return;
  }
  await Promise.all([page.waitForLoadState("domcontentloaded"), link.click()]);
  await capture(page, savePath);
}

async function main() {
  if (
    !config.ptEmail ||
    !config.ptPassword ||
    !config.clientEmail ||
    !config.clientPassword
  ) {
    throw new Error("Missing E2E credentials in .env.e2e.local.");
  }
  if (!config.clientId) {
    throw new Error("Missing E2E_CLIENT_ID in .env.e2e.local.");
  }

  fs.mkdirSync(outputRoot, { recursive: true });

  let devServer = null;
  if (!(await isServerReachable(config.baseURL))) {
    devServer = startDevServer();
    const ready = await waitForServer(config.baseURL);
    if (!ready) {
      devServer.kill();
      throw new Error(`Local app did not start at ${config.baseURL}.`);
    }
  }

  const browser = await chromium.launch({ headless: true });
  const baseContextOptions = {
    viewport: { width: 1600, height: 1100 },
    colorScheme: "dark",
  };

  try {
    const publicContext = await browser.newContext(baseContextOptions);
    const publicPage = await publicContext.newPage();
    const ptContext = await browser.newContext(baseContextOptions);
    await ptContext.addInitScript(() => {
      window.localStorage.setItem("coachos_cached_role", "pt");
    });
    const ptPage = await ptContext.newPage();
    const clientContext = await browser.newContext(baseContextOptions);
    await clientContext.addInitScript(() => {
      window.localStorage.setItem("coachos_cached_role", "client");
    });
    const clientPage = await clientContext.newPage();

    await gotoAndCapture(publicPage, "public/welcome", "/");
    await gotoAndCapture(publicPage, "public/login", "/login");
    await gotoAndCapture(publicPage, "public/signup-role", "/signup");
    await gotoAndCapture(publicPage, "public/signup-pt", "/signup/pt");
    await gotoAndCapture(publicPage, "public/privacy", "/privacy");
    await gotoAndCapture(publicPage, "public/terms", "/terms");
    await gotoAndCapture(publicPage, "public/support", "/support");
    await gotoAndCapture(publicPage, "public/health", "/health");

    await login(ptPage, config.ptEmail, config.ptPassword);
    await gotoAndCapture(ptPage, "pt-hub/overview", "/pt-hub");
    await gotoAndCapture(ptPage, "pt-hub/profile", "/pt-hub/profile");
    await gotoAndCapture(
      ptPage,
      "pt-hub/profile-preview",
      "/pt-hub/profile/preview",
    );
    await gotoAndCapture(ptPage, "pt-hub/leads", "/pt-hub/leads");
    await gotoAndCapture(ptPage, "pt-hub/clients", "/pt-hub/clients");
    await gotoAndCapture(ptPage, "pt-hub/workspaces", "/pt-hub/workspaces");
    await gotoAndCapture(ptPage, "pt-hub/payments", "/pt-hub/payments");
    await gotoAndCapture(ptPage, "pt-hub/analytics", "/pt-hub/analytics");
    await gotoAndCapture(ptPage, "pt-hub/settings", "/pt-hub/settings");

    await gotoAndCapture(ptPage, "pt/dashboard", "/pt/dashboard");
    await gotoAndCapture(ptPage, "pt/clients", "/pt/clients");
    await gotoAndCapture(
      ptPage,
      "pt/client-detail/overview",
      `/pt/clients/${config.clientId}`,
    );
    await captureClientDetailTabs(ptPage);
    await captureLifecycleModal(ptPage);
    await captureCheckinReviewModal(ptPage);
    await gotoAndCapture(ptPage, "pt/programs", "/pt/programs");
    await gotoAndCapture(ptPage, "pt/calendar", "/pt/calendar");
    await gotoAndCapture(ptPage, "pt/checkins", "/pt/checkins");
    await gotoAndCapture(
      ptPage,
      "pt/checkin-templates",
      "/pt/checkins/templates",
    );
    await gotoAndCapture(ptPage, "pt/messages", "/pt/messages");
    await gotoAndCapture(ptPage, "pt/notifications", "/pt/notifications");
    await gotoAndCapture(ptPage, "pt/ops-status", "/pt/ops/status");
    await gotoAndCapture(
      ptPage,
      "pt/baseline-settings",
      "/pt/settings/baseline",
    );
    await gotoAndCapture(ptPage, "pt/exercises", "/pt/settings/exercises");
    await gotoAndCapture(
      ptPage,
      "pt/nutrition-programs",
      "/pt/nutrition-programs",
    );
    await gotoAndCapture(ptPage, "settings/workspace", "/settings/workspace");
    await gotoAndCapture(
      ptPage,
      "settings/public-profile",
      "/settings/public-profile",
    );
    await gotoAndCapture(ptPage, "settings/account", "/settings/account");
    await gotoAndCapture(ptPage, "settings/billing", "/settings/billing");
    await gotoAndCapture(ptPage, "settings/appearance", "/settings/appearance");
    await gotoAndCapture(ptPage, "settings/defaults", "/settings/defaults");
    await gotoAndCapture(ptPage, "settings/danger", "/settings/danger");
    await tryCaptureFirstLinkedPage(
      ptPage,
      "/pt/templates/workouts",
      "/pt/templates/workouts/",
      "pt/workout-templates/preview",
    );

    await login(clientPage, config.clientEmail, config.clientPassword);
    await gotoAndCapture(clientPage, "client/onboarding", "/app/onboarding");
    await gotoAndCapture(clientPage, "client/home", "/app/home");
    await gotoAndCapture(
      clientPage,
      "client/workouts-today",
      "/app/workouts/today",
    );
    await gotoAndCapture(clientPage, "client/checkin", "/app/checkin");
    await gotoAndCapture(clientPage, "client/messages", "/app/messages");
    await gotoAndCapture(
      clientPage,
      "client/notifications",
      "/app/notifications",
    );
    await gotoAndCapture(clientPage, "client/profile", "/app/profile");
    await gotoAndCapture(clientPage, "client/habits", "/app/habits");
    await gotoAndCapture(clientPage, "client/progress", "/app/progress");
    await gotoAndCapture(clientPage, "client/baseline", "/app/baseline");

    await tryCaptureFirstLinkedPage(
      clientPage,
      "/app/workouts/today",
      "/app/workouts/",
      "client/workout-detail",
    );
    await tryCaptureFirstLinkedPage(
      clientPage,
      "/app/home",
      "/app/nutrition/",
      "client/nutrition-day",
    );

    await Promise.all([
      publicContext.close(),
      ptContext.close(),
      clientContext.close(),
    ]);
  } finally {
    await browser.close();
    if (devServer) {
      devServer.kill();
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

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
  "pt",
  "client-detail",
);

function loadEnvFile(filePath) {
  const env = {};
  if (!fs.existsSync(filePath)) return env;
  const raw = fs.readFileSync(filePath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator === -1) continue;
    env[trimmed.slice(0, separator)] = trimmed.slice(separator + 1);
  }
  return env;
}

const fileEnv = loadEnvFile(envPath);
const config = {
  baseURL:
    process.env.E2E_BASE_URL || fileEnv.E2E_BASE_URL || "http://127.0.0.1:4173",
  ptEmail: process.env.E2E_PT_EMAIL || fileEnv.E2E_PT_EMAIL,
  ptPassword: process.env.E2E_PT_PASSWORD || fileEnv.E2E_PT_PASSWORD,
  clientId: process.env.E2E_CLIENT_ID || fileEnv.E2E_CLIENT_ID,
};

function safeSlug(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
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
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await isServerReachable(url)) return true;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  return false;
}

function startDevServer() {
  return spawn(
    "cmd.exe",
    ["/c", "npm run dev -- --host 127.0.0.1 --port 4173"],
    {
      cwd: repoRoot,
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
      windowsHide: true,
    },
  );
}

async function waitForUi(page, timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const loadingVisible = await page
      .getByText(/^Loading\.\.\.$/)
      .first()
      .isVisible()
      .catch(() => false);
    if (!loadingVisible) return;
    await page.waitForTimeout(250);
  }
}

async function stabilize(page) {
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(1200);
  await waitForUi(page);
  await page.waitForTimeout(500);
}

async function login(page) {
  await page.goto(`${config.baseURL}/login`, { waitUntil: "domcontentloaded" });
  await stabilize(page);
  await page.evaluate(() => {
    window.localStorage.setItem("coachos_cached_role", "pt");
  });
  if (!page.url().includes("/login")) return;
  await page.locator('input[type="email"]').first().fill(config.ptEmail);
  await page.locator('input[type="password"]').first().fill(config.ptPassword);
  await page.getByRole("button", { name: /^sign in$/i }).click();
  await page.waitForTimeout(1800);
  await waitForUi(page, 20000);
}

async function snap(page, name, fullPage = true) {
  fs.mkdirSync(outputRoot, { recursive: true });
  const target = path.join(outputRoot, `${name}.png`);
  await stabilize(page);
  await page.screenshot({ path: target, fullPage, animations: "disabled" });
  console.log(`saved ${path.relative(repoRoot, target)}`);
}

async function dismissOverlay(page) {
  await page.keyboard.press("Escape").catch(() => {});
  await page.waitForTimeout(250);
  await page.keyboard.press("Escape").catch(() => {});
  await page.waitForTimeout(250);
}

async function clickText(page, label) {
  await dismissOverlay(page);
  const locator = page.getByText(new RegExp(`^${label}$`, "i")).first();
  if (!(await locator.isVisible().catch(() => false))) return false;
  await locator.click();
  await page.waitForTimeout(800);
  return true;
}

async function main() {
  let devServer = null;
  if (!(await isServerReachable(config.baseURL))) {
    devServer = startDevServer();
    const ready = await waitForServer(config.baseURL);
    if (!ready)
      throw new Error(`App server did not start at ${config.baseURL}`);
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1600, height: 1100 },
    colorScheme: "dark",
  });
  const page = await context.newPage();

  try {
    await login(page);
    await page.goto(`${config.baseURL}/pt/clients/${config.clientId}`, {
      waitUntil: "domcontentloaded",
    });
    await snap(page, "overview");

    for (const tab of [
      "Onboarding",
      "Workout",
      "Nutrition",
      "Habits",
      "Progress",
      "Logs",
      "Check-ins",
      "Notes",
      "Baseline",
    ]) {
      if (await clickText(page, tab)) {
        await snap(page, `tab-${safeSlug(tab)}`);
      }
    }

    const moreActions = page
      .getByRole("button", { name: /more actions/i })
      .first();
    if (await moreActions.isVisible().catch(() => false)) {
      await moreActions.click();
      await page.waitForTimeout(300);
      const markPaused = page.getByText(/^Mark paused$/i).first();
      if (await markPaused.isVisible().catch(() => false)) {
        await markPaused.click();
        await page.waitForTimeout(500);
        await snap(page, "modal-lifecycle", false);
        await dismissOverlay(page);
      }
    }

    if (await clickText(page, "Check-ins")) {
      const reviewButton = page
        .getByRole("button", { name: /review|edit review/i })
        .first();
      if (await reviewButton.isVisible({ timeout: 4000 }).catch(() => false)) {
        await reviewButton.click();
        await page.waitForTimeout(900);
        await snap(page, "modal-review-answers", false);
        for (const tab of ["Photos", "Notes"]) {
          const tabButton = page
            .getByRole("tab", { name: new RegExp(`^${tab}`, "i") })
            .first();
          if (await tabButton.isVisible().catch(() => false)) {
            await tabButton.click();
            await page.waitForTimeout(700);
            await snap(page, `modal-review-${safeSlug(tab)}`, false);
          }
        }
        await dismissOverlay(page);
      }
    }
  } finally {
    await browser.close();
    if (devServer) devServer.kill();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

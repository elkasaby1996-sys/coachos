import fs from "node:fs";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDirectory, "..");
const outputDirectory = join(projectRoot, "public", "media");
const outputVideo = join(outputDirectory, "repsync-workflow-motion.webm");
const outputPoster = join(outputDirectory, "repsync-workflow-poster.png");
const temporaryDirectory = await mkdtemp(join(tmpdir(), "repsync-hero-"));
const envFile = join(projectRoot, ".env.e2e.local");

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
        return [line.slice(0, separator).trim(), line.slice(separator + 1).trim()];
      }),
  );
}

const fileEnv = loadEnv(envFile);
const config = {
  baseURL:
    process.env.E2E_BASE_URL ||
    fileEnv.E2E_BASE_URL ||
    "http://127.0.0.1:5173",
  email: process.env.E2E_PT_EMAIL || fileEnv.E2E_PT_EMAIL,
  password: process.env.E2E_PT_PASSWORD || fileEnv.E2E_PT_PASSWORD,
  clientId:
    process.env.E2E_CLIENT_ID ||
    fileEnv.E2E_CLIENT_ID ||
    "00000000-0000-4000-8000-000000000101",
  leadId:
    process.env.E2E_LEAD_ID ||
    fileEnv.E2E_LEAD_ID ||
    "00000000-0000-4000-8000-000000000711",
};

if (!config.email || !config.password) {
  throw new Error("Missing local PT credentials in .env.e2e.local.");
}

function addLightModeInitScript(context) {
  return context.addInitScript(() => {
    window.localStorage.setItem("coachos_cached_role", "pt");
    window.localStorage.setItem("coachos-theme-preference", "light");
    window.localStorage.setItem("coachos-theme-light-default-migrated", "1");
    window.localStorage.setItem("coachos-pt-hub-theme-mode", "light");
    window.localStorage.setItem("coachos-pt-hub-light-default-migrated", "1");
  });
}

async function waitForUi(page, timeoutMs = 15_000) {
  await page.waitForLoadState("domcontentloaded");
  await page
    .locator("main")
    .first()
    .waitFor({ state: "visible", timeout: timeoutMs })
    .catch(() => undefined);

  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const loading = await page
      .getByText(/^Loading\.\.\.$/)
      .first()
      .isVisible()
      .catch(() => false);
    if (!loading) break;
    await page.waitForTimeout(120);
  }
}

async function waitForContent(page, text) {
  await page
    .getByText(text, { exact: false })
    .first()
    .waitFor({ state: "visible", timeout: 15_000 });
  await page.waitForTimeout(650);
}

async function loginAndGetStorageState(browser) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 990 },
    colorScheme: "light",
  });
  await addLightModeInitScript(context);

  const page = await context.newPage();
  await page.goto(`${config.baseURL}/login`, { waitUntil: "domcontentloaded" });
  await waitForUi(page);

  if (page.url().includes("/login")) {
    await page
      .locator('input[type="email"], input[name="email"]')
      .first()
      .fill(config.email);
    await page
      .locator('input[type="password"], input[name="password"]')
      .first()
      .fill(config.password);
    await page.locator('button[type="submit"]').last().click();
    await page.waitForURL((url) => !url.pathname.includes("/login"), {
      timeout: 20_000,
    });
    await waitForUi(page);
  }

  await page.goto(`${config.baseURL}/pt/settings`, {
    waitUntil: "domcontentloaded",
  });
  await waitForUi(page);
  const lightModeButton = page
    .getByRole("button", { name: /Switch to light mode/i })
    .first();
  if (await lightModeButton.isVisible().catch(() => false)) {
    await lightModeButton.evaluate((element) => element.click());
    await page.waitForTimeout(600);
  }

  const storageState = await context.storageState();
  await context.close();
  return storageState;
}

async function captureRoute(page, route, readyText, fileName) {
  await page.goto(`${config.baseURL}${route}`, {
    waitUntil: "domcontentloaded",
    timeout: 20_000,
  });
  await waitForUi(page);
  await waitForContent(page, readyText);
  const filePath = join(temporaryDirectory, fileName);
  await page.screenshot({ path: filePath, type: "png" });
  return filePath;
}

async function captureProductFrames(browser, storageState) {
  const context = await browser.newContext({
    storageState,
    viewport: { width: 1440, height: 990 },
    deviceScaleFactor: 1,
    colorScheme: "light",
  });
  await addLightModeInitScript(context);
  const page = await context.newPage();

  const frames = [];
  const leadsPath = await captureRoute(
    page,
    "/pt-hub/leads",
    "Priya Nair",
    "01-leads.png",
  );
  frames.push({
    label: "01 / APPLICATION",
    path: leadsPath,
  });
  // Chromium trims most of the first static hold; repeat the opening frame so
  // the exported tour begins on the application pipeline instead of review.
  frames.push({
    label: "01 / APPLICATION",
    path: leadsPath,
  });
  const discoveredLeadRoute = await page
    .locator('a[href*="/pt-hub/leads/"]')
    .first()
    .getAttribute("href")
    .catch(() => null);
  frames.push({
    label: "02 / REVIEW",
    path: await captureRoute(
      page,
      discoveredLeadRoute || `/pt-hub/leads/${config.leadId}`,
      "Application snapshot",
      "02-lead-review.png",
    ),
  });
  frames.push({
    label: "03 / CLIENTS",
    path: await captureRoute(page, "/pt-hub/clients", "Zoe Ramirez", "03-clients.png"),
  });
  frames.push({
    label: "04 / CLIENT CONTEXT",
    path: await captureRoute(
      page,
      `/pt/clients/${config.clientId}`,
      "Zoe Ramirez",
      "04-client-context.png",
    ),
  });

  const workspaceHeading = page.getByText("Coaching Workspace", { exact: true });
  if (await workspaceHeading.isVisible().catch(() => false)) {
    await workspaceHeading.evaluate((element) =>
      element.scrollIntoView({ block: "center" }),
    );
    await page.waitForTimeout(500);
  }
  const workspacePath = join(temporaryDirectory, "05-coaching-workspace.png");
  await page.screenshot({ path: workspacePath, type: "png" });
  frames.push({ label: "05 / COACHING WORKSPACE", path: workspacePath });

  await page.goto(`${config.baseURL}/pt/messages`, {
    waitUntil: "domcontentloaded",
  });
  await waitForUi(page);
  await waitForContent(page, "Zoe Ramirez");
  const zoeConversation = page
    .getByRole("button", { name: /Zoe Ramirez/i })
    .first();
  if (await zoeConversation.isVisible().catch(() => false)) {
    await zoeConversation.evaluate((element) => element.click());
    await waitForContent(page, "Perfect. I completed");
  }
  const messagesPath = join(temporaryDirectory, "06-messages.png");
  await page.screenshot({ path: messagesPath, type: "png" });
  frames.push({ label: "06 / MESSAGES", path: messagesPath });

  frames.push({
    label: "07 / CLIENT ATTENTION",
    path: await captureRoute(
      page,
      "/pt/dashboard",
      "Clients Needing Attention",
      "07-attention.png",
    ),
  });

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
        `<img class="tour-frame${index === 0 ? " is-active" : ""}" src="${frameDataUrl(frame.path)}" alt="" />`,
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
      body { background: #f4f6f5; cursor: none; font-family: Arial, Helvetica, sans-serif; }
      .tour-frame {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        object-fit: cover;
        opacity: 0;
        transform: scale(1.006);
        transition: opacity 320ms ease, transform 1650ms ease-out;
      }
      .tour-frame.is-active { opacity: 1; transform: scale(1); }
      .tour-label {
        position: absolute;
        right: 18px;
        bottom: 18px;
        z-index: 3;
        padding: 9px 12px;
        border: 1px solid rgba(40, 93, 73, 0.18);
        border-radius: 6px;
        background: rgba(251, 249, 241, 0.94);
        color: #285d49;
        font-size: 10px;
        font-weight: 700;
        line-height: 1;
        letter-spacing: 0.08em;
        box-shadow: 0 10px 28px -20px rgba(15, 42, 33, 0.45);
      }
    </style>
  </head>
  <body>
    ${images}
    <div class="tour-label">${frames[0].label}</div>
  </body>
</html>`;
}

await mkdir(outputDirectory, { recursive: true });
const browser = await chromium.launch({ headless: true });

try {
  const storageState = await loginAndGetStorageState(browser);
  const frames = await captureProductFrames(browser, storageState);
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
  await page.waitForTimeout(3_100);

  for (let index = 1; index < frames.length; index += 1) {
    await page.evaluate(
      ({ activeIndex, label }) => {
        document.querySelectorAll(".tour-frame").forEach((frame, frameIndex) => {
          frame.classList.toggle("is-active", frameIndex === activeIndex);
        });
        document.querySelector(".tour-label").textContent = label;
      },
      { activeIndex: index, label: frames[index].label },
    );
    await page.waitForTimeout(index === frames.length - 1 ? 1_950 : 1_650);
  }

  await page.screenshot({ path: outputPoster, type: "png" });
  await page.waitForTimeout(250);
  await context.close();
  await video.saveAs(outputVideo);
} finally {
  await browser.close();
  await rm(temporaryDirectory, { recursive: true, force: true });
}

console.log(`Created ${outputVideo}`);
console.log(`Created ${outputPoster}`);

import fs from "node:fs";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDirectory, "..");
const outputDirectory = join(projectRoot, "public", "media");
const outputVideo = join(outputDirectory, "repsync-public-coach-profiles.webm");
const outputPoster = join(
  outputDirectory,
  "repsync-public-coach-profiles-poster.png",
);
const temporaryDirectory = await mkdtemp(
  join(tmpdir(), "repsync-public-profiles-"),
);
const baseURL = process.env.E2E_BASE_URL || "http://127.0.0.1:5173";
const viewport = { width: 960, height: 660 };

async function waitForUi(page) {
  await page.waitForLoadState("domcontentloaded");
  await page
    .locator("main")
    .first()
    .waitFor({ state: "visible", timeout: 15_000 });
  await page.waitForTimeout(500);
}

async function dismissMarketingConsent(page) {
  await page
    .getByRole("button", { name: "Decline", exact: true })
    .click()
    .catch(() => undefined);
}

async function capturePublishedCoachFlow(browser) {
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: 1,
    colorScheme: "light",
  });
  const page = await context.newPage();
  const frames = [];

  await page.goto(`${baseURL}/coaches`, { waitUntil: "domcontentloaded" });
  await waitForUi(page);
  await dismissMarketingConsent(page);
  await page.locator('a[href^="/p/"]').first().waitFor({
    state: "visible",
    timeout: 15_000,
  });
  const profilePaths = await page
    .locator('a[href^="/p/"]')
    .evaluateAll((links) => [
      ...new Set(
        links.map((link) => link.getAttribute("href")).filter(Boolean),
      ),
    ]);
  const profilePath = profilePaths[0];
  if (!profilePath) {
    throw new Error("No published coach profile was found on /coaches.");
  }
  await page.getByText("QA Coach Rivera", { exact: true }).evaluate((card) => {
    window.scrollTo({
      top: Math.max(0, card.getBoundingClientRect().top + window.scrollY - 200),
      behavior: "instant",
    });
  });
  await page.waitForTimeout(350);
  const marketplacePath = join(temporaryDirectory, "01-marketplace.png");
  await page.screenshot({ path: marketplacePath, type: "png" });
  frames.push({ label: "01 / DISCOVER COACHES", path: marketplacePath });

  await page.goto(`${baseURL}${profilePath}`, {
    waitUntil: "domcontentloaded",
  });
  await waitForUi(page);
  await page
    .locator("h1")
    .first()
    .waitFor({ state: "visible", timeout: 15_000 });
  const profilePathname = join(temporaryDirectory, "02-profile.png");
  await page.screenshot({ path: profilePathname, type: "png" });
  frames.push({ label: "02 / REVIEW THE PROFILE", path: profilePathname });

  const coachingOptionsLink = page.getByRole("link", {
    name: /view coaching options/i,
  });
  await coachingOptionsLink.click();
  await page
    .locator("#coaching-options")
    .waitFor({ state: "visible", timeout: 8_000 });
  await page.waitForTimeout(450);
  const coachingOptionsPath = join(temporaryDirectory, "03-options.png");
  await page.screenshot({ path: coachingOptionsPath, type: "png" });
  frames.push({
    label: "03 / CHOOSE A COACHING OPTION",
    path: coachingOptionsPath,
  });

  await page.getByRole("button", { name: /^apply to work with/i }).click();
  await page
    .getByText(/^Apply to work with /)
    .first()
    .waitFor({ state: "visible", timeout: 8_000 });
  await page.waitForTimeout(450);
  const applicationPath = join(temporaryDirectory, "04-application.png");
  await page.screenshot({ path: applicationPath, type: "png" });
  frames.push({ label: "04 / START THE CONVERSATION", path: applicationPath });

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
        `<img class="profile-frame${index === 0 ? " is-active" : ""}" src="${frameDataUrl(frame.path)}" alt="" />`,
    )
    .join("");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <style>
      * { box-sizing: border-box; }
      html, body { width: 960px; height: 660px; margin: 0; overflow: hidden; }
      body { background: #f8f7f0; cursor: none; }
      .profile-frame {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        object-fit: cover;
        opacity: 0;
        transform: scale(1.012);
        transition: opacity 360ms ease, transform 1800ms ease-out;
      }
      .profile-frame.is-active { opacity: 1; transform: scale(1); }
      .tour-label {
        position: absolute;
        right: 18px;
        bottom: 18px;
        z-index: 2;
        padding: 9px 12px;
        border: 1px solid rgba(40, 93, 73, 0.2);
        border-radius: 6px;
        background: rgba(251, 249, 241, 0.94);
        color: #285d49;
        font: 700 10px/1 Arial, sans-serif;
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
  const frames = await capturePublishedCoachFlow(browser);
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: 1,
    colorScheme: "light",
    recordVideo: { dir: temporaryDirectory, size: viewport },
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
    await page.evaluate(
      ({ activeIndex, label }) => {
        document
          .querySelectorAll(".profile-frame")
          .forEach((frame, frameIndex) => {
            frame.classList.toggle("is-active", frameIndex === activeIndex);
          });
        document.querySelector(".tour-label").textContent = label;
      },
      { activeIndex: index, label: frames[index].label },
    );
    await page.waitForTimeout(index === frames.length - 1 ? 1_950 : 1_650);
  }

  await context.close();
  await video.saveAs(outputVideo);
} finally {
  await browser.close();
  await rm(temporaryDirectory, { recursive: true, force: true });
}

console.log(`Created ${outputVideo}`);
console.log(`Created ${outputPoster}`);

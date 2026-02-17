import { expect, type Page } from "@playwright/test";

function isLoginPath(url: string) {
  try {
    const pathname = new URL(url).pathname;
    return pathname === "/login" || pathname === "/login/";
  } catch {
    return url.includes("/login");
  }
}

function normalizePathAndSearch(url: string) {
  try {
    const parsed = new URL(url);
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return url;
  }
}

function isOnTarget(url: string, targetPath: string) {
  const current = normalizePathAndSearch(url);
  return current === targetPath || current.startsWith(`${targetPath}&`);
}

async function isLoginUiVisible(page: Page) {
  return page
    .getByRole("heading", { name: /welcome back/i })
    .isVisible()
    .catch(() => false);
}

async function isRouteStable(page: Page, targetPath: string) {
  for (let i = 0; i < 3; i += 1) {
    const url = page.url();
    if (isLoginPath(url) || !isOnTarget(url, targetPath)) {
      return false;
    }
    await page.waitForTimeout(150);
  }
  return true;
}

export async function signInWithEmail(
  page: Page,
  email: string,
  password: string,
) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await page.goto("/login", { waitUntil: "domcontentloaded" });
    if (!isLoginPath(page.url())) {
      return;
    }
    const emailInput = page.getByPlaceholder("you@coachos.com");
    const passwordInput = page.getByPlaceholder("Enter password");

    await emailInput.fill(email);
    await passwordInput.fill(password);
    await page.getByRole("button", { name: /^sign in$/i }).click();

    try {
      await page.waitForFunction(
        () =>
          window.location.pathname !== "/login" &&
          window.location.pathname !== "/login/",
        undefined,
        { timeout: 15_000 },
      );
      return;
    } catch {
      if (attempt === 0) {
        await page.waitForTimeout(1_500);
        continue;
      }
      throw new Error("Sign-in did not leave login page.");
    }
  }
}

export async function ensureAuthenticatedNavigation(
  page: Page,
  targetPath: string,
  email: string,
  password: string,
) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (isLoginPath(page.url()) || (await isLoginUiVisible(page))) {
      await signInWithEmail(page, email, password);
    }

    await page.goto(targetPath, { waitUntil: "domcontentloaded" });
    if (await isLoginUiVisible(page)) {
      await signInWithEmail(page, email, password);
      await page.goto(targetPath, { waitUntil: "domcontentloaded" });
    }

    if (isOnTarget(page.url(), targetPath)) {
      if (
        !(await isLoginUiVisible(page)) &&
        (await isRouteStable(page, targetPath))
      ) {
        return;
      }
    } else if (isLoginPath(page.url())) {
      await signInWithEmail(page, email, password);
      await page.goto(targetPath, { waitUntil: "domcontentloaded" });
      if (isOnTarget(page.url(), targetPath)) {
        return;
      }
    }

    await page.waitForTimeout(1_000);
  }

  throw new Error(
    `Unable to reach route: ${targetPath} (current: ${page.url()})`,
  );
}

export async function waitForAppReady(page: Page, timeoutMs = 45_000) {
  const budgetMs = Math.min(timeoutMs, 5_000);
  const startedAt = Date.now();
  const loadingText = page.getByText(/^Loading\.\.\.$/).first();
  const loginHeading = page.getByRole("heading", { name: /welcome back/i });

  while (Date.now() - startedAt < budgetMs) {
    if (await loginHeading.isVisible().catch(() => false)) {
      return;
    }
    if (!(await loadingText.isVisible().catch(() => false))) {
      return;
    }
    await page.waitForTimeout(250);
  }
  // Non-fatal: some screens keep a persistent "Loading..." widget.
}

export function requireEnvVars(names: string[]) {
  const missing = names.filter(
    (name) => !process.env[name] || !process.env[name]?.trim(),
  );
  return {
    ok: missing.length === 0,
    missing,
  };
}

export function tinyPngFile(name = "smoke.png") {
  const base64 =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO2n6+QAAAAASUVORK5CYII=";
  return {
    name,
    mimeType: "image/png",
    buffer: Buffer.from(base64, "base64"),
  };
}

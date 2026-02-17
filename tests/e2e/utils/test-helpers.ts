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
  const startedAt = Date.now();
  while (Date.now() - startedAt < 2_000) {
    const url = page.url();
    if (isLoginPath(url) || !isOnTarget(url, targetPath)) {
      return false;
    }
    if (await isLoginUiVisible(page)) {
      return false;
    }
    await page.waitForTimeout(200);
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
    const emailByLabel = page.getByLabel(/email/i);
    const emailByPlaceholder = page.getByPlaceholder("you@coachos.com");
    const passwordByLabel = page.getByLabel(/password/i);
    const passwordByPlaceholder = page.getByPlaceholder("Enter password");
    const emailByInput = page
      .locator(
        'input[type="email"], input[name="email"], input[autocomplete="email"]',
      )
      .first();
    const passwordByInput = page
      .locator(
        'input[type="password"], input[name="password"], input[autocomplete="current-password"]',
      )
      .first();

    let loginFormReady = false;
    const formWaitStart = Date.now();
    while (Date.now() - formWaitStart < 10_000) {
      if (!isLoginPath(page.url())) return;
      const emailVisible =
        (await emailByLabel.isVisible().catch(() => false)) ||
        (await emailByPlaceholder.isVisible().catch(() => false)) ||
        (await emailByInput.isVisible().catch(() => false));
      const passwordVisible =
        (await passwordByLabel.isVisible().catch(() => false)) ||
        (await passwordByPlaceholder.isVisible().catch(() => false)) ||
        (await passwordByInput.isVisible().catch(() => false));
      if (emailVisible && passwordVisible) {
        loginFormReady = true;
        break;
      }
      const bootstrapLoading = await page
        .getByText(/^Loading\.\.\.$/)
        .first()
        .isVisible()
        .catch(() => false);
      if (bootstrapLoading) {
        if (Date.now() - formWaitStart > 4_000) {
          return;
        }
        await page.waitForTimeout(300);
        continue;
      }
      await page.waitForTimeout(200);
    }

    if (!loginFormReady) {
      const stillBootstrappingOnLogin = await page
        .getByText(/^Loading\.\.\.$/)
        .first()
        .isVisible()
        .catch(() => false);
      if (stillBootstrappingOnLogin) {
        // Let caller retry navigation instead of timing out inside form fill.
        return;
      }
      if (!isLoginPath(page.url())) return;
      if (attempt === 0) {
        await page.waitForTimeout(1_000);
        continue;
      }
      throw new Error(
        `Login form did not become ready on /login (url: ${page.url()}).`,
      );
    }

    if (await emailByLabel.isVisible().catch(() => false)) {
      await emailByLabel.fill(email);
    } else if (await emailByPlaceholder.isVisible().catch(() => false)) {
      await emailByPlaceholder.fill(email);
    } else if (await emailByInput.isVisible().catch(() => false)) {
      await emailByInput.fill(email);
    } else {
      throw new Error("Email input not visible on /login.");
    }

    if (await passwordByLabel.isVisible().catch(() => false)) {
      await passwordByLabel.fill(password);
    } else if (await passwordByPlaceholder.isVisible().catch(() => false)) {
      await passwordByPlaceholder.fill(password);
    } else if (await passwordByInput.isVisible().catch(() => false)) {
      await passwordByInput.fill(password);
    } else {
      throw new Error("Password input not visible on /login.");
    }

    await page.getByRole("button", { name: /^sign in$/i }).click();

    try {
      await page.waitForFunction(
        () =>
          window.location.pathname !== "/login" &&
          window.location.pathname !== "/login/",
        undefined,
        { timeout: 15_000 },
      );
      await page.waitForTimeout(400);
      if (isLoginPath(page.url()) || (await isLoginUiVisible(page))) {
        if (attempt === 0) {
          await page.waitForTimeout(1_500);
          continue;
        }
        throw new Error("Sign-in appeared to succeed but returned to login.");
      }
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
  const startedAt = Date.now();
  const budgetMs = 45_000;

  while (Date.now() - startedAt < budgetMs) {
    if (isLoginPath(page.url()) || (await isLoginUiVisible(page))) {
      await signInWithEmail(page, email, password);
    }

    if (!isOnTarget(page.url(), targetPath)) {
      await page.goto(targetPath, { waitUntil: "domcontentloaded" });
    }
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
    `Unable to reach route within ${Math.round(budgetMs / 1000)}s: ${targetPath} (current: ${page.url()})`,
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

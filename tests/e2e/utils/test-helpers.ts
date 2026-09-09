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
  const headingVisible = await page
    .getByRole("heading", { name: /welcome back/i })
    .isVisible()
    .catch(() => false);
  if (headingVisible) {
    return true;
  }

  const signInVisible = await page
    .getByRole("button", { name: /^sign in$/i })
    .first()
    .isVisible()
    .catch(() => false);
  const emailVisible = await page
    .locator(
      'input[type="email"], input[name="email"], input[autocomplete="email"]',
    )
    .first()
    .isVisible()
    .catch(() => false);

  return signInVisible && emailVisible;
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

export async function clickVisibleEnabledSignInButton(page: Page) {
  await page
    .locator("form")
    .getByRole("button", { name: /^sign in$/i })
    .filter({ hasText: "Sign in" })
    .click();
}

export async function waitForAuthSessionReady(page: Page, timeoutMs = 15_000) {
  await page.getByTestId("auth-session-ready").waitFor({
    state: "attached",
    timeout: timeoutMs,
  });
}

export async function waitForBootstrapResolved(page: Page, timeoutMs = 20_000) {
  await page.getByTestId("bootstrap-resolved").waitFor({
    state: "attached",
    timeout: timeoutMs,
  });
}

export async function waitForPageReady(
  page: Page,
  params: {
    testId: string;
    urlPattern?: RegExp;
    timeoutMs?: number;
  },
) {
  if (params.urlPattern) {
    await expect(page).toHaveURL(params.urlPattern, {
      timeout: params.timeoutMs ?? 20_000,
    });
  }
  await page.getByTestId(params.testId).waitFor({
    state: "attached",
    timeout: params.timeoutMs ?? 20_000,
  });
}

export async function signInWithEmail(
  page: Page,
  email: string,
  password: string,
) {
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  // Locator actions await the real form, including lazy loading and animation.
  // Reloading on a short polling deadline can cancel an in-flight sign-in.
  const emailInput = page.getByLabel("Email", { exact: true });
  const sessionReady = page.getByTestId("auth-session-ready");
  await emailInput.or(sessionReady).first().waitFor({ state: "attached" });
  if ((await sessionReady.count()) === 0) {
    await emailInput.fill(email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await clickVisibleEnabledSignInButton(page);
  }
  await waitForAuthSessionReady(page);
  await waitForBootstrapResolved(page);
  await expect(page).not.toHaveURL(/\/login\/?(?:\?.*)?$/);
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

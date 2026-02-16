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

export async function signInWithEmail(
  page: Page,
  email: string,
  password: string,
) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await page.goto("/login");
    await expect(
      page.getByRole("heading", { name: /welcome back/i }),
    ).toBeVisible();

    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: /^sign in$/i }).click();

    try {
      await page.waitForFunction(
        () =>
          window.location.pathname !== "/login" &&
          window.location.pathname !== "/login/",
        undefined,
        { timeout: 20_000 },
      );
      return;
    } catch {
      if (attempt === 0) {
        // Supabase may throttle repeated sign-ins in quick succession.
        await page.waitForTimeout(65_000);
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
  for (let attempt = 0; attempt < 4; attempt += 1) {
    await page.goto(targetPath);
    if (isOnTarget(page.url(), targetPath)) return;

    if (isLoginPath(page.url())) {
      await signInWithEmail(page, email, password);
      await page.goto(targetPath);
      if (isOnTarget(page.url(), targetPath)) return;
    }

    if (attempt < 3) {
      await page.waitForTimeout(8_000);
    }
  }

  throw new Error(
    `Unable to reach route: ${targetPath} (current: ${page.url()})`,
  );
}

export async function waitForAppReady(page: Page, timeoutMs = 45_000) {
  await expect(page.getByText(/^Loading\.\.\.$/).first()).not.toBeVisible({
    timeout: timeoutMs,
  });
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

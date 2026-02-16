import { expect, type Page } from "@playwright/test";

function isLoginPath(url: string) {
  try {
    const pathname = new URL(url).pathname;
    return pathname === "/login" || pathname === "/login/";
  } catch {
    return url.includes("/login");
  }
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
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await page.goto(targetPath);
    if (!isLoginPath(page.url())) return;

    await signInWithEmail(page, email, password);
    await page.goto(targetPath);
    if (!isLoginPath(page.url())) return;

    if (attempt < 2) {
      await page.waitForTimeout(20_000);
    }
  }

  throw new Error(
    `Unable to access protected route after auth retry: ${targetPath} (current: ${page.url()})`,
  );
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

import { expect, type Page } from "@playwright/test";

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
      await expect(page).not.toHaveURL(/\/login(?:\?|$)/, { timeout: 20_000 });
      return;
    } catch (error) {
      if (attempt === 0) {
        // Supabase may throttle repeated sign-ins in quick succession.
        await page.waitForTimeout(65_000);
        continue;
      }
      throw error;
    }
  }
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

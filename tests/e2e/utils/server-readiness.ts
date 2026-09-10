import { chromium, expect, type FullConfig } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { createAuthSmokeFixtures } from "./auth-fixtures";
import { seedAuthSmokeStates } from "./auth-seeds";

// Vite's HTTP listener is ready before lazy route modules are transformed.
// Compile initial destinations once, before four browsers compete with auth
// and database work. This context never signs in or writes shared storage.
export default async function prepareOwnedServer(config: FullConfig) {
  // Provision credentials before browser work, so password hashing cannot
  // starve concurrent sign-ins. Workers still reseed their own mutable state.
  const runId = randomUUID();
  process.env.REPSYNC_E2E_RUN_ID = runId;
  for (let slot = 0; slot < config.workers; slot += 1) {
    const seeded = await seedAuthSmokeStates(
      createAuthSmokeFixtures(`${runId}:${slot}`),
    );
    if (!seeded) throw new Error("Local Supabase is required for smoke setup.");
  }

  const project = config.projects[0];
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ baseURL: project.use.baseURL });
    page.setDefaultTimeout(project.timeout);
    await page.goto("/login", { waitUntil: "domcontentloaded" });
    await expect(page.getByLabel("Email", { exact: true })).toBeVisible({
      timeout: project.timeout,
    });
    await page.evaluate(
      async (modules) => {
        for (const modulePath of modules) {
          await import(modulePath);
        }
      },
      [
        "/src/components/layouts/pt-hub-layout.tsx",
        "/src/pages/pt-hub/overview.tsx",
        "/src/components/layouts/client-layout.tsx",
        "/src/pages/client/home.tsx",
        "/src/pages/public/product.tsx",
      ],
    );
  } finally {
    await browser.close();
  }
}

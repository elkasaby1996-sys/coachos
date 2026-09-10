import { defineConfig } from "@playwright/test";
import baseConfig from "./playwright.config";

// These integration scenarios use the explicitly configured accounts/data.
// The default suite separately exercises all locally seeded auth scenarios.
export default defineConfig(baseConfig, {
  globalSetup: undefined,
  testMatch: [
    "**/checkin-submit-review.smoke.spec.ts",
    "**/notifications.spec.ts",
    "**/nutrition-program-view.spec.ts",
    "**/pt-assign-workout.smoke.spec.ts",
    "**/pt-workspace-header.spec.ts",
    "**/workout-template-duplicate.spec.ts",
    "**/workout-template-view.spec.ts",
  ],
  outputDir: "test-results-configured",
  reporter: [
    ["list"],
    ["html", { open: "never", outputFolder: "playwright-report-configured" }],
  ],
});

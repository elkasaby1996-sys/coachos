import { defineConfig, devices } from "@playwright/test";

const configuredBaseUrl = process.env.E2E_BASE_URL?.trim();
const defaultBaseUrl = "http://127.0.0.1:4173";

function isLoopbackBaseUrl(url: string) {
  try {
    const { hostname } = new URL(url);
    return ["127.0.0.1", "localhost", "0.0.0.0"].includes(hostname);
  } catch {
    return false;
  }
}

const useExternalBaseUrl =
  process.env.npm_lifecycle_event !== "test:e2e:smoke" &&
  Boolean(configuredBaseUrl) &&
  (!process.env.CI || !isLoopbackBaseUrl(configuredBaseUrl));
const baseURL = useExternalBaseUrl ? configuredBaseUrl : defaultBaseUrl;
const useWebServer = !useExternalBaseUrl;
const configuredWorkers = process.env.REPSYNC_E2E_WORKERS?.trim();
if (configuredWorkers && !/^[1-9]\d*$/.test(configuredWorkers)) {
  throw new Error("REPSYNC_E2E_WORKERS must be a positive integer.");
}

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 90_000,
  fullyParallel: false,
  retries: 0,
  workers: configuredWorkers ? Number(configuredWorkers) : 4,
  globalSetup: useWebServer
    ? "./tests/e2e/utils/server-readiness.ts"
    : undefined,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  webServer: useWebServer
    ? {
        command: "npm run dev -- --host 127.0.0.1 --port 4173 --strictPort",
        url: baseURL,
        reuseExistingServer: false,
        timeout: 120_000,
      }
    : undefined,
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});

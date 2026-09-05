import type { Page } from "@playwright/test";

export async function openAnatomyFixture(page: Page, mode = "library") {
  await page.route("**/__anatomy-fixture?*", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1" /></head><body><div id="root"></div><script type="module">
      import RefreshRuntime from '/@react-refresh';
      RefreshRuntime.injectIntoGlobalHook(window);
      window.$RefreshReg$ = () => {};
      window.$RefreshSig$ = () => (type) => type;
      window.__vite_plugin_react_preamble_installed__ = true;
      await import('/tests/e2e/fixtures/anatomy-selector.tsx');
    </script></body></html>`,
    }),
  );
  await page.goto(`/__anatomy-fixture?mode=${mode}`);
  await page
    .getByRole("heading", { name: "Exercise library · isolated QA data" })
    .waitFor();
}

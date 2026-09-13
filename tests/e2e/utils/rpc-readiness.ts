import {
  expect,
  type Page,
  type Request as BrowserRequest,
} from "@playwright/test";

// Observe fresh RPC traffic, including reads dispatched by virtual-clock ticks.
// A previously reached document load/networkidle state cannot establish this.
export function trackRpcReads(page: Page) {
  const pendingReads = new Set<BrowserRequest>();
  let lastReadActivity = Date.now();
  page.on("request", (request) => {
    if (!request.url().includes("/rest/v1/rpc/")) return;
    pendingReads.add(request);
    lastReadActivity = Date.now();
  });
  const finishRead = (request: BrowserRequest) => {
    if (pendingReads.delete(request)) lastReadActivity = Date.now();
  };
  page.on("requestfinished", finishRead);
  page.on("requestfailed", finishRead);
  return async () => {
    // Await transport within the existing test budget, then assert quiescence.
    // Include reads dispatched while an earlier batch is completing.
    while (pendingReads.size > 0) {
      await Promise.all(
        [...pendingReads].map(async (request) => {
          const response = await request.response();
          if (response) await response.finished();
          finishRead(request);
        }),
      );
    }
    await expect
      .poll(
        () => pendingReads.size === 0 && Date.now() - lastReadActivity >= 500,
      )
      .toBe(true);
  };
}

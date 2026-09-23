import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const routePolicy = readFileSync(
  resolve(process.cwd(), "src/lib/protected-route-guard.ts"),
  "utf8",
);
const appRoutes = readFileSync(
  resolve(process.cwd(), "src", "routes", "app.tsx"),
  "utf8",
);

describe("client messages route wiring", () => {
  it("registers /app/messages as a first-class route", () => {
    expect(appRoutes).toContain(
      'path="messages" element={<ClientMessagesPage />}',
    );
  });

  it("allows pre-workspace clients to access /app/messages", () => {
    expect(routePolicy).toContain(
      'params.pathname.startsWith("/app/messages")',
    );
  });
});

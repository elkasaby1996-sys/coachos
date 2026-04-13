import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const appRoutes = readFileSync(
  resolve(process.cwd(), "src", "routes", "app.tsx"),
  "utf8",
);

describe("client messages route wiring", () => {
  it("registers /app/messages as a first-class route", () => {
    expect(appRoutes).toContain('path="messages" element={<ClientMessagesPage />}');
  });

  it("allows pre-workspace clients to access /app/messages", () => {
    expect(appRoutes).toContain('params.pathname.startsWith("/app/messages")');
  });
});

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const appRoutes = readFileSync(
  resolve(process.cwd(), "src", "routes", "app.tsx"),
  "utf8",
);

describe("client settings route wiring", () => {
  it("registers /app/settings as a first-class route", () => {
    expect(appRoutes).toContain('path="settings" element={<ClientSettingsPage />}');
  });

  it("keeps /app/profile as a compatibility redirect to settings profile tab", () => {
    expect(appRoutes).toContain('path="profile"');
    expect(appRoutes).toContain('"/app/settings?tab=profile"');
  });

  it("allows pre-workspace clients to access /app/settings", () => {
    expect(appRoutes).toContain('params.pathname.startsWith("/app/settings")');
  });
});

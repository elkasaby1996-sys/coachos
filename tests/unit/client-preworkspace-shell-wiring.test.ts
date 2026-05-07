import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const clientLayout = readFileSync(
  resolve(
    process.cwd(),
    "src",
    "components",
    "layouts",
    "client-layout.tsx",
  ),
  "utf8",
);

const appRoutes = readFileSync(
  resolve(process.cwd(), "src", "routes", "app.tsx"),
  "utf8",
);

describe("client pre-workspace shell wiring", () => {
  it("keeps the full client navigation available in pre-workspace mode", () => {
    expect(clientLayout).toContain('"/app/home"');
    expect(clientLayout).toContain('"/app/workouts"');
    expect(clientLayout).toContain('"/app/nutrition"');
    expect(clientLayout).toContain('"/app/habits"');
    expect(clientLayout).toContain('"/app/checkins"');
    expect(clientLayout).toContain('"/app/messages"');
    expect(clientLayout).toContain('"/app/find-coach"');
    expect(clientLayout).toContain('"/app/settings"');
    expect(clientLayout).not.toContain("preWorkspaceNavPaths");
  });

  it("does not force pre-workspace clients back to /app/home inside the shell", () => {
    expect(clientLayout).not.toContain(
      'preWorkspaceMode && location.pathname !== "/app/home"',
    );
    expect(clientLayout).not.toContain(
      'navigate("/app/home", { replace: true })',
    );
  });

  it("allows the full /app client surface through the pre-workspace guard", () => {
    expect(appRoutes).not.toContain("isPreWorkspaceClientAllowedPath");
    expect(appRoutes).toContain('params.pathname.startsWith("/app/")');
  });
});

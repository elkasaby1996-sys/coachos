import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const appRoutes = readFileSync(
  resolve(process.cwd(), "src", "routes", "app.tsx"),
  "utf8",
);

describe("client workout route redirect", () => {
  it("redirects legacy workout detail deep links to the workout runner", () => {
    expect(appRoutes).toContain("function ClientWorkoutDetailRedirect()");
    expect(appRoutes).toContain(
      '`/app/workout-run/${assignedWorkoutId ?? ""}`',
    );
    expect(appRoutes).toMatch(
      /path="workouts\/:assignedWorkoutId"\s+element={<ClientWorkoutDetailRedirect \/>}/,
    );
    expect(appRoutes).not.toMatch(
      /path="workouts\/:assignedWorkoutId"\s+element={<ClientWorkoutDetailPage \/>}/,
    );
  });
});

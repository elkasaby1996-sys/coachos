import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const readRepo = (...parts: string[]) =>
  readFileSync(resolve(process.cwd(), ...parts), "utf8");

const hookSource = readRepo("src", "lib", "client-assignment-realtime.ts");
const homePage = readRepo("src", "pages", "client", "home.tsx");
const workoutsPage = readRepo("src", "pages", "client", "workouts.tsx");
const nutritionPage = readRepo("src", "pages", "client", "nutrition.tsx");
const checkinPage = readRepo("src", "pages", "client", "checkin.tsx");
const migration = readRepo(
  "supabase",
  "migrations",
  "20260703113000_client_assignment_realtime_refresh.sql",
);

describe("client assignment realtime refresh contract", () => {
  it("publishes assignment tables needed for realtime refresh without duplicate publication errors", () => {
    expect(migration).toContain("alter publication supabase_realtime");
    expect(migration).toContain("public.assigned_workouts");
    expect(migration).toContain("public.assigned_nutrition_plans");
    expect(migration).toContain("public.assigned_nutrition_days");
    expect(migration).toContain("public.checkins");
    expect(migration).toContain("public.clients");
    expect(migration).toContain("pg_publication_tables");
  });

  it("scopes realtime subscriptions to the active client id", () => {
    expect(hookSource).toContain("filter: `client_id=eq.${clientId}`");
    expect(hookSource).toContain("filter: `id=eq.${clientId}`");
    expect(hookSource).not.toContain("event: \"*\", schema: \"public\"");
  });

  it("invalidates client workout, home, nutrition, and check-in query families", () => {
    [
      "assigned-workout-today",
      "assigned-workouts-week",
      "assigned-workouts-week-plan",
      "client-workouts-unified",
      "assigned-workout",
      "assigned-workout-exercises",
      "client-nutrition-plans",
      "client-nutrition-days",
      "client-nutrition-meals",
      "assigned-nutrition-today",
      "assigned-nutrition-week",
      "client-checkin",
      "client-checkin-profile",
    ].forEach((queryKey) => {
      expect(hookSource).toContain(queryKey);
    });
  });

  it("wires realtime refresh into critical client assignment surfaces", () => {
    [homePage, workoutsPage, nutritionPage, checkinPage].forEach((source) => {
      expect(source).toContain("useClientAssignmentRealtime");
    });
  });
});

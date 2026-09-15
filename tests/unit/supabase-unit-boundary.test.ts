import { afterEach, expect, it, vi } from "vitest";

const { createClient, fetchMock } = vi.hoisted(() => {
  vi.stubEnv("VITE_SUPABASE_URL", undefined);
  vi.stubEnv("VITE_SUPABASE_ANON_KEY", undefined);
  const fetchMock = vi.fn(() => {
    throw new Error("Unexpected network call in unit collection");
  });
  vi.stubGlobal("fetch", fetchMock);
  return { createClient: vi.fn(), fetchMock };
});
vi.mock("@supabase/supabase-js", () => ({ createClient }));

import { supabase } from "../../src/lib/supabase";
import { normalizeExerciseDatasetRecord } from "../../src/lib/exercise-dataset";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

it("collects application imports without either browser env value or a real client", () => {
  expect(import.meta.env.VITE_SUPABASE_URL).toBeUndefined();
  expect(import.meta.env.VITE_SUPABASE_ANON_KEY).toBeUndefined();
  expect(
    normalizeExerciseDatasetRecord({ id: "1", name: "Squat" }),
  ).toMatchObject({ id: "1" });
  expect(() => supabase.from("unexpected")).toThrow("Unit Supabase boundary");
  expect(createClient).not.toHaveBeenCalled();
  expect(fetchMock).not.toHaveBeenCalled();
});

it("allows method spies and clearAllMocks without losing the boundary", () => {
  const replacement = {} as ReturnType<typeof supabase.from>;
  const spy = vi.spyOn(supabase, "from").mockReturnValue(replacement);
  expect(supabase.from("example")).toBe(replacement);
  vi.clearAllMocks();
  expect(spy).not.toHaveBeenCalled();
  expect(supabase.from("example")).toBe(replacement);
  spy.mockRestore();
  expect(() => supabase.from("example")).toThrow("Unit Supabase boundary");
});

it("allows doMock after resetModules and restores the shared boundary", async () => {
  const replacement = { from: vi.fn() };
  try {
    vi.resetModules();
    vi.doMock("../../src/lib/supabase", () => ({ supabase: replacement }));
    expect((await import("../../src/lib/supabase")).supabase).toBe(replacement);
  } finally {
    vi.doUnmock("../../src/lib/supabase");
    vi.resetModules();
    await import("./setup");
  }
  const restored = await import("../../src/lib/supabase");
  expect(() => restored.supabase.from("example")).toThrow(
    "Unit Supabase boundary",
  );
});

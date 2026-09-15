import { afterEach, beforeEach, expect, it, vi } from "vitest";

// Exercise the real initializer, but intercept SDK construction to prevent I/O.
vi.unmock("../../src/lib/supabase");
const { client, createClient } = vi.hoisted(() => {
  const client = { testClient: true };
  return { client, createClient: vi.fn(() => client) };
});
vi.mock("@supabase/supabase-js", () => ({ createClient }));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.stubEnv("VITE_SUPABASE_URL", undefined);
  vi.stubEnv("VITE_SUPABASE_ANON_KEY", undefined);
});
afterEach(() => vi.unstubAllEnvs());

it.each(["both", "url", "key"])(
  "fails closed when %s configuration is missing",
  async (missing) => {
    if (missing === "url")
      vi.stubEnv("VITE_SUPABASE_ANON_KEY", "synthetic-unit-anon-key");
    if (missing === "key")
      vi.stubEnv("VITE_SUPABASE_URL", "https://unit.invalid");
    await expect(import("../../src/lib/supabase")).rejects.toThrow(
      "Missing Supabase environment variables",
    );
    expect(createClient).not.toHaveBeenCalled();
  },
);

it("passes synthetic browser configuration to the SDK", async () => {
  vi.stubEnv("VITE_SUPABASE_URL", "https://unit.invalid");
  vi.stubEnv("VITE_SUPABASE_ANON_KEY", "synthetic-unit-anon-key");
  const module = await import("../../src/lib/supabase");
  expect(module.supabaseConfigured).toBe(true);
  expect(module.supabase).toBe(client);
  expect(createClient).toHaveBeenCalledExactlyOnceWith(
    "https://unit.invalid",
    "synthetic-unit-anon-key",
  );
});

it("continues rejecting service-role configuration", async () => {
  vi.stubEnv("VITE_SUPABASE_URL", "https://unit.invalid");
  vi.stubEnv(
    "VITE_SUPABASE_ANON_KEY",
    `test.${btoa(JSON.stringify({ role: "service_role" }))}.test`,
  );
  await expect(import("../../src/lib/supabase")).rejects.toThrow(
    "Supabase service role key detected",
  );
  expect(createClient).not.toHaveBeenCalled();
});

import { vi } from "vitest";

// Unit tests must provide their own behavior instead of constructing a real client.
// File-local vi.mock factories can replace this boundary for service tests.
vi.mock("../../src/lib/supabase", () => ({
  supabaseConfigured: true,
  supabase: {
    from: () => {
      throw new Error(
        "Unit Supabase boundary: mock supabase.from explicitly before using it.",
      );
    },
  },
}));

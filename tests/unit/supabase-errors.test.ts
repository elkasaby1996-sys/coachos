import { describe, expect, it } from "vitest";
import { getSupabaseErrorDetails } from "../../src/lib/supabase-errors";

describe("Supabase error details", () => {
  it("preserves diagnostic fields used to explain client transfer failures", () => {
    expect(
      getSupabaseErrorDetails({
        code: "P0001",
        message: "Transfer unavailable",
        details: "CLIENT_TRANSFER_PERMISSION_DENIED",
        hint: "Ask a workspace administrator",
      }),
    ).toEqual({
      code: "P0001",
      message: "Transfer unavailable",
      details: "CLIENT_TRANSFER_PERMISSION_DENIED",
      hint: "Ask a workspace administrator",
    });
  });

  it("supports ordinary errors and missing errors without diagnostic fields", () => {
    expect(getSupabaseErrorDetails(new Error("Connection failed"))).toEqual({
      code: null,
      message: "Connection failed",
      details: null,
      hint: null,
    });
    expect(getSupabaseErrorDetails(null)).toEqual({
      code: null,
      message: "Something went wrong.",
      details: null,
      hint: null,
    });
  });

  it("keeps the schema mismatch explanation while retaining diagnostics", () => {
    expect(
      getSupabaseErrorDetails({
        code: "42703",
        message: "Missing column",
        details: "Column lookup failed",
      }),
    ).toMatchObject({
      message:
        "Database schema mismatch. Please refresh and re-run migrations.",
      details: "Column lookup failed",
    });
  });
});

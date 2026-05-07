import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const config = readFileSync("supabase/config.toml", "utf8");

describe("local Supabase auth config", () => {
  it("requires signup email confirmation so local signups emit verification emails", () => {
    expect(config).toContain("[auth.email]");
    expect(config).toContain("enable_confirmations = true");
  });
});

import { describe, expect, it } from "vitest";
import {
  CHARACTER_LIMITS,
  getCharacterLimit,
  getCharacterLimitState,
  hasCharacterLimitError,
} from "../../src/lib/character-limits";

describe("character limits policy", () => {
  it("returns the expected caps for each semantic field type", () => {
    expect(getCharacterLimit("full_name")).toBe(255);
    expect(getCharacterLimit("short_name")).toBe(50);
    expect(getCharacterLimit("entity_name")).toBe(100);
    expect(getCharacterLimit("bio")).toBe(300);
    expect(getCharacterLimit("email")).toBe(254);
    expect(getCharacterLimit("default_text")).toBe(255);
    expect(CHARACTER_LIMITS.default_text).toBe(255);
  });
});

describe("character limit state", () => {
  it("handles max-1, max, and max+1 boundaries", () => {
    const limit = 10;
    const atMinusOne = getCharacterLimitState({
      value: "a".repeat(limit - 1),
      limit,
      fieldLabel: "Field",
    });
    const atLimit = getCharacterLimitState({
      value: "a".repeat(limit),
      limit,
      fieldLabel: "Field",
    });
    const overLimit = getCharacterLimitState({
      value: "a".repeat(limit + 1),
      limit,
      fieldLabel: "Field",
    });

    expect(atMinusOne.overLimit).toBe(false);
    expect(atMinusOne.remaining).toBe(1);
    expect(atLimit.overLimit).toBe(false);
    expect(atLimit.remaining).toBe(0);
    expect(overLimit.overLimit).toBe(true);
    expect(overLimit.remaining).toBe(-1);
    expect(overLimit.errorText).toContain(`${limit}`);
  });
});

describe("submit guard helper", () => {
  it("only reports an error when at least one field is over limit", () => {
    const valid = getCharacterLimitState({ value: "ok", limit: 5 });
    const over = getCharacterLimitState({ value: "toolong", limit: 5 });

    expect(hasCharacterLimitError([valid])).toBe(false);
    expect(hasCharacterLimitError([valid, over])).toBe(true);
    expect(hasCharacterLimitError([null, undefined, valid])).toBe(false);
  });
});


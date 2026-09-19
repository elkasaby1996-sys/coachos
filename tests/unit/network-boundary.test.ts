import { Socket } from "node:net";
import { expect, it } from "vitest";

it("forbids ambient fetch and socket network in normal unit tests", async () => {
  expect(() => fetch("https://example.invalid")).toThrow(
    "Unit network boundary",
  );
  expect(() => new Socket().connect(443, "example.invalid")).toThrow(
    "Unit network boundary",
  );
});

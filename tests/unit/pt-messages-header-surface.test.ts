import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const messagesSource = readFileSync(
  resolve(process.cwd(), "src/pages/pt/messages.tsx"),
  "utf8",
);

describe("PT messages header surface", () => {
  it("does not show a lifecycle pill in the active conversation header", () => {
    expect(messagesSource).not.toContain("LifecycleBadge");
    expect(messagesSource).toContain("Open profile");
  });
});

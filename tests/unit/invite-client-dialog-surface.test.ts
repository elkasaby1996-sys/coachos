import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  resolve(process.cwd(), "src", "components", "pt", "invite-client-dialog.tsx"),
  "utf8",
);

describe("InviteClientDialog surface", () => {
  it("uses the neutral app modal surface without the secure badge", () => {
    expect(source).toContain('bg-[var(--bg-surface-elevated)]');
    expect(source).toContain("bg-background/70");
    expect(source).not.toContain("Sparkles");
    expect(source).not.toContain("Badge");
    expect(source).not.toContain(">Secure<");
    expect(source).not.toContain("bg-secondary/35");
  });
});

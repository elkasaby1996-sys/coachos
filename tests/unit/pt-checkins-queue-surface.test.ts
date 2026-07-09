import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const checkinsSource = readFileSync(
  resolve(process.cwd(), "src/pages/pt/checkins.tsx"),
  "utf8",
);

describe("PT check-ins queue surface", () => {
  it("keeps queue cards free of duplicate status tags and direct-action blocks", () => {
    expect(checkinsSource).not.toContain("<StatusPill");
    expect(checkinsSource).not.toContain("ops-chip");
    expect(checkinsSource).not.toContain("Direct Action");
    expect(checkinsSource).not.toContain("Keep in upcoming queue");
  });

  it("uses a compact arrow action for opening check-ins", () => {
    expect(checkinsSource).toContain("ArrowUpRight");
    expect(checkinsSource).toContain(
      "aria-label={`${actionLabel} ${name} check-in`}",
    );
    expect(checkinsSource).not.toContain(">{actionLabel}</Button>");
  });
});

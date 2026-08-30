import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const seedSource = readFileSync(
  resolve(process.cwd(), "scripts", "seed-local-pt-demo.mjs"),
  "utf8",
);

describe("local demo seed credential logging", () => {
  it("reports demo account identifiers without writing passwords to logs", () => {
    const logCalls =
      seedSource.match(/console\.(?:log|info|warn|error)\([^;]+\);/g) ?? [];

    expect(logCalls.join("\n")).not.toMatch(/\.password\b/);
    expect(seedSource).toContain(
      'console.log("PT demo account:", demo.pt.email)',
    );
    expect(seedSource).toContain(
      'console.log("Client demo account:", zoe.email)',
    );
  });
});

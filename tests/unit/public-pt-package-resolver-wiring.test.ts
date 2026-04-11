import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function readSource(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("public PT package resolver wiring", () => {
  it("scopes public package lookup to the requested PT and applies canonical mapping", () => {
    const source = readSource("src/features/pt-hub/lib/pt-hub.ts");

    expect(source).toContain('queryKey: ["public-pt-package-options", coachUserId]');
    expect(source).toContain('.eq("pt_user_id", coachUserId)');
    expect(source).toContain("staleTime: 0");
    expect(source).toContain("return mapPublicPtPackageOptions(");
  });
});

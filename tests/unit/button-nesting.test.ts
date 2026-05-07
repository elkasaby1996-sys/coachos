import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const sourceRoot = join(process.cwd(), "src");

function collectTsxFiles(dir: string): string[] {
  const entries = readdirSync(dir);
  return entries.flatMap((entry) => {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      return collectTsxFiles(fullPath);
    }
    return fullPath.endsWith(".tsx") ? [fullPath] : [];
  });
}

describe("button markup", () => {
  it("does not contain double-nested button patterns", () => {
    const files = collectTsxFiles(sourceRoot);
    const nestedPatterns = [
      /<Button\b[^>]*>\s*<button\b/s,
      /<button\b[^>]*>\s*<Button\b/s,
      /<Button\b[^>]*>\s*<Button\b/s,
    ];

    const offenders: string[] = [];

    for (const filePath of files) {
      const content = readFileSync(filePath, "utf8");
      if (nestedPatterns.some((pattern) => pattern.test(content))) {
        offenders.push(filePath);
      }
    }

    expect(offenders).toEqual([]);
  });
});


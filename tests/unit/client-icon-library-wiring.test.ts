import { readFileSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { describe, expect, it } from "vitest";

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory()
      ? sourceFiles(path)
      : /\.tsx?$/.test(entry.name)
        ? [path]
        : [];
  });
}

describe("shared client and coach icon library", () => {
  it("uses the shared Phosphor catalog instead of mixing libraries", () => {
    const catalog = resolve(process.cwd(), "src/lib/icons.tsx");
    for (const path of sourceFiles(resolve(process.cwd(), "src"))) {
      const source = readFileSync(path, "utf8");
      expect(source, path).not.toMatch(
        /from\s+["'](?:lucide-react|@radix-ui\/react-icons|react-icons|@heroicons\/react|@tabler\/icons-react|phosphor-react|@fortawesome)(?:["'/])/,
      );
      if (path !== catalog) {
        expect(source, path).not.toMatch(/from\s+["']@phosphor-icons\/react/);
      }
    }
    expect(readFileSync(catalog, "utf8")).toContain(
      "@phosphor-icons/react/dist/csr/",
    );
  });
});

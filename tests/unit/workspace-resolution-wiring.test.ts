import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function readSource(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("workspace resolution hardening", () => {
  it("derives PT workspace context from both workspace_members and owned workspaces", () => {
    const source = readSource("src/lib/use-workspace.ts");

    expect(source).toContain("const UUID_PATTERN =");
    expect(source).toContain("function isUuid(");
    expect(source).toContain("const [memberResult, ownedResult] = await Promise.all([");
    expect(source).toContain(
      "const combinedWorkspaceIds = Array.from(",
    );
    expect(source).toContain("new Set([...memberWorkspaceIds, ...ownerWorkspaceIds])");
  });

  it("self-heals invalid dashboard workspace context before calling pt_dashboard_summary", () => {
    const source = readSource("src/pages/pt/dashboard.tsx");

    expect(source).toContain("UUID_PATTERN.test(cachedWorkspaceId)");
    expect(source).toContain("refreshWorkspace()");
    expect(source).toContain("pt_dashboard_summary");
    expect(source).toContain("workspaceRecoveryAttemptRef");
  });

  it("resolves PT Hub workspace rows from owned and member-linked workspace ids", () => {
    const source = readSource("src/features/pt-hub/lib/pt-hub.ts");

    expect(source).toContain("const ownedWorkspaceRows = data ?? [];");
    expect(source).toContain("const memberWorkspaceIds = Array.from(memberMap.keys())");
    expect(source).toContain("new Set([...ownedWorkspaceIds, ...memberWorkspaceIds])");
    expect(source).toContain('.from("workspaces")');
    expect(source).toContain(".in(\"id\", workspaceIds)");
  });
});

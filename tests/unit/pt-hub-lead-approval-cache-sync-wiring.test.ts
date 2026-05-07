import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function readSource(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("PT Hub lead approval cache sync wiring", () => {
  it("syncs workspace context and invalidates client-facing queries after approval", () => {
    const source = readSource("src/pages/pt-hub/lead-detail.tsx");

    expect(source).toContain(
      "const { switchWorkspace, refreshWorkspace } = useWorkspace();",
    );
    expect(source).toContain("const approvalResult = await approvePtHubLead({");
    expect(source).toContain("if (approvalResult?.workspace_id) {");
    expect(source).toContain("switchWorkspace(approvalResult.workspace_id);");
    expect(source).toContain("refreshWorkspace();");
    expect(source).toContain('queryKey: ["pt-hub-clients"]');
    expect(source).toContain('queryKey: ["pt-hub-clients-page"]');
    expect(source).toContain('queryKey: ["pt-hub-client-stats"]');
    expect(source).toContain('queryKey: ["pt-hub-workspaces", user?.id]');
  });
});

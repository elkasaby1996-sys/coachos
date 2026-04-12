import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function readSource(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("workspace header pill wiring", () => {
  it("uses route workspace context for PT settings header display and selection state", () => {
    const ptLayout = readSource("src/components/layouts/pt-layout.tsx");

    expect(ptLayout).toContain("workspaceSettingsRouteMatch");
    expect(ptLayout).toContain("const routeWorkspaceId =");
    expect(ptLayout).toContain("const headerWorkspaceId = routeWorkspaceId ?? workspaceId");
    expect(ptLayout).toContain("workspace.id === headerWorkspaceId");
    expect(ptLayout).toContain("switchWorkspace(routeWorkspaceId);");
  });

  it("uses fallback-and-heal wiring in PT Hub header pill when cached workspace is stale", () => {
    const ptHubLayout = readSource("src/components/layouts/pt-hub-layout.tsx");

    expect(ptHubLayout).toContain("const inPtHubWorkspace = location.pathname.startsWith(\"/pt-hub\")");
    expect(ptHubLayout).toContain(
      "const fallbackWorkspace =",
    );
    expect(ptHubLayout).toContain(
      "workspaces.find((workspace) => workspace.id === workspaceId) ??",
    );
    expect(ptHubLayout).toContain("workspace.id === workspaceId");
    expect(ptHubLayout).toContain("const firstWorkspace = workspaces[0];");
    expect(ptHubLayout).toContain("switchWorkspace(firstWorkspace.id);");
    expect(ptHubLayout).toContain("const workspacePillLabel =");
    expect(ptHubLayout).toContain("? \"Repsync PT Hub\"");
    expect(ptHubLayout).toContain("{!inPtHubWorkspace && workspace.id === workspaceId ? (");
  });
});

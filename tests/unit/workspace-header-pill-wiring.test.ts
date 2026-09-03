import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function readSource(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("workspace header pill wiring", () => {
  it("uses route workspace context for legacy PT settings selection state", () => {
    const ptLayout = readSource("src/components/layouts/pt-layout.tsx");

    expect(ptLayout).toContain("workspaceSettingsRouteMatch");
    expect(ptLayout).toContain("/^\\/workspace\\/([^/]+)\\/settings(?:\\/|$)/");
    expect(ptLayout).toContain("const routeWorkspaceId =");
    expect(ptLayout).toContain(
      "const headerWorkspaceId = routeWorkspaceId ?? workspaceId",
    );
    expect(ptLayout).toContain("workspace.id === headerWorkspaceId");
    expect(ptLayout).toContain("switchWorkspace(routeWorkspaceId);");
  });

  it("uses the unified full-height rail and compact utility dock across PT routes", () => {
    const ptLayout = readSource("src/components/layouts/pt-layout.tsx");
    const shellCss = readSource("src/styles/pt-workspace-shell.css");

    expect(ptLayout).toContain("pt-workspace-rail-desktop");
    expect(ptLayout).toContain("lg:inset-y-0");
    expect(ptLayout).not.toContain("lg:bottom-[72px]");
    expect(ptLayout).toContain("R E P S Y N C");
    expect(ptLayout).not.toContain("Repsync PT\n");
    expect(ptLayout).toContain("pt-workspace-header-action-cluster");
    expect(ptLayout).toContain("searchInlineInputRef");
    expect(ptLayout).toContain('type="search"');
    expect(ptLayout).toContain("onKeyDown={handleSearchKeyDown}");
    expect(ptLayout).toContain("searchPanelLayout.compact ? (");
    expect(ptLayout).toContain("Search clients, programs, tags...");
    expect(ptLayout).toContain(
      "xl:grid-cols-[minmax(0,1fr)_minmax(320px,480px)_minmax(0,1fr)]",
    );
    expect(ptLayout).not.toContain("<header");
    expect(shellCss).toContain(".pt-workspace-rail-desktop");
    expect(shellCss).toContain("border-width: 0 1px 0 0;");
    expect(shellCss).toContain("border-radius: 0;");
    expect(shellCss).toContain("box-shadow: none;");
  });

  it("uses fallback-and-heal wiring in PT Hub header pill when cached workspace is stale", () => {
    const ptHubLayout = readSource("src/components/layouts/pt-hub-layout.tsx");

    expect(ptHubLayout).toContain(
      'const inPtHubWorkspace = location.pathname.startsWith("/pt-hub")',
    );
    expect(ptHubLayout).toContain("const fallbackWorkspace =");
    expect(ptHubLayout).toContain(
      "workspaces.find((workspace) => workspace.id === workspaceId) ??",
    );
    expect(ptHubLayout).toContain("workspace.id === workspaceId");
    expect(ptHubLayout).toContain("const firstWorkspace = workspaces[0];");
    expect(ptHubLayout).toContain("switchWorkspace(firstWorkspace.id);");
    expect(ptHubLayout).toContain("const workspacePillLabel =");
    expect(ptHubLayout).toContain('? "Repsync PT Hub"');
    expect(ptHubLayout).toContain(
      "{!inPtHubWorkspace && workspace.id === workspaceId ? (",
    );
  });

  it("shows PT Hub profile publication status only on the Coach Profile route", () => {
    const ptHubLayout = readSource("src/components/layouts/pt-hub-layout.tsx");

    expect(ptHubLayout).toContain(
      'const showProfileStatusPill = location.pathname === "/pt-hub/profile"',
    );
    expect(ptHubLayout).toContain("{showProfileStatusPill ? (");
    expect(ptHubLayout).toContain(
      '{t("common.profileStatus", "Profile status")}',
    );
  });
});

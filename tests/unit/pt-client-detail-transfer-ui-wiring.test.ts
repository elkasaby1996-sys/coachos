import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function readSource(pathFromRoot: string) {
  return readFileSync(resolve(process.cwd(), pathFromRoot), "utf8");
}

describe("pt client detail safe transfer UI wiring", () => {
  const source = readSource("src/pages/pt/client-detail.tsx");

  it("renders transfer action only for owner/admin active relationships", () => {
    expect(source).toContain("canTransferClientRelationship");
    expect(source).toContain('workspaceAccessRole === "owner"');
    expect(source).toContain('workspaceAccessRole === "admin"');
    expect(source).toContain('clientSnapshot?.relationship_status ?? "active"');
    expect(source).toContain("Transfer workspace");
  });

  it("hides transfer behind read-only permission state", () => {
    expect(source).toContain("canTransferClientRelationship");
    expect(source).toContain("!canTransferClientRelationship");
  });

  it("excludes the current workspace from target choices", () => {
    expect(source).toContain("transferTargetWorkspaces");
    expect(source).toContain("workspace.id !== activeWorkspaceId");
  });

  it("states delivery assignments are not transferred", () => {
    expect(source).toContain(
      "Transfer keeps the client’s previous workspace history preserved and starts a new active relationship in the selected workspace. Workout, nutrition, check-in settings, and program assignments are not transferred because each workspace has its own delivery library. After transfer, assign a new plan from the target workspace.",
    );
  });

  it("calls the safe transfer RPC with current client and target workspace ids", () => {
    expect(source).toContain('supabase.rpc("pt_transfer_client_relationship"');
    expect(source).toContain("p_source_client_id: clientSnapshot.id");
    expect(source).toContain("p_target_workspace_id: transferTargetWorkspaceId");
  });

  it("invalidates client and workspace queries before redirecting after success", () => {
    expect(source).toContain('queryKey: ["pt-client"');
    expect(source).toContain('queryKey: ["pt-hub-workspaces"]');
    expect(source).toContain('queryKey: ["pt-hub-clients"]');
    expect(source).toContain("target_client_id");
    expect(source).toContain(
      "navigate(`/w/${targetWorkspaceSlug}/clients/${targetClientUrlKey}`)",
    );
  });
});

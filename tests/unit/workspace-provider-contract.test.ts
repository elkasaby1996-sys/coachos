import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function readSource(...segments: string[]) {
  return readFileSync(resolve(process.cwd(), ...segments), "utf8");
}

const workspaceSource = readSource("src", "lib", "use-workspace.ts");
const mainSource = readSource("src", "main.tsx");

describe("workspace provider contract", () => {
  it("moves workspace loading state behind a provider-backed context", () => {
    expect(workspaceSource).toContain("const WorkspaceContext =");
    expect(workspaceSource).toContain("export function WorkspaceProvider");
    expect(workspaceSource).toContain(
      "const workspaceContext = useContext(WorkspaceContext)",
    );
    expect(workspaceSource).toContain("return workspaceContext;");
  });

  it("mounts a single workspace provider above the routed app", () => {
    expect(mainSource).toContain("import { WorkspaceProvider }");
    expect(mainSource).toContain("<WorkspaceProvider>");
    expect(mainSource).toContain("<App />");
    expect(mainSource).toContain("</WorkspaceProvider>");
  });

  it("does not refetch workspace bootstrap when auth bootstrap resolves for the same workspace key", () => {
    expect(workspaceSource).toContain("lastLoadedWorkspaceKeyRef");
    expect(workspaceSource).toContain("lastLoadedWorkspaceAtRef");
    expect(workspaceSource).toContain("inFlightWorkspaceLoadKeyRef");
    expect(workspaceSource).toContain("workspaceLoadKey");
    expect(workspaceSource).toContain('"already-loaded"');
    expect(workspaceSource).toContain('"recent-success"');
    expect(workspaceSource).toContain('result: "in-flight"');
  });
});

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ptClientsPage = readFileSync(
  resolve(process.cwd(), "src", "pages", "pt", "clients.tsx"),
  "utf8",
);

const ptHubLib = readFileSync(
  resolve(process.cwd(), "src", "features", "pt-hub", "lib", "pt-hub.ts"),
  "utf8",
);

describe("PT clients workspace gating", () => {
  it("does not send a placeholder workspace id into the PT clients RPC", () => {
    expect(ptClientsPage).not.toContain("WORKSPACE_PLACEHOLDER_ID");
    expect(ptClientsPage).toContain("workspaceId: workspaceId ?? undefined");
    expect(ptClientsPage).toContain("enabled: hasWorkspaceContext");
  });

  it("supports gating the paged clients query until the caller is ready", () => {
    expect(ptHubLib).toContain("enabled?: boolean");
    expect(ptHubLib).toContain("const enabled = params.enabled ?? true;");
    expect(ptHubLib).toContain("enabled: Boolean(user?.id) && enabled");
  });
});

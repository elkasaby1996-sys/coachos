import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const currentDangerTab = readFileSync(
  resolve(
    process.cwd(),
    "src",
    "pages",
    "workspace",
    "settings",
    "tabs",
    "danger.tsx",
  ),
  "utf8",
);

const legacyDangerSection = readFileSync(
  resolve(
    process.cwd(),
    "src",
    "pages",
    "settings",
    "sections",
    "DangerZoneSettings.tsx",
  ),
  "utf8",
);

const dangerSources = [
  ["workspace settings danger tab", currentDangerTab],
  ["legacy danger settings section", legacyDangerSection],
] as const;

describe("workspace hard delete beta-disabled UI", () => {
  it.each(dangerSources)(
    "%s renders a disabled beta deletion control",
    (_name, source) => {
      expect(source).toContain("Deletion disabled during beta");
      expect(source).toContain(
        "To prevent accidental data loss, workspace deletion is disabled",
      );
      expect(source).toContain("disabled");
      expect(source).toContain('aria-disabled="true"');
    },
  );

  it.each(dangerSources)(
    "%s cannot open a hard-delete confirmation modal",
    (_name, source) => {
      expect(source).not.toContain("deleteOpen");
      expect(source).not.toContain("setDeleteOpen");
      expect(source).not.toContain("handleDeleteWorkspace");
      expect(source).not.toContain("danger-delete-workspace-confirm-button");
      expect(source).not.toContain("Type workspace name to confirm");
      expect(source).not.toContain("Type workspace name");
      expect(source).not.toContain("Confirm deletion");
    },
  );

  it.each(dangerSources)(
    "%s does not call the workspace delete mutation",
    (_name, source) => {
      expect(source).not.toMatch(
        /\.from\((["'])workspaces\1\)[\s\S]*?\.delete\(\)/,
      );
      expect(source).not.toContain("Workspace deleted.");
    },
  );
});

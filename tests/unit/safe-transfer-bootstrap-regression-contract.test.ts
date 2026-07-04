import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const readRepoFile = (...parts: string[]) =>
  readFileSync(resolve(process.cwd(), ...parts), "utf8").replace(/\r\n/g, "\n");

const useWorkspaceSource = readRepoFile("src", "lib", "use-workspace.ts");
const fixMigration = readRepoFile(
  "supabase",
  "migrations",
  "20260704124500_safe_transfer_bootstrap_regression.sql",
);

describe("safe transfer bootstrap regression contract", () => {
  it("workspace bootstrap reads all client rows and selects the active target relationship", () => {
    expect(useWorkspaceSource).toContain(
      '.select("workspace_id, relationship_status, created_at")',
    );
    expect(useWorkspaceSource).toContain(
      '(row.relationship_status ?? "active") === "active"',
    );
    expect(useWorkspaceSource).not.toContain(
      '.select("workspace_id")\n                .eq("user_id", user.id)\n                .maybeSingle()',
    );
  });

  it("explicit transfer can reactivate a transferred-out target relationship", () => {
    expect(fixMigration).toContain(
      "coalesce(v_target_relationship_status, 'active') = 'transferred_out'",
    );
    expect(fixMigration).toContain(
      "relationship_status = 'active'",
    );
    expect(fixMigration).not.toContain(
      "detail = 'TARGET_RELATIONSHIP_TRANSFERRED_OUT'",
    );
  });

  it("transfer-back keeps one active target row and marks the source transferred_out", () => {
    expect(fixMigration).toContain("if v_target_client_id is null then");
    expect(fixMigration).toContain("where c.id = v_target_client_id");
    expect(fixMigration).toContain("relationship_status = 'transferred_out'");
    expect(fixMigration).not.toContain("TARGET_RELATIONSHIP_TRANSFERRED_OUT");
  });
});

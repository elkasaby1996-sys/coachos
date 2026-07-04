import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const readRepoFile = (...parts: string[]) =>
  readFileSync(resolve(process.cwd(), ...parts), "utf8").replace(/\r\n/g, "\n");

const fixMigration = readRepoFile(
  "supabase",
  "migrations",
  "20260704130000_post_transfer_client_detail_resolution.sql",
);
const clientDetailSource = readRepoFile("src", "pages", "pt", "client-detail.tsx");
const slugRouteSource = readRepoFile("src", "routes", "slug-route-resolvers.tsx");
const leadTransferMigration = readRepoFile(
  "supabase",
  "migrations",
  "20260704123000_safe_beta_workspace_transfer.sql",
);

describe("post-transfer client detail resolution contract", () => {
  it("transfer RPC returns target route identity for the active target relationship", () => {
    expect(fixMigration).toContain("target_client_url_key text");
    expect(fixMigration).toContain("target_workspace_slug text");
    expect(fixMigration).toContain("v_target_client_url_key");
    expect(fixMigration).toContain("v_target_workspace_slug");
    expect(fixMigration).toContain("where c.id = v_target_client_id");
  });

  it("transfer target rows receive a valid url key when created or reactivated", () => {
    expect(fixMigration).toContain("url_key = coalesce");
    expect(fixMigration).toContain("'c-' || lower(substr(replace(v_target_client_id::text, '-', ''), 1, 8))");
    expect(fixMigration).toContain(
      "where c.id = v_target_client_id\n    returning c.url_key into v_target_client_url_key",
    );
  });

  it("client-detail transfer redirects with target identity and falls back safely", () => {
    expect(clientDetailSource).toContain("target_client_url_key");
    expect(clientDetailSource).toContain("target_workspace_slug");
    expect(clientDetailSource).toContain("getClientRouteKeyFallback(targetClientId)");
    expect(clientDetailSource).toContain(
      "navigate(`/w/${targetWorkspaceSlug}/clients/${targetClientUrlKey}`)",
    );
    expect(clientDetailSource).toContain('navigate("/pt/clients"');
  });

  it("workspace client route resolves persisted and computed target url keys", () => {
    expect(slugRouteSource).toContain(".or(");
    expect(slugRouteSource).toContain("url_key.eq.${clientUrlKey}");
    expect(slugRouteSource).toContain("url_key.is.null");
    expect(slugRouteSource).toContain("getClientRouteKeyFallback");
    expect(slugRouteSource).toContain("relationship_status");
    expect(slugRouteSource).toContain(
      '(client.relationship_status ?? "active") !== "active"',
    );
  });

  it("lead transfer still uses the safe transfer target relationship", () => {
    expect(leadTransferMigration).toContain(
      "select transferred.target_client_id into v_target_client_id",
    );
    expect(leadTransferMigration).toContain(
      "from public.pt_transfer_client_relationship(",
    );
    expect(leadTransferMigration).not.toContain("v_lead.converted_client_id as client_id");
  });
});

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const readRepoFile = (...parts: string[]) =>
  existsSync(resolve(process.cwd(), ...parts))
    ? readFileSync(resolve(process.cwd(), ...parts), "utf8").replace(
        /\r\n/g,
        "\n",
      )
    : "";

const migration = readRepoFile(
  "supabase",
  "migrations",
  "20260705110000_archived_client_history_navigation.sql",
);
const allRelationshipScopeMigration = readRepoFile(
  "supabase",
  "migrations",
  "20260707111500_pt_hub_clients_page_all_relationship_scope.sql",
);
const ptHubSource = readRepoFile(
  "src",
  "features",
  "pt-hub",
  "lib",
  "pt-hub.ts",
);
const clientsPageSource = readRepoFile("src", "pages", "pt", "clients.tsx");
const tableSource = readRepoFile(
  "src",
  "features",
  "pt-hub",
  "components",
  "pt-hub-client-table.tsx",
);
const clientStatusDisplaySource = readRepoFile(
  "src",
  "lib",
  "client-status-display.ts",
);
const slugRouteSource = readRepoFile(
  "src",
  "routes",
  "slug-route-resolvers.tsx",
);
const detailSource = readRepoFile("src", "pages", "pt", "client-detail.tsx");

describe("archived client history navigation contract", () => {
  it("keeps active clients query active-only and adds archived relationship scope", () => {
    expect(migration).toContain("p_relationship_scope text default 'active'");
    expect(migration).toContain("v_relationship_scope text := lower");
    expect(migration).toContain(
      "coalesce(c.relationship_status, 'active') = 'active'",
    );
    expect(migration).toContain(
      "coalesce(c.relationship_status, 'active') in ('removed', 'transferred_out')",
    );
    expect(migration).toContain("relationship_status text");
  });

  it("uses permissioned historical access without restoring client-side active access", () => {
    expect(migration).toContain(
      "public.can_access_client(c.id, 'clients.view')",
    );
    expect(migration).not.toContain(
      "create or replace function public.accessible_client_ids",
    );
    expect(migration).not.toContain(
      "relationship_status = 'active'\n    where",
    );
  });

  it("wires clients page active and archived tabs into the list RPC", () => {
    expect(ptHubSource).toContain("relationshipScope?:");
    expect(ptHubSource).toContain("p_relationship_scope: relationshipScope");
    expect(ptHubSource).toContain('"active" | "archived" | "all"');
    expect(clientsPageSource).toContain('viewParam === "archived"');
    expect(clientsPageSource).toContain("relationshipScope: clientListView");
    expect(clientsPageSource).toContain(
      "lg:grid-cols-[minmax(320px,1fr)_minmax(240px,0.65fr)_150px_auto]",
    );
    expect(clientsPageSource).toContain(
      'htmlFor="pt-clients-relationship-view"',
    );
    expect(clientsPageSource).toContain('id="pt-clients-relationship-view"');
    expect(clientsPageSource).not.toContain(
      "flex flex-wrap items-center justify-between gap-3 lg:px-2",
    );
    expect(clientsPageSource).toContain(
      "No archived clients yet. Removed or transferred-out client relationships will appear here.",
    );
  });

  it("allows PT Hub to request active and archived relationships together", () => {
    expect(allRelationshipScopeMigration).toContain(
      "v_relationship_scope not in ('active', 'archived', 'all')",
    );
    expect(allRelationshipScopeMigration).toContain(
      "v_relationship_scope in ('active', 'all')",
    );
    expect(allRelationshipScopeMigration).toContain(
      "v_relationship_scope in ('archived', 'all')",
    );
  });

  it("renders archived relationship badges in client rows", () => {
    expect(tableSource).toContain("getClientGlobalStatusDisplay(client)");
    expect(tableSource).toContain("statusDisplay.globalBadges.map");
    expect(clientStatusDisplaySource).toContain('label: "Removed"');
    expect(clientStatusDisplaySource).toContain('label: "Transferred out"');
    expect(clientStatusDisplaySource).toContain("relationshipStatus");
  });

  it("resolves removed and transferred-out detail routes for authorized coaches", () => {
    expect(slugRouteSource).toContain("getClientRouteRelationshipRank");
    expect(slugRouteSource).toContain(
      "public.can_access_client(client.id, 'clients.view')",
    );
    expect(slugRouteSource).toContain('"removed"');
    expect(slugRouteSource).toContain('"transferred_out"');
  });

  it("shows historical detail banner and gates delivery mutations for ended relationships", () => {
    expect(detailSource).toContain("isHistoricalClientRelationship");
    expect(detailSource).toContain("canMutateActiveClient");
    expect(detailSource).toContain(
      "This client relationship is no longer active. History is preserved for reference.",
    );
    expect(detailSource).toContain(
      "This client was transferred to another workspace. Use explicit transfer to make this workspace active again.",
    );
    expect(detailSource).toContain(
      "This client was removed from active coaching. Reinvite them to reactivate this relationship.",
    );
    expect(detailSource).toContain("canEditClients={canMutateActiveClient}");
    expect(detailSource).toContain(
      "canManageDelivery && !isHistoricalClientRelationship",
    );
  });
});

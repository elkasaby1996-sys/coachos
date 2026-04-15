import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase",
    "migrations",
    "20260415133000_add_client_visible_performance_markers_rpc.sql",
  ),
  "utf8",
);

describe("client visible performance markers RPC contract", () => {
  it("adds a client-scoped RPC for active workspace markers", () => {
    expect(migration).toContain(
      "create or replace function public.client_visible_performance_markers(",
    );
    expect(migration).toContain("returns table(");
    expect(migration).toContain("where bmt.workspace_id = v_workspace_id");
    expect(migration).toContain("coalesce(bmt.is_active, true) = true");
  });

  it("restricts the RPC to authenticated callers", () => {
    expect(migration).toContain(
      "revoke all on function public.client_visible_performance_markers(uuid) from public;",
    );
    expect(migration).toContain(
      "grant execute on function public.client_visible_performance_markers(uuid) to authenticated;",
    );
  });
});

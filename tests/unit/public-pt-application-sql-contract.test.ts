import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase",
    "migrations",
    "20260415123000_limit_public_pt_applications_per_coach.sql",
  ),
  "utf8",
);

describe("public PT application single-coach attempt contract", () => {
  it("serializes applications per coach and applicant pair", () => {
    expect(migration).toContain("pg_catalog.pg_advisory_xact_lock");
    expect(migration).toContain("public_pt_application:%s:%s");
  });

  it("blocks reapplying unless the latest lead was declined", () => {
    expect(migration).toContain(
      "coalesce(v_latest_lead.status, 'new') <> 'declined'",
    );
    expect(migration).toContain(
      "You already have an application with this coach. You can apply again only if they decline it.",
    );
  });

  it("stops updating active leads in place and inserts a fresh row only after decline", () => {
    expect(migration).not.toContain("update public.pt_hub_leads lead");
    expect(migration).toContain("insert into public.pt_hub_leads");
  });
});

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase",
    "migrations",
    "20260702133000_nutrition_replacement_parity.sql",
  ),
  "utf8",
);

const clientNutritionPage = readFileSync(
  resolve(process.cwd(), "src", "pages", "client", "nutrition.tsx"),
  "utf8",
);

const clientHomePage = readFileSync(
  resolve(process.cwd(), "src", "pages", "client", "home.tsx"),
  "utf8",
);

const clientDetailPage = readFileSync(
  resolve(process.cwd(), "src", "pages", "pt", "client-detail.tsx"),
  "utf8",
);

const nutritionLib = readFileSync(
  resolve(process.cwd(), "src", "lib", "nutrition.ts"),
  "utf8",
);

const compactSql = migration.replace(/\s+/g, " ");

describe("nutrition replacement parity SQL contract", () => {
  it("retires previous active coach-assigned nutrition plans before inserting a new coach plan", () => {
    expect(migration).toContain(
      "create or replace function public.assign_nutrition_template_to_client",
    );
    expect(migration).toContain("v_template_owner_client_id is null");
    expect(migration).toContain("v_template_workspace_id is not null");
    expect(compactSql).toContain("set status = 'completed'");
    expect(migration).toContain("and ap.status = 'active'");
    expect(migration).toContain("nt.workspace_id = v_workspace_id");
    expect(migration).toContain("nt.owner_client_id is null");
  });

  it("preserves personal plan auto-close separately from coach plan replacement", () => {
    expect(migration).toContain(
      "if v_template_owner_client_id is not null then",
    );
    expect(migration).toContain("nt.owner_client_id = p_client_id");
    expect(migration).toContain("nt.workspace_id is null");
  });

  it("cleans up legacy duplicate active coach plans deterministically", () => {
    expect(migration).toContain("ranked_active_coach_plans");
    expect(compactSql).toContain(
      "row_number() over ( partition by ap.client_id, nt.workspace_id",
    );
    expect(compactSql).toContain("and ranked.rn > 1");
  });

  it("does not add a one-active-per-client index that would conflict with personal plans", () => {
    expect(migration).not.toContain(
      "create unique index assigned_nutrition_plans_one_active",
    );
    expect(migration).not.toContain("where status = 'active'");
  });
});

describe("nutrition current-plan query contract", () => {
  it("client nutrition page fetches active plan rows only for current nutrition", () => {
    expect(clientNutritionPage).toContain('.eq("status", "active")');
  });

  it("client home nutrition widgets fetch active plan rows only", () => {
    expect(clientHomePage).toContain('.eq("status", "active")');
  });

  it("coach client detail fetches active plan rows only for current assignment and previews", () => {
    expect(clientDetailPage).toContain('.eq("status", "active")');
    expect(clientDetailPage).toContain(
      "nutrition_template:nutrition_templates!inner",
    );
    expect(clientDetailPage).not.toContain(
      '.not("nutrition_template.workspace_id", "is", null)',
    );
    expect(clientDetailPage).not.toContain(
      '.is("nutrition_template.owner_client_id", null)',
    );
    expect(clientDetailPage).toContain("template?.workspace_id");
    expect(clientDetailPage).toContain(
      'queryKey: ["pt-client-active-nutrition-plan", clientId]',
    );
  });

  it("shared assigned nutrition range hook fetches active plan rows only", () => {
    expect(nutritionLib).toContain('.eq("status", "active")');
  });
});

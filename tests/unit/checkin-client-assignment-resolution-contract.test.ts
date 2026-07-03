import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const readRepo = (...parts: string[]) =>
  readFileSync(resolve(process.cwd(), ...parts), "utf8");

const migration = readRepo(
  "supabase",
  "migrations",
  "20260703115000_checkin_client_assignment_resolution.sql",
);

const clientCheckinPage = readRepo("src", "pages", "client", "checkin.tsx");
const workspaceTeamClientAccessMigration = readRepo(
  "supabase",
  "migrations",
  "20260509190000_workspace_team_client_access_hardening.sql",
);

const functionBody = (source: string, functionName: string) => {
  const match = source.match(
    new RegExp(
      `create or replace function public\\.${functionName}\\([\\s\\S]*?\\n\\$\\$;`,
      "i",
    ),
  );
  expect(match, `missing function ${functionName}`).not.toBeNull();
  return match?.[0] ?? "";
};

describe("check-in client assignment resolution contract", () => {
  it("restores client read access to check-in templates in their own workspace", () => {
    expect(migration).toContain("create policy checkin_templates_select_access");
    expect(migration).toContain("public.can_access_workspace(workspace_id)");
    expect(migration).toContain("from public.clients c");
    expect(migration).toContain(
      "c.workspace_id = checkin_templates.workspace_id",
    );
    expect(migration).toContain("c.user_id = (select auth.uid())");
  });

  it("restores client read access to questions for readable check-in templates", () => {
    expect(migration).toContain("create policy checkin_questions_select_access");
    expect(migration).toContain("ct.id = checkin_questions.template_id");
    expect(migration).toContain("c.workspace_id = ct.workspace_id");
    expect(migration).toContain("c.user_id = (select auth.uid())");
  });

  it("uses persisted explicit assignment before workspace default and no latest-template fallback", () => {
    expect(clientCheckinPage).toContain(
      "const templateId = assignedTemplateId ?? workspaceDefaultTemplateId ?? null;",
    );
    expect(clientCheckinPage).not.toContain("client-checkin-latest-template");
    expect(clientCheckinPage).not.toContain("latestTemplateQuery");
  });

  it("passes persisted assignment/default settings into the client state resolver", () => {
    expect(clientCheckinPage).toContain(
      "hasEffectiveTemplate: Boolean(templateId)",
    );
    expect(clientCheckinPage).toContain(
      "checkinStartDate: clientProfile?.checkin_start_date",
    );
    expect(clientCheckinPage).toContain(
      "checkinFrequency: clientProfile?.checkin_frequency",
    );
  });

  it("selects the fields that the coach settings RPC persists", () => {
    const rpcBody = functionBody(
      workspaceTeamClientAccessMigration,
      "pt_update_client_checkin_settings",
    );

    expect(rpcBody).toContain("public.can_access_client(p_client_id, 'delivery.manage')");
    expect(rpcBody).toContain("checkin_template_id = p_checkin_template_id");
    expect(rpcBody).toContain("checkin_frequency = v_frequency");
    expect(rpcBody).toContain("checkin_start_date = p_checkin_start_date");
    expect(clientCheckinPage).toContain(
      "id, workspace_id, checkin_template_id, checkin_frequency, checkin_start_date, timezone, created_at",
    );
    expect(migration).toContain("checkin_templates_select_access");
  });
});

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const contracts = readFileSync("src/features/workspace-team/contracts.ts", "utf8");
const inviteApiSql = readFileSync(
  "supabase/migrations/20260509180000_workspace_team_invite_apis.sql",
  "utf8",
);
const accessSql = readFileSync(
  "supabase/migrations/20260509173000_workspace_team_access_permissions.sql",
  "utf8",
);
const clientHardeningSql = readFileSync(
  "supabase/migrations/20260509190000_workspace_team_client_access_hardening.sql",
  "utf8",
);
const operationalSql = readFileSync(
  "supabase/migrations/20260509193000_workspace_team_operational_hardening.sql",
  "utf8",
);
const ptHubSharedContract = readFileSync(
  "tests/unit/pt-hub-shared-workspaces-contract.test.ts",
  "utf8",
);
const settingsContract = readFileSync(
  "tests/unit/workspace-team-settings-page-contract.test.ts",
  "utf8",
);
const inviteAcceptanceContract = readFileSync(
  "tests/unit/workspace-team-invite-acceptance-wiring.test.ts",
  "utf8",
);
const releaseChecklist = readFileSync(
  "docs/workspace-teams-release-checklist.md",
  "utf8",
);
const e2eAuthSeeds = readFileSync("tests/e2e/utils/auth-seeds.ts", "utf8");
const clientHomePage = readFileSync("src/pages/client/home.tsx", "utf8");
const authOnboardingSmoke = readFileSync(
  "tests/e2e/auth-onboarding.smoke.spec.ts",
  "utf8",
);

function functionBody(source: string, startMarker: string, endMarker: string) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe("workspace teams release readiness contract", () => {
  it("covers the full invite acceptance to PT Hub shared workspace path", () => {
    expect(settingsContract).toContain("Team & Permissions");
    expect(settingsContract).toContain("createWorkspaceTeamInvite");
    const createInviteBody = functionBody(
      inviteApiSql,
      "create or replace function public.create_workspace_team_invite",
      "create or replace function public.preview_workspace_team_invite",
    );
    expect(createInviteBody).toContain(
      "insert into public.workspace_member_invites",
    );
    expect(createInviteBody).not.toContain("insert into public.workspace_members");
    expect(inviteAcceptanceContract).toContain('path="/team-invites/:token"');
    expect(inviteAcceptanceContract).toContain("acceptWorkspaceTeamInvite");
    expect(inviteApiSql).toContain("set status = 'accepted'");
    expect(ptHubSharedContract).toContain("Shared workspace");
    expect(ptHubSharedContract).toContain("navigate(`/workspace/${workspaceId}`)");
  });

  it("preserves owner backward compatibility without owner member rows", () => {
    expect(accessSql).toContain("w.owner_user_id = v_user_id");
    expect(accessSql).toContain("'owner'::text");
    expect(accessSql).toContain("null::uuid");
    expect(ptHubSharedContract).toContain('.eq("owner_user_id", userId)');
  });

  it("keeps team access independent of lifecycle, risk, onboarding, and generic client status", () => {
    const accessBodies = [
      functionBody(
        accessSql,
        "create or replace function public.workspace_access_context",
        "create or replace function public.can_access_workspace",
      ),
      functionBody(
        accessSql,
        "create or replace function public.can_access_client",
        "create or replace function public.accessible_client_ids",
      ),
      functionBody(
        clientHardeningSql,
        "create or replace function public.can_access_conversation",
        "create or replace function public.pt_message_recipients",
      ),
      functionBody(
        operationalSql,
        "create or replace function public.workspace_access_context",
        "create or replace function public.update_workspace_team_member_role",
      ),
    ].join("\n");

    expect(accessBodies).not.toContain("manual_risk_flag");
    expect(accessBodies).not.toContain("onboarding_status");
    expect(accessBodies).not.toContain("risk_score");
    expect(accessBodies).not.toContain("lifecycle_state =");
    expect(contracts).toContain('viewer: ["workspace.view", "clients.view"]');
  });

  it("locks down release security regression cases", () => {
    expect(inviteApiSql).toContain("token_hash");
    expect(inviteApiSql).not.toContain(" token text");
    expect(inviteApiSql).toContain("lower(v_invite.email) <> v_user_email");
    expect(inviteApiSql).toContain("'INVITE_REVOKED'");
    expect(inviteApiSql).toContain("'INVITE_EXPIRED'");
    expect(inviteApiSql).toContain("'INVITE_NOT_PENDING'");
    expect(clientHardeningSql).toContain(
      "public.can_access_client(p_client_id, 'clients.message')",
    );
    expect(operationalSql).toContain("- 'token_hash'");
    expect(operationalSql).toContain("- 'acceptUrl'");
  });

  it("documents QA, rollout, and rollback expectations", () => {
    expect(releaseChecklist).toContain("Workspace Teams Release Checklist");
    expect(releaseChecklist).toContain("Wrong signed-in account cannot accept");
    expect(releaseChecklist).toContain("Shared workspace appears in PT Hub");
    expect(releaseChecklist).toContain("workspace_teams_enabled");
    expect(releaseChecklist).toContain("Do not delete accepted memberships");
    expect(releaseChecklist).toContain("Preserve audit, member, invite");
  });

  it("keeps smoke-test workspace member seeding idempotent with new uniqueness constraints", () => {
    expect(e2eAuthSeeds).toContain(
      "on conflict (workspace_id, user_id) do update",
    );
    expect(e2eAuthSeeds).toContain("on conflict (user_id, workspace_id) do update");
    expect(e2eAuthSeeds).toContain("client_access_mode = 'all_clients'");
  });

  it("keeps client smoke readiness aligned with the current client home shell", () => {
    expect(clientHomePage).toContain('data-testid="client-home-page"');
    expect(authOnboardingSmoke).toContain('testId: "client-home-page"');
  });
});

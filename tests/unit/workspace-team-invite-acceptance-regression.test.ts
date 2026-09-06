import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function readSource(...segments: string[]) {
  return readFileSync(resolve(process.cwd(), ...segments), "utf8");
}

function readOptionalSource(...segments: string[]) {
  const path = resolve(process.cwd(), ...segments);
  return existsSync(path) ? readFileSync(path, "utf8") : "";
}

function functionBody(source: string, functionName: string) {
  const marker = `create or replace function public.${functionName}`;
  const start = source.indexOf(marker);
  expect(start, `${functionName} should exist`).toBeGreaterThanOrEqual(0);

  const next = source.indexOf(
    "\ncreate or replace function public.",
    start + 1,
  );
  const grant = source.indexOf("\ngrant ", start + 1);
  const candidates = [next, grant].filter((index) => index > start);
  const end = candidates.length > 0 ? Math.min(...candidates) : source.length;
  return source.slice(start, end);
}

const regressionSql = readOptionalSource(
  "supabase",
  "migrations",
  "20260630123000_workspace_team_invite_acceptance_regression.sql",
);
const notificationPage = readSource(
  "src",
  "features",
  "notifications",
  "pages",
  "notifications-page.tsx",
);
const inviteApi = readSource(
  "src",
  "features",
  "workspace-team",
  "invite-api.ts",
);
const routeResolver = readSource(
  "src",
  "features",
  "notifications",
  "lib",
  "notification-route-resolver.ts",
);

describe("workspace team invite acceptance regression", () => {
  it("reactivates inactive prior memberships when the invited email accepts a fresh invite", () => {
    for (const functionName of [
      "accept_workspace_team_invite",
      "accept_workspace_team_invite_by_id",
    ]) {
      const body = functionBody(regressionSql, functionName);

      expect(body).toContain("where wm.workspace_id = v_invite.workspace_id");
      expect(body).toContain("and wm.status = 'active'");
      expect(body).toContain("on conflict (workspace_id, user_id) do update");
      expect(body).toContain("status = 'active'");
      expect(body).toContain("source_invite_id = excluded.source_invite_id");
      expect(body).toContain("where workspace_members.status <> 'active'");
      expect(body).toContain(
        "delete from public.workspace_member_client_assignments",
      );
      expect(body).toContain("wmca.member_id = v_membership.id");
      expect(body).toContain(
        "from public.workspace_invite_client_assignments wica",
      );
    }
  });

  it("preserves wrong-account and client-account invite protections", () => {
    const acceptBody = functionBody(
      regressionSql,
      "accept_workspace_team_invite",
    );

    expect(acceptBody).toContain("lower(v_invite.email) <> v_user_email");
    expect(acceptBody).toContain("'INVITE_EMAIL_MISMATCH'");
    expect(acceptBody).toContain("email_confirmed_at");
    expect(acceptBody).toContain("'AUTHENTICATED_EMAIL_NOT_VERIFIED'");
    expect(regressionSql).toContain(
      "revoke all on function public.preview_workspace_team_invite(text) from public, anon;",
    );
    expect(regressionSql).toContain(
      "grant execute on function public.preview_workspace_team_invite(text) to authenticated;",
    );
  });

  it("routes invite notifications to the secure token page instead of accepting in place", () => {
    expect(
      functionBody(regressionSql, "create_workspace_team_invite"),
    ).toContain("perform public.set_workspace_team_invite_notification_route(");
    expect(
      functionBody(regressionSql, "resend_workspace_team_invite"),
    ).toContain("perform public.set_workspace_team_invite_notification_route(");
    expect(regressionSql).toContain(
      "'/team-invites/' || trim(coalesce(p_token, ''))",
    );
    expect(regressionSql).toContain(
      "revoke all on function public.set_workspace_team_invite_notification_route(uuid, text) from public, anon, authenticated;",
    );

    expect(routeResolver).toContain('"/team-invites/"');
    expect(notificationPage).toContain("Open invitation");
    expect(notificationPage).toContain("navigate(inviteRoute)");
    expect(notificationPage).not.toContain("acceptWorkspaceTeamInviteById");
    expect(inviteApi).not.toContain("acceptWorkspaceTeamInviteById");
  });
});

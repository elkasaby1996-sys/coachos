import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const appRoutes = readFileSync("src/routes/app.tsx", "utf8");
const lazyPages = readFileSync("src/routes/lazy-pages.ts", "utf8");
const pageSource = readFileSync(
  "src/pages/public/team-invite-acceptance.tsx",
  "utf8",
);
const loginSource = readFileSync("src/pages/public/login.tsx", "utf8");
const signupRoleSource = readFileSync(
  "src/pages/public/signup-role.tsx",
  "utf8",
);
const ptSignupSource = readFileSync("src/pages/public/pt-signup.tsx", "utf8");

describe("workspace team invite acceptance wiring", () => {
  it("adds a public route for team invite acceptance", () => {
    expect(lazyPages).toContain("TeamInviteAcceptancePage");
    expect(appRoutes).toContain('path="/team-invites/:token"');
    expect(appRoutes).toContain("TeamInviteAcceptancePage");
  });

  it("preserves invite return paths through sign in and sign up", () => {
    expect(pageSource).toContain('buildRedirectLink("/login", token)');
    expect(pageSource).toContain('buildRedirectLink("/signup/pt", token)');
    expect(loginSource).toContain('startsWith("/team-invites/")');
    expect(loginSource).toContain("secondaryLinkHref={signupLink}");
    expect(signupRoleSource).toContain('startsWith("/team-invites/")');
    expect(ptSignupSource).toContain('startsWith("/team-invites/")');
    expect(ptSignupSource).toContain("next: inviteRedirect");
  });

  it("keeps invite acceptance server-side and redirects to the service result", () => {
    expect(pageSource).toContain("acceptWorkspaceTeamInvite");
    expect(pageSource).toContain("navigate(result.redirectTo");
    expect(pageSource).toContain("Workspace added to your PT Hub");
    expect(pageSource).not.toContain('.from("workspace_members").insert');
    expect(pageSource).not.toContain("workspace_member_client_assignments");
  });

  it("renders required terminal and mismatch copy", () => {
    expect(pageSource).toContain("Sign in to accept");
    expect(pageSource).toContain("Create account to accept");
    expect(pageSource).toContain("This invite was sent to");
    expect(pageSource).toContain("This invite has expired");
    expect(pageSource).toContain("This invite is no longer available");
    expect(pageSource).toContain("This invite has already been accepted");
  });
});

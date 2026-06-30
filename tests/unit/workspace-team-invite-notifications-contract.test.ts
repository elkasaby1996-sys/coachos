import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260509213000_workspace_team_invite_notifications.sql",
  "utf8",
);
const notificationTypes = readFileSync(
  "src/features/notifications/lib/types.ts",
  "utf8",
);
const notificationPage = readFileSync(
  "src/features/notifications/pages/notifications-page.tsx",
  "utf8",
);
const inviteApi = readFileSync(
  "src/features/workspace-team/invite-api.ts",
  "utf8",
);
const routeResolver = readFileSync(
  "src/features/notifications/lib/notification-route-resolver.ts",
  "utf8",
);

describe("workspace team invite notifications", () => {
  it("creates recipient notifications and queued email deliveries for existing PT users", () => {
    expect(migration).toContain("team_invite_received");
    expect(migration).toContain("select u.id");
    expect(migration).toContain("from auth.users u");
    expect(migration).toContain("public.notify_workspace_team_user");
    expect(migration).toContain("/pt-hub/notifications?teamInvite=");
    expect(migration).toContain("Workspace team invite");
  });

  it("adds authenticated accept-by-id and decline RPCs for notification actions", () => {
    expect(migration).toContain(
      "create or replace function public.accept_workspace_team_invite_by_id",
    );
    expect(migration).toContain(
      "create or replace function public.decline_workspace_team_invite",
    );
    expect(migration).toContain("status = 'declined'");
    expect(migration).toContain("team.invite_declined");
    expect(migration).toContain(
      "grant execute on function public.decline_workspace_team_invite",
    );
  });

  it("models team invite notifications in the client notification system", () => {
    expect(notificationTypes).toContain('"team_invite_received"');
    expect(notificationTypes).toContain('"team_invite_declined"');
    expect(inviteApi).toContain("acceptWorkspaceTeamInvite");
    expect(inviteApi).toContain("declineWorkspaceTeamInvite");
  });

  it("routes PT notification invite actions to the secure invite page", () => {
    expect(notificationPage).toContain("isWorkspaceTeamInviteNotification");
    expect(notificationPage).toContain("Open invitation");
    expect(notificationPage).toContain("openInviteNotification");
    expect(notificationPage).toContain("navigate(inviteRoute)");
    expect(routeResolver).toContain('"/team-invites/"');
    expect(notificationPage).toContain("Decline");
    expect(notificationPage).not.toContain("acceptWorkspaceTeamInviteById");
    expect(inviteApi).not.toContain("acceptWorkspaceTeamInviteById");
    expect(notificationPage).toContain("declineWorkspaceTeamInvite");
  });
});

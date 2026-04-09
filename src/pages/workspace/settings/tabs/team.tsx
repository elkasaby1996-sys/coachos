import { useQuery } from "@tanstack/react-query";
import { Button } from "../../../../components/ui/button";
import {
  SettingsHelperCallout,
  SettingsSectionCard,
} from "../../../../features/settings/components/settings-primitives";
import { supabase } from "../../../../lib/supabase";
import { useWorkspaceSettingsOutletContext } from "../layout";

type WorkspaceMemberRow = {
  user_id: string;
  role: string | null;
  created_at: string | null;
};

type InviteRow = {
  id: string;
  code: string;
  created_at: string;
  expires_at: string | null;
  uses: number | null;
  max_uses: number | null;
};

export function WorkspaceSettingsTeamTab() {
  const { workspaceId, canManage, role } = useWorkspaceSettingsOutletContext();

  const membersQuery = useQuery({
    queryKey: ["workspace-settings-team-members", workspaceId],
    enabled: Boolean(workspaceId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workspace_members")
        .select("user_id, role, created_at")
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as WorkspaceMemberRow[];
    },
  });

  const invitesQuery = useQuery({
    queryKey: ["workspace-settings-team-invites", workspaceId],
    enabled: Boolean(workspaceId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invites")
        .select("id, code, created_at, expires_at, uses, max_uses")
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return (data ?? []) as InviteRow[];
    },
  });

  return (
    <div className="space-y-4">
      <SettingsSectionCard
        title="Workspace Members"
        description="Membership and roles scoped to this workspace."
        action={
          <Button type="button" variant="secondary" size="sm" disabled>
            Invite team member (Coming soon)
          </Button>
        }
      >
        {membersQuery.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading members...</p>
        ) : membersQuery.error ? (
          <p className="text-sm text-danger">
            Unable to load workspace members.
          </p>
        ) : (
          <div className="space-y-2">
            {membersQuery.data?.length ? (
              membersQuery.data.map((member) => (
                <div
                  key={member.user_id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/70 bg-card/40 px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">
                      {member.user_id}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Role: {member.role ?? "unknown"}
                    </p>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    Joined: {member.created_at ?? "Unknown"}
                  </span>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">
                No members found for this workspace.
              </p>
            )}
          </div>
        )}
      </SettingsSectionCard>

      <SettingsSectionCard
        title="Recent Invite Links"
        description="Read-only visibility into invite links for this workspace."
      >
        {invitesQuery.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading invites...</p>
        ) : invitesQuery.error ? (
          <p className="text-sm text-danger">Unable to load invite links.</p>
        ) : (
          <div className="space-y-2">
            {invitesQuery.data?.length ? (
              invitesQuery.data.map((invite) => (
                <div
                  key={invite.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/70 bg-card/40 px-4 py-3"
                >
                  <div>
                    <p className="font-mono text-sm text-foreground">
                      {invite.code}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Uses: {invite.uses ?? 0} / {invite.max_uses ?? 0}
                    </p>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Expires: {invite.expires_at ?? "Never"}
                  </p>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">
                No invite links created yet.
              </p>
            )}
          </div>
        )}
      </SettingsSectionCard>

      <SettingsHelperCallout
        title={canManage ? "Manage-level access detected" : "Read-only access"}
        body={
          canManage
            ? `Your role (${role ?? "unknown"}) can manage workspace settings. Team role edit and invite workflows are still pending safe backend support.`
            : "You can view team state but cannot edit workspace members."
        }
      />
    </div>
  );
}

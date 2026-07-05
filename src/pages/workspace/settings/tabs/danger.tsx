import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../../../../components/ui/alert-dialog";
import { Button } from "../../../../components/ui/button";
import {
  SettingsFieldRow,
  SettingsHelperCallout,
  SettingsSectionCard,
} from "../../../../features/settings/components/settings-primitives";
import { useBootstrapAuth, useSessionAuth } from "../../../../lib/auth";
import { supabase } from "../../../../lib/supabase";
import { useWorkspaceSettingsOutletContext } from "../outlet-context";

export function WorkspaceSettingsDangerTab() {
  const navigate = useNavigate();
  const { user } = useSessionAuth();
  const { refreshRole } = useBootstrapAuth();
  const { workspaceId, isOwner } = useWorkspaceSettingsOutletContext();
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [leaveSaving, setLeaveSaving] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);

  const transferOwnershipCopy = useMemo(
    () =>
      isOwner
        ? "Ownership transfer flow is not available yet."
        : "Only workspace owners can transfer ownership.",
    [isOwner],
  );

  const handleLeaveWorkspace = async () => {
    if (!workspaceId || !user?.id) return;

    setLeaveSaving(true);
    setErrorText(null);
    try {
      const { error } = await supabase
        .from("workspace_members")
        .delete()
        .eq("workspace_id", workspaceId)
        .eq("user_id", user.id);
      if (error) throw error;

      await refreshRole?.();
      setLeaveOpen(false);
      navigate("/no-workspace", { replace: true });
    } catch (error) {
      setErrorText(
        error instanceof Error ? error.message : "Unable to leave workspace.",
      );
    } finally {
      setLeaveSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      {errorText ? (
        <div className="rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
          {errorText}
        </div>
      ) : null}

      <SettingsSectionCard
        title="Danger Zone"
        description="Destructive workspace actions are isolated here."
      >
        <SettingsFieldRow
          label="Archive workspace"
          hint="Archive flow is not available yet."
        >
          <Button type="button" variant="secondary" disabled>
            Archive workspace (Unavailable)
          </Button>
        </SettingsFieldRow>

        <SettingsFieldRow label="Transfer ownership" hint="Owner-only action.">
          <Button type="button" variant="secondary" disabled>
            Transfer ownership (Unavailable)
          </Button>
          <p className="text-xs text-muted-foreground">
            {transferOwnershipCopy}
          </p>
        </SettingsFieldRow>

        <SettingsFieldRow
          label="Leave workspace"
          hint="Remove your membership from this workspace."
        >
          <Button
            type="button"
            variant="secondary"
            className="border-danger/40 text-danger hover:bg-danger/10"
            onClick={() => setLeaveOpen(true)}
          >
            Leave workspace
          </Button>
        </SettingsFieldRow>

        <SettingsFieldRow
          label="Delete workspace"
          hint="To prevent accidental data loss, workspace deletion is disabled during beta."
        >
          <Button
            type="button"
            variant="secondary"
            className="border-danger/40 text-muted-foreground"
            disabled
            aria-disabled="true"
          >
            Deletion disabled during beta
          </Button>
          <p className="text-xs text-muted-foreground">
            To prevent accidental data loss, workspace deletion is disabled
            during beta.
          </p>
        </SettingsFieldRow>
      </SettingsSectionCard>

      <SettingsHelperCallout
        title="Destructive actions are isolated"
        body="Billing and account security are intentionally excluded from workspace danger actions."
        tone="warning"
      />

      <AlertDialog open={leaveOpen} onOpenChange={setLeaveOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Leave workspace?</AlertDialogTitle>
            <AlertDialogDescription>
              You will lose access to this workspace until re-invited.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setLeaveOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="secondary"
              className="border-danger/40 text-danger hover:bg-danger/10"
              onClick={handleLeaveWorkspace}
              disabled={leaveSaving}
            >
              {leaveSaving ? "Leaving..." : "Confirm leave"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

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
import { Input } from "../../../../components/ui/input";
import {
  SettingsFieldRow,
  SettingsHelperCallout,
  SettingsSectionCard,
} from "../../../../features/settings/components/settings-primitives";
import { useBootstrapAuth, useSessionAuth } from "../../../../lib/auth";
import { supabase } from "../../../../lib/supabase";
import { useWorkspaceSettingsOutletContext } from "../layout";

export function WorkspaceSettingsDangerTab() {
  const navigate = useNavigate();
  const { user } = useSessionAuth();
  const { refreshRole } = useBootstrapAuth();
  const { workspace, workspaceId, isOwner } = useWorkspaceSettingsOutletContext();
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [leaveSaving, setLeaveSaving] = useState(false);
  const [deleteSaving, setDeleteSaving] = useState(false);
  const [deleteConfirmValue, setDeleteConfirmValue] = useState("");
  const [errorText, setErrorText] = useState<string | null>(null);

  const workspaceName = workspace?.name?.trim() || "this workspace";
  const canConfirmDelete = deleteConfirmValue.trim() === workspaceName;

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

  const handleDeleteWorkspace = async () => {
    if (!workspaceId || !isOwner || !canConfirmDelete) return;

    setDeleteSaving(true);
    setErrorText(null);
    try {
      const { error } = await supabase
        .from("workspaces")
        .delete()
        .eq("id", workspaceId);
      if (error) throw error;

      setDeleteOpen(false);
      await supabase.auth.signOut();
      navigate("/login", { replace: true });
    } catch (error) {
      setErrorText(
        error instanceof Error ? error.message : "Unable to delete workspace.",
      );
    } finally {
      setDeleteSaving(false);
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

        <SettingsFieldRow
          label="Transfer ownership"
          hint="Owner-only action."
        >
          <Button type="button" variant="secondary" disabled>
            Transfer ownership (Unavailable)
          </Button>
          <p className="text-xs text-muted-foreground">{transferOwnershipCopy}</p>
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
          hint="Permanent destructive action (owner only)."
        >
          <Button
            type="button"
            variant="secondary"
            className="border-danger/40 text-danger hover:bg-danger/10"
            onClick={() => setDeleteOpen(true)}
            disabled={!isOwner}
          >
            Delete workspace
          </Button>
          {!isOwner ? (
            <p className="text-xs text-muted-foreground">
              Only workspace owners can delete a workspace.
            </p>
          ) : null}
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

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete workspace</AlertDialogTitle>
            <AlertDialogDescription>
              This cannot be undone. Type <strong>{workspaceName}</strong> to
              confirm deletion.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-2">
            <Input
              value={deleteConfirmValue}
              onChange={(event) => setDeleteConfirmValue(event.target.value)}
              placeholder="Type workspace name to confirm"
            />
            <p className="text-xs text-muted-foreground">
              All associated workspace data will be permanently deleted.
            </p>
          </div>

          <AlertDialogFooter>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setDeleteOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="secondary"
              className="border-danger/40 text-danger hover:bg-danger/10"
              onClick={handleDeleteWorkspace}
              disabled={!isOwner || !canConfirmDelete || deleteSaving}
            >
              {deleteSaving ? "Deleting..." : "Delete workspace"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

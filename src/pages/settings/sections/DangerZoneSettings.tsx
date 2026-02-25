import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Alert, AlertDescription, AlertTitle } from "../../../components/ui/alert";
import { Button } from "../../../components/ui/button";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../../../components/ui/alert-dialog";
import { Input } from "../../../components/ui/input";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../../../components/ui/tooltip";
import { useAuth } from "../../../lib/auth";
import { supabase } from "../../../lib/supabase";
import { useWorkspace } from "../../../lib/use-workspace";
import {
  SettingsBlock,
  SettingsInlineSeparator,
  SettingsPageShell,
  SettingsRow,
  SettingsToast,
} from "./shared";

export function DangerZoneSettings() {
  const navigate = useNavigate();
  const { user, refreshRole } = useAuth();
  const { workspaceId } = useWorkspace();
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastVariant, setToastVariant] = useState<"success" | "error">("success");
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [leaveSaving, setLeaveSaving] = useState(false);
  const [deleteSaving, setDeleteSaving] = useState(false);
  const [deleteConfirmValue, setDeleteConfirmValue] = useState("");

  const workspaceQuery = useQuery({
    queryKey: ["settings-danger-workspace", workspaceId],
    enabled: Boolean(workspaceId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workspaces")
        .select("id, name")
        .eq("id", workspaceId ?? "")
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as { id: string; name: string | null } | null;
    },
  });

  const memberQuery = useQuery({
    queryKey: ["settings-danger-membership", workspaceId, user?.id],
    enabled: Boolean(workspaceId && user?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workspace_members")
        .select("workspace_id, user_id, role")
        .eq("workspace_id", workspaceId ?? "")
        .eq("user_id", user?.id ?? "")
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as {
        workspace_id: string;
        user_id: string;
        role: string;
      } | null;
    },
  });

  useEffect(() => {
    if (!toastMessage) return;
    const timeout = window.setTimeout(() => setToastMessage(null), 2600);
    return () => window.clearTimeout(timeout);
  }, [toastMessage]);

  const isOwner = memberQuery.data?.role === "pt_owner";
  const workspaceName = workspaceQuery.data?.name ?? "this workspace";
  const canConfirmDelete = deleteConfirmValue.trim() === workspaceName;

  const handleLeaveWorkspace = async () => {
    if (!workspaceId || !user?.id) return;
    setLeaveSaving(true);
    try {
      const { error } = await supabase
        .from("workspace_members")
        .delete()
        .eq("workspace_id", workspaceId)
        .eq("user_id", user.id);
      if (error) throw error;

      await refreshRole?.();
      setToastVariant("success");
      setToastMessage("You left the workspace.");
      setLeaveOpen(false);
      navigate("/no-workspace", { replace: true });
    } catch (error) {
      setToastVariant("error");
      setToastMessage(
        error instanceof Error ? error.message : "Unable to leave workspace.",
      );
    } finally {
      setLeaveSaving(false);
    }
  };

  const handleDeleteWorkspace = async () => {
    if (!workspaceId || !canConfirmDelete) return;
    setDeleteSaving(true);
    try {
      const { error } = await supabase
        .from("workspaces")
        .delete()
        .eq("id", workspaceId);
      if (error) throw error;

      setToastVariant("success");
      setToastMessage("Workspace deleted.");
      setDeleteOpen(false);
      await supabase.auth.signOut();
      navigate("/login", { replace: true });
    } catch (error) {
      setToastVariant("error");
      setToastMessage(
        error instanceof Error
          ? error.message
          : "Unable to delete workspace.",
      );
    } finally {
      setDeleteSaving(false);
    }
  };

  const transferTooltip = useMemo(
    () =>
      isOwner
        ? "Ownership transfer flow coming soon"
        : "Only workspace owners can transfer ownership",
    [isOwner],
  );

  return (
    <>
      <SettingsToast message={toastMessage} variant={toastVariant} />
      <SettingsPageShell
        title="Danger Zone"
        description="Destructive actions for workspace access and ownership."
      >
        <SettingsBlock
          title="Workspace actions"
          description="These actions are irreversible and should be used carefully."
          noBorder
        >
          <Alert className="border-danger/40 bg-danger/5">
            <AlertTitle>Destructive operations</AlertTitle>
            <AlertDescription>
              Deleting a workspace permanently removes associated data. Confirm carefully.
            </AlertDescription>
          </Alert>

          <SettingsRow
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
          </SettingsRow>

          <SettingsInlineSeparator />

          <SettingsRow
            label="Transfer ownership"
            hint="Hand workspace ownership to another PT owner."
          >
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span>
                    <Button type="button" variant="secondary" disabled>
                      Transfer ownership
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent>{transferTooltip}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </SettingsRow>

          <SettingsInlineSeparator />

          <SettingsRow
            label="Delete workspace"
            hint="Permanently delete workspace and all connected records."
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
              <p className="text-xs text-muted-foreground">Only workspace owners can delete the workspace.</p>
            ) : null}
          </SettingsRow>
        </SettingsBlock>
      </SettingsPageShell>

      <AlertDialog open={leaveOpen} onOpenChange={setLeaveOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Leave workspace?</AlertDialogTitle>
            <AlertDialogDescription>
              You will lose access to workspace data until re-invited.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button type="button" variant="secondary" onClick={() => setLeaveOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="secondary"
              className="border-danger/40 text-danger hover:bg-danger/10"
              onClick={handleLeaveWorkspace}
              disabled={leaveSaving}
              data-testid="danger-leave-workspace-confirm-button"
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
              This action cannot be undone. Type <strong>{workspaceName}</strong> to confirm deletion.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-2">
            <Input
              value={deleteConfirmValue}
              onChange={(event) => setDeleteConfirmValue(event.target.value)}
              placeholder="Type workspace name to confirm"
            />
            <p className="text-xs text-muted-foreground">
              All associated clients, templates, messages, and logs will be removed.
            </p>
          </div>

          <AlertDialogFooter>
            <Button type="button" variant="secondary" onClick={() => setDeleteOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="secondary"
              className="border-danger/40 text-danger hover:bg-danger/10"
              onClick={handleDeleteWorkspace}
              disabled={!canConfirmDelete || deleteSaving}
              data-testid="danger-delete-workspace-confirm-button"
            >
              {deleteSaving ? "Deleting..." : "Delete workspace"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "../../../components/ui/alert";
import { Button } from "../../../components/ui/button";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../../../components/ui/alert-dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../../../components/ui/tooltip";
import { useBootstrapAuth, useSessionAuth } from "../../../lib/auth";
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
  const { user } = useSessionAuth();
  const { refreshRole } = useBootstrapAuth();
  const { workspaceId } = useWorkspace();
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastVariant, setToastVariant] = useState<"success" | "error">(
    "success",
  );
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [leaveSaving, setLeaveSaving] = useState(false);

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
              To prevent accidental data loss, workspace deletion is disabled
              during beta.
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
              data-testid="danger-leave-workspace-confirm-button"
            >
              {leaveSaving ? "Leaving..." : "Confirm leave"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Alert, AlertDescription, AlertTitle } from "../../components/ui/alert";
import { EmptyState } from "../../components/ui/coachos/empty-state";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { FieldCharacterMeta } from "../../components/common/field-character-meta";
import { PtHubPageHeader } from "../../features/pt-hub/components/pt-hub-page-header";
import { PtHubWorkspaceCard } from "../../features/pt-hub/components/pt-hub-workspace-card";
import {
  createPtWorkspace,
  usePtHubWorkspaces,
} from "../../features/pt-hub/lib/pt-hub";
import { useWorkspace } from "../../lib/use-workspace";
import { getCharacterLimitState } from "../../lib/character-limits";
import { routes } from "../../lib/routes";
import type { PTWorkspaceSummary } from "../../features/pt-hub/types";

export function PtHubWorkspacesPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const { switchWorkspace, refreshWorkspace } = useWorkspace();
  const workspacesQuery = usePtHubWorkspaces();
  const acceptedWorkspaceId = searchParams.get("acceptedWorkspace");
  const [acceptedNotice, setAcceptedNotice] = useState(
    Boolean(acceptedWorkspaceId),
  );
  const [dialogOpen, setDialogOpen] = useState(false);
  const [workspaceName, setWorkspaceName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const workspaceNameLimitState = getCharacterLimitState({
    value: workspaceName,
    kind: "entity_name",
    fieldLabel: "Space name",
  });
  const hasOverLimitErrors = workspaceNameLimitState.overLimit;

  const openWorkspace = (workspace: PTWorkspaceSummary) => {
    switchWorkspace(workspace.id);
    navigate(routes.workspaceOverview(workspace.slug));
  };

  useEffect(() => {
    if (!acceptedWorkspaceId) return;
    setAcceptedNotice(true);
    const clearTimer = window.setTimeout(() => {
      setAcceptedNotice(false);
      const nextParams = new URLSearchParams(searchParams);
      nextParams.delete("acceptedWorkspace");
      setSearchParams(nextParams, { replace: true });
    }, 5000);
    return () => window.clearTimeout(clearTimer);
  }, [acceptedWorkspaceId, searchParams, setSearchParams]);

  const handleCreateWorkspace = async () => {
    if (hasOverLimitErrors) {
      setError(
        workspaceNameLimitState.errorText ??
          "Please fix over-limit fields before continuing.",
      );
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const workspaceId = await createPtWorkspace(workspaceName);
      await queryClient.invalidateQueries({
        queryKey: ["pt-hub-workspaces"],
      });
      refreshWorkspace();
      setWorkspaceName("");
      setDialogOpen(false);
      switchWorkspace(workspaceId);
    } catch (createError) {
      setError(
        createError instanceof Error
          ? createError.message
          : "Failed to create workspace.",
      );
    } finally {
      setSaving(false);
    }
  };

  const workspaces = workspacesQuery.data ?? [];

  return (
    <section className="pt-hub-page-stack">
      <PtHubPageHeader
        eyebrow="Coaching Spaces"
        title="Manage your coaching spaces"
        description="Open, create, and organize the spaces where you coach clients."
        className="justify-end"
        actions={
          <Button onClick={() => setDialogOpen(true)}>
            <Plus className="h-4 w-4" />
            Create Space
          </Button>
        }
      />

      {acceptedNotice ? (
        <Alert tone="success">
          <AlertTitle>Workspace added to your PT Hub</AlertTitle>
          <AlertDescription>
            The shared workspace is ready to open with your assigned role.
          </AlertDescription>
        </Alert>
      ) : null}

      {workspaces.length === 0 ? (
        <EmptyState
          title="No coaching spaces yet"
          description="Create your first coaching space, then open the coaching dashboard."
          actionLabel="Create space"
          onAction={() => setDialogOpen(true)}
          className="rounded-[28px] border-border/70 bg-card/70 p-8"
        />
      ) : (
        <div className="pt-hub-work-grid xl:grid-cols-2">
          {workspaces.map((workspace) => (
            <PtHubWorkspaceCard
              key={workspace.id}
              workspace={workspace}
              onOpen={openWorkspace}
              highlighted={workspace.id === acceptedWorkspaceId}
            />
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="w-[92vw] max-w-[460px]">
          <DialogHeader>
            <DialogTitle>Create coaching space</DialogTitle>
            <DialogDescription>
              This will create a new coaching space using the current workspace
              setup.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <label className="text-sm font-medium text-foreground">
              Space name
            </label>
            <Input
              isInvalid={workspaceNameLimitState.overLimit}
              value={workspaceName}
              onChange={(event) => setWorkspaceName(event.target.value)}
              placeholder="Velocity Performance"
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void handleCreateWorkspace();
                }
              }}
            />
            <FieldCharacterMeta
              count={workspaceNameLimitState.count}
              limit={workspaceNameLimitState.limit}
              errorText={workspaceNameLimitState.errorText}
            />
            {error ? <p className="text-xs text-danger">{error}</p> : null}
          </div>
          <DialogFooter className="flex-row justify-end gap-2">
            <Button
              variant="secondary"
              disabled={saving}
              onClick={() => setDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              disabled={saving || hasOverLimitErrors}
              onClick={handleCreateWorkspace}
            >
              {saving ? "Creating..." : "Create space"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

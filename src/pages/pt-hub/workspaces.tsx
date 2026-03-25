import { useState } from "react";
import { Plus } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
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
import { PtHubPageHeader } from "../../features/pt-hub/components/pt-hub-page-header";
import { PtHubWorkspaceCard } from "../../features/pt-hub/components/pt-hub-workspace-card";
import {
  createPtWorkspace,
  usePtHubWorkspaces,
} from "../../features/pt-hub/lib/pt-hub";
import { useWorkspace } from "../../lib/use-workspace";

export function PtHubWorkspacesPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { switchWorkspace, refreshWorkspace } = useWorkspace();
  const workspacesQuery = usePtHubWorkspaces();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [workspaceName, setWorkspaceName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const openWorkspace = (workspaceId: string) => {
    switchWorkspace(workspaceId);
    navigate("/pt/dashboard");
  };

  const handleCreateWorkspace = async () => {
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
    <section className="space-y-6">
      <PtHubPageHeader
        eyebrow="Workspace Portfolio"
        title="Manage workspace entry points"
        description="Workspaces stay dedicated to coaching operations. PT Hub lets you review and launch them from one business-level surface."
        actions={
          <Button onClick={() => setDialogOpen(true)}>
            <Plus className="h-4 w-4" />
            Create Workspace
          </Button>
        }
      />

      {workspaces.length === 0 ? (
        <EmptyState
          title="No workspaces owned yet"
          description="Phase 1 supports real workspace creation through the existing RPC. Create one here, then jump into the operational dashboard when you are ready."
          actionLabel="Create workspace"
          onAction={() => setDialogOpen(true)}
          className="rounded-[28px] border-border/70 bg-card/70 p-8"
        />
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {workspaces.map((workspace) => (
            <PtHubWorkspaceCard
              key={workspace.id}
              workspace={workspace}
              onOpen={openWorkspace}
            />
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="w-[92vw] max-w-[460px]">
          <DialogHeader>
            <DialogTitle>Create workspace</DialogTitle>
            <DialogDescription>
              This uses the existing <code>create_workspace</code> RPC and keeps
              the current workspace dashboard intact.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <label className="text-sm font-medium text-foreground">
              Workspace name
            </label>
            <Input
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
            <Button disabled={saving} onClick={handleCreateWorkspace}>
              {saving ? "Creating..." : "Create workspace"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

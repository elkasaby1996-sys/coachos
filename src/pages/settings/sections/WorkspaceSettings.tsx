import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { Skeleton } from "../../../components/ui/skeleton";
import { useWorkspace } from "../../../lib/use-workspace";
import { supabase } from "../../../lib/supabase";
import { refreshWorkspaceNameAcrossApp } from "../../../lib/workspace-query";
import {
  SettingsActions,
  SettingsBlock,
  SettingsPageShell,
  SettingsRow,
  SettingsToast,
} from "./shared";

export function WorkspaceSettings() {
  const queryClient = useQueryClient();
  const { workspaceId } = useWorkspace();
  const [workspaceName, setWorkspaceName] = useState("");
  const [logoFileName, setLogoFileName] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastVariant, setToastVariant] = useState<"success" | "error">(
    "success",
  );

  const workspaceQuery = useQuery({
    queryKey: ["settings-workspace", workspaceId],
    enabled: Boolean(workspaceId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workspaces")
        .select("id, name, logo_url")
        .eq("id", workspaceId ?? "")
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as {
        id: string;
        name: string | null;
        logo_url: string | null;
      } | null;
    },
  });

  useEffect(() => {
    if (!workspaceQuery.data) return;
    setWorkspaceName(workspaceQuery.data.name ?? "");
  }, [workspaceQuery.data]);

  useEffect(() => {
    if (!toastMessage) return;
    const timeout = window.setTimeout(() => setToastMessage(null), 2400);
    return () => window.clearTimeout(timeout);
  }, [toastMessage]);

  const initialName = workspaceQuery.data?.name ?? "";
  const trimmedName = workspaceName.trim();
  const hasNameChanged = trimmedName !== (initialName ?? "").trim();
  const canSave = hasNameChanged && trimmedName.length > 0 && !saving;

  const validationMessage = useMemo(() => {
    if (!hasNameChanged) return null;
    if (trimmedName.length === 0) return "Workspace name cannot be empty.";
    return null;
  }, [hasNameChanged, trimmedName.length]);

  const handleSaveWorkspace = async () => {
    if (!workspaceId || !canSave) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("workspaces")
        .update({ name: trimmedName })
        .eq("id", workspaceId);
      if (error) throw error;

      setToastVariant("success");
      setToastMessage("Workspace settings saved.");
<<<<<<< HEAD
      await refreshWorkspaceNameAcrossApp(queryClient, workspaceId, trimmedName);
=======
      await refreshWorkspaceNameAcrossApp(
        queryClient,
        workspaceId,
        trimmedName,
      );
>>>>>>> a132096567b6bde9f150454c1cd679050b0c9fc5
    } catch (error) {
      setToastVariant("error");
      setToastMessage(
        error instanceof Error ? error.message : "Unable to save workspace.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <SettingsToast message={toastMessage} variant={toastVariant} />
      <SettingsPageShell
        title="Workspace"
        description="Control workspace branding details clients see across CoachOS."
      >
        <SettingsBlock
          title="Branding"
          description="Workspace name and logo are used in client-facing touchpoints."
          noBorder
        >
          {workspaceQuery.isLoading ? (
            <div className="space-y-4">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : (
            <>
              <SettingsRow
                label="Workspace name"
                hint="Shown in navigation, invites, and shared client screens."
              >
                <Input
                  id="workspace-name"
                  data-testid="workspace-name-input"
                  value={workspaceName}
                  onChange={(event) => setWorkspaceName(event.target.value)}
                  placeholder="Enter workspace name"
                />
                {validationMessage ? (
                  <p className="text-xs text-danger">{validationMessage}</p>
                ) : null}
              </SettingsRow>

              <SettingsRow
                label="Workspace logo"
                hint="Logo upload endpoint can be connected later. Placeholder supports file selection preview now."
              >
                <div className="rounded-lg border border-dashed border-border bg-muted/30 p-4">
                  <p className="text-sm text-foreground">
                    {logoFileName
                      ? `Selected: ${logoFileName}`
                      : "No logo selected"}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Recommended: square image, minimum 256x256.
                  </p>
                  <div className="mt-3 flex items-center gap-2">
                    <label className="inline-flex">
                      <Input
                        type="file"
                        className="hidden"
                        accept="image/*"
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          setLogoFileName(file?.name ?? null);
                        }}
                      />
                      <Button asChild variant="secondary" size="sm">
                        <span>Choose logo</span>
                      </Button>
                    </label>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => setLogoFileName(null)}
                      disabled={!logoFileName}
                    >
                      Clear
                    </Button>
                  </div>
                </div>
              </SettingsRow>

              <SettingsActions>
                <Button
                  onClick={handleSaveWorkspace}
                  disabled={!canSave}
                  data-testid="save-workspace-button"
                >
                  {saving ? "Saving..." : "Save changes"}
                </Button>
              </SettingsActions>
            </>
          )}
        </SettingsBlock>
      </SettingsPageShell>
    </>
  );
}

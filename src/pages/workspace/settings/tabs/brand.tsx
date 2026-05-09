import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "../../../../components/ui/button";
import { Input } from "../../../../components/ui/input";
import {
  DisabledSettingField,
  SettingsFieldRow,
  SettingsHelperCallout,
  SettingsSectionCard,
  StickySaveBar,
} from "../../../../features/settings/components/settings-primitives";
import { useDirtyNavigationGuard } from "../../../../features/settings/hooks/use-dirty-navigation-guard";
import { supabase } from "../../../../lib/supabase";
import { useWorkspaceSettingsOutletContext } from "../outlet-context";

type BrandFormState = {
  logoUrl: string;
};

const emptyState: BrandFormState = {
  logoUrl: "",
};

export function WorkspaceSettingsBrandTab() {
  const queryClient = useQueryClient();
  const { workspace, workspaceId, canManage } =
    useWorkspaceSettingsOutletContext();
  const [form, setForm] = useState<BrandFormState>(emptyState);
  const [saving, setSaving] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);

  const initialState = useMemo(
    () =>
      ({
        logoUrl: workspace?.logo_url ?? "",
      }) satisfies BrandFormState,
    [workspace?.logo_url],
  );

  useEffect(() => {
    setForm(initialState);
  }, [initialState]);

  const isDirty = JSON.stringify(form) !== JSON.stringify(initialState);

  const saveBrand = async () => {
    if (!canManage || !workspaceId) return false;

    setSaving(true);
    setErrorText(null);
    try {
      const { error } = await supabase
        .from("workspaces")
        .update({
          logo_url: form.logoUrl.trim() || null,
        })
        .eq("id", workspaceId);
      if (error) throw error;

      await queryClient.invalidateQueries({
        queryKey: ["workspace-settings-shell", workspaceId],
      });
      return true;
    } catch (error) {
      setErrorText(
        error instanceof Error
          ? error.message
          : "Unable to save workspace brand settings.",
      );
      return false;
    } finally {
      setSaving(false);
    }
  };

  const discard = () => {
    setForm(initialState);
    setErrorText(null);
  };

  const { guardDialog } = useDirtyNavigationGuard({
    isDirty,
    onDiscard: discard,
    onSave: saveBrand,
  });

  return (
    <div className="space-y-4">
      {guardDialog}

      {errorText ? (
        <div className="rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
          {errorText}
        </div>
      ) : null}

      <SettingsSectionCard
        title="Workspace Brand"
        description="Client-facing brand details for this workspace."
      >
        <SettingsFieldRow
          label="Client-facing workspace name"
          hint="The canonical workspace name is managed in General."
        >
          <DisabledSettingField
            value={workspace?.name ?? "Unnamed workspace"}
          />
          <div>
            <Button asChild variant="secondary" size="sm">
              <Link to="../general">Edit in General</Link>
            </Button>
          </div>
        </SettingsFieldRow>

        <SettingsFieldRow
          label="Workspace logo"
          hint="Logo used by client-facing workspace surfaces where supported."
        >
          <Input
            value={form.logoUrl}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, logoUrl: event.target.value }))
            }
            disabled={!canManage}
            placeholder="https://example.com/workspace-logo.png"
          />
          {!canManage ? (
            <p className="text-xs text-muted-foreground">
              You do not have permission to edit workspace brand settings.
            </p>
          ) : null}
        </SettingsFieldRow>
      </SettingsSectionCard>

      <SettingsHelperCallout
        title="Public profile is separate"
        body="Public marketplace profile details are managed in PT Hub profile."
      />

      <div className="flex flex-wrap gap-2">
        <Button asChild variant="secondary" size="sm">
          <Link to="/pt-hub/profile">Open PT Hub Public Profile</Link>
        </Button>
      </div>

      <StickySaveBar
        isDirty={isDirty}
        isSaving={saving}
        onSave={saveBrand}
        onDiscard={discard}
      />
    </div>
  );
}

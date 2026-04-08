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
import { useWorkspaceSettingsOutletContext } from "../layout";

type BrandFormState = {
  logoUrl: string;
};

const emptyState: BrandFormState = {
  logoUrl: "",
};

export function WorkspaceSettingsBrandTab() {
  const queryClient = useQueryClient();
  const { workspace, workspaceId, canManage } = useWorkspaceSettingsOutletContext();
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
        title="Brand Basics"
        description="Client-facing workspace branding configuration."
      >
        <SettingsFieldRow
          label="Workspace logo URL"
          hint="Stored in workspaces.logo_url."
        >
          <Input
            value={form.logoUrl}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, logoUrl: event.target.value }))
            }
            disabled={!canManage}
            placeholder="https://..."
          />
          {!canManage ? (
            <p className="text-xs text-muted-foreground">
              You do not have permission to edit this workspace.
            </p>
          ) : null}
        </SettingsFieldRow>

        <SettingsFieldRow
          label="Workspace display name"
          hint="Managed in General tab through workspace name."
        >
          <DisabledSettingField value={workspace?.name ?? "Untitled workspace"} />
        </SettingsFieldRow>

        <SettingsFieldRow
          label="Support email"
          hint="No safe write path currently available."
        >
          <DisabledSettingField value="Not configurable yet" />
        </SettingsFieldRow>
        <SettingsFieldRow
          label="Support phone"
          hint="No safe write path currently available."
        >
          <DisabledSettingField value="Not configurable yet" />
        </SettingsFieldRow>
        <SettingsFieldRow
          label="Welcome copy / intro"
          hint="No safe write path currently available."
        >
          <DisabledSettingField value="Not configurable yet" />
        </SettingsFieldRow>
      </SettingsSectionCard>

      <SettingsSectionCard
        title="Cross-Scope Reference"
        description="Public marketplace profile does not belong to workspace settings."
      >
        <SettingsHelperCallout
          title="Public profile is managed in PT Hub"
          body="Manage marketplace/public coach profile content on the PT Hub Public Profile page."
        />
        <Button asChild variant="secondary" size="sm">
          <Link to="/pt-hub/profile">Open PT Hub Public Profile</Link>
        </Button>
      </SettingsSectionCard>

      <StickySaveBar
        isDirty={isDirty}
        isSaving={saving}
        onSave={saveBrand}
        onDiscard={discard}
      />
    </div>
  );
}

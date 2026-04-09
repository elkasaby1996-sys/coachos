import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { FieldCharacterMeta } from "../../../../components/common/field-character-meta";
import { Input } from "../../../../components/ui/input";
import {
  DisabledSettingField,
  SettingsFieldRow,
  SettingsHelperCallout,
  SettingsSectionCard,
  StickySaveBar,
} from "../../../../features/settings/components/settings-primitives";
import { useDirtyNavigationGuard } from "../../../../features/settings/hooks/use-dirty-navigation-guard";
import {
  getCharacterLimitState,
  hasCharacterLimitError,
} from "../../../../lib/character-limits";
import { supabase } from "../../../../lib/supabase";
import { refreshWorkspaceNameAcrossApp } from "../../../../lib/workspace-query";
import { useWorkspaceSettingsOutletContext } from "../layout";

type GeneralFormState = {
  workspaceName: string;
};

const emptyState: GeneralFormState = {
  workspaceName: "",
};

export function WorkspaceSettingsGeneralTab() {
  const queryClient = useQueryClient();
  const { workspace, workspaceId, canManage } = useWorkspaceSettingsOutletContext();
  const [form, setForm] = useState<GeneralFormState>(emptyState);
  const [saving, setSaving] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);

  const initialState = useMemo(
    () =>
      ({
        workspaceName: workspace?.name ?? "",
      }) satisfies GeneralFormState,
    [workspace?.name],
  );

  useEffect(() => {
    setForm(initialState);
  }, [initialState]);

  const isDirty = JSON.stringify(form) !== JSON.stringify(initialState);
  const workspaceNameLimitState = getCharacterLimitState({
    value: form.workspaceName,
    kind: "entity_name",
    fieldLabel: "Workspace name",
  });
  const hasOverLimitErrors = hasCharacterLimitError([workspaceNameLimitState]);

  const saveGeneral = async () => {
    if (!canManage || !workspaceId) return false;
    if (hasOverLimitErrors) return false;

    const nextName = form.workspaceName.trim();
    if (!nextName) {
      setErrorText("Workspace name cannot be empty.");
      return false;
    }

    setSaving(true);
    setErrorText(null);
    try {
      const { error } = await supabase
        .from("workspaces")
        .update({ name: nextName })
        .eq("id", workspaceId);
      if (error) throw error;

      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["workspace-settings-shell", workspaceId],
        }),
        queryClient.invalidateQueries({
          queryKey: ["settings-workspace", workspaceId],
        }),
      ]);
      await refreshWorkspaceNameAcrossApp(queryClient, workspaceId, nextName);
      return true;
    } catch (error) {
      setErrorText(
        error instanceof Error
          ? error.message
          : "Unable to save workspace general settings.",
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
    onSave: saveGeneral,
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
        title="General Workspace Details"
        description="Core workspace identity and operating metadata."
      >
        <SettingsFieldRow
          label="Workspace name"
          hint="Primary workspace name used across PT and client views."
        >
          <Input
            isInvalid={workspaceNameLimitState.overLimit}
            value={form.workspaceName}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, workspaceName: event.target.value }))
            }
            disabled={!canManage}
            placeholder="Workspace name"
          />
          <FieldCharacterMeta
            count={workspaceNameLimitState.count}
            limit={workspaceNameLimitState.limit}
            errorText={workspaceNameLimitState.errorText}
          />
          {!canManage ? (
            <p className="text-xs text-muted-foreground">
              You do not have permission to edit workspace settings.
            </p>
          ) : null}
        </SettingsFieldRow>

        <SettingsFieldRow
          label="Internal workspace code"
          hint="Read-only identifier for internal support and diagnostics."
        >
          <DisabledSettingField value={workspace?.id ?? workspaceId} />
        </SettingsFieldRow>

        <SettingsFieldRow
          label="Workspace timezone"
          hint="No safe write path currently available."
        >
          <DisabledSettingField value="Not configurable yet" />
        </SettingsFieldRow>

        <SettingsFieldRow
          label="Currency"
          hint="No safe write path currently available."
        >
          <DisabledSettingField value="Not configurable yet" />
        </SettingsFieldRow>

        <SettingsFieldRow
          label="Units"
          hint="No safe write path currently available."
        >
          <DisabledSettingField value="Not configurable yet" />
        </SettingsFieldRow>

        <SettingsFieldRow
          label="Week start day"
          hint="No safe write path currently available."
        >
          <DisabledSettingField value="Not configurable yet" />
        </SettingsFieldRow>
      </SettingsSectionCard>

      <SettingsSectionCard
        title="Ownership Metadata"
        description="Read-only ownership and audit metadata."
      >
        <SettingsFieldRow label="Workspace owner">
          <DisabledSettingField value={workspace?.owner_user_id ?? "Unknown"} />
        </SettingsFieldRow>
        <SettingsFieldRow label="Created at">
          <DisabledSettingField value={workspace?.created_at ?? "Unavailable"} />
        </SettingsFieldRow>
        <SettingsFieldRow label="Last updated">
          <DisabledSettingField value={workspace?.updated_at ?? "Unavailable"} />
        </SettingsFieldRow>
      </SettingsSectionCard>

      <SettingsHelperCallout
        title="Scope boundary"
        body="Account identity, security, and billing are managed in PT Hub settings."
      />

      <StickySaveBar
        isDirty={isDirty && !hasOverLimitErrors}
        isSaving={saving}
        onSave={saveGeneral}
        onDiscard={discard}
      />
    </div>
  );
}

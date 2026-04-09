import { useEffect, useMemo, useState } from "react";
import { usePtHubWorkspaces } from "../../../../features/pt-hub/lib/pt-hub";
import {
  DisabledSettingField,
  SettingsFieldRow,
  SettingsSectionCard,
  StickySaveBar,
} from "../../../../features/settings/components/settings-primitives";
import { useDirtyNavigationGuard } from "../../../../features/settings/hooks/use-dirty-navigation-guard";
import { useWorkspace } from "../../../../lib/use-workspace";

type PreferencesFormState = {
  defaultWorkspaceId: string;
};

export function PtHubSettingsPreferencesTab() {
  const { workspaceId, switchWorkspace } = useWorkspace();
  const workspacesQuery = usePtHubWorkspaces();
  const [form, setForm] = useState<PreferencesFormState>({
    defaultWorkspaceId: workspaceId ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);

  const availableWorkspaceId = useMemo(
    () => workspaceId ?? workspacesQuery.data?.[0]?.id ?? "",
    [workspaceId, workspacesQuery.data],
  );

  const initialState = useMemo(
    () =>
      ({
        defaultWorkspaceId: availableWorkspaceId,
      }) satisfies PreferencesFormState,
    [availableWorkspaceId],
  );

  useEffect(() => {
    setForm(initialState);
  }, [initialState]);

  const isDirty = JSON.stringify(form) !== JSON.stringify(initialState);

  const savePreferences = async () => {
    setSaving(true);
    setErrorText(null);
    try {
      if (
        form.defaultWorkspaceId &&
        form.defaultWorkspaceId !== workspaceId &&
        workspacesQuery.data?.some(
          (workspace) => workspace.id === form.defaultWorkspaceId,
        )
      ) {
        switchWorkspace(form.defaultWorkspaceId);
      }

      return true;
    } catch (error) {
      setErrorText(
        error instanceof Error ? error.message : "Unable to save preferences.",
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
    onSave: savePreferences,
  });

  return (
    <div className="space-y-4">
      {guardDialog}

      {errorText ? (
        <div className="rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
          {errorText}
        </div>
      ) : null}

      <SettingsSectionCard title="Workspace Preferences">
        <SettingsFieldRow label="Default workspace on login">
          <select
            className="h-10 w-full app-field px-3 text-sm"
            value={form.defaultWorkspaceId}
            onChange={(event) =>
              setForm((prev) => ({
                ...prev,
                defaultWorkspaceId: event.target.value,
              }))
            }
          >
            {workspacesQuery.data?.map((workspace) => (
              <option key={workspace.id} value={workspace.id}>
                {workspace.name}
              </option>
            ))}
          </select>
        </SettingsFieldRow>
      </SettingsSectionCard>

      <SettingsSectionCard title="Regional Preferences">
        <SettingsFieldRow label="Date format">
          <DisabledSettingField value="Not configurable yet" />
        </SettingsFieldRow>
        <SettingsFieldRow label="Week start day">
          <DisabledSettingField value="Not configurable yet" />
        </SettingsFieldRow>
        <SettingsFieldRow label="Units and preferences">
          <DisabledSettingField value="Not configurable yet" />
        </SettingsFieldRow>
      </SettingsSectionCard>

      <StickySaveBar
        isDirty={isDirty}
        isSaving={saving}
        onSave={savePreferences}
        onDiscard={discard}
      />
    </div>
  );
}

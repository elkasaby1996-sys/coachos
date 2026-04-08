import { useEffect, useMemo, useState } from "react";
import { useTheme } from "../../../../components/common/theme-provider";
import { Switch } from "../../../../components/ui/switch";
import { usePtHubWorkspaces } from "../../../../features/pt-hub/lib/pt-hub";
import {
  DisabledSettingField,
  SettingsFieldRow,
  SettingsHelperCallout,
  SettingsSectionCard,
  StickySaveBar,
} from "../../../../features/settings/components/settings-primitives";
import { useDirtyNavigationGuard } from "../../../../features/settings/hooks/use-dirty-navigation-guard";
import { useWorkspace } from "../../../../lib/use-workspace";
import type { ThemePreference } from "../../../../lib/theme";

type PreferencesFormState = {
  themePreference: ThemePreference;
  compactDensity: boolean;
  defaultWorkspaceId: string;
};

export function PtHubSettingsPreferencesTab() {
  const { updateAppearance, themePreference, compactDensity } = useTheme();
  const { workspaceId, switchWorkspace } = useWorkspace();
  const workspacesQuery = usePtHubWorkspaces();
  const [form, setForm] = useState<PreferencesFormState>({
    themePreference,
    compactDensity,
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
        themePreference,
        compactDensity,
        defaultWorkspaceId: availableWorkspaceId,
      }) satisfies PreferencesFormState,
    [availableWorkspaceId, compactDensity, themePreference],
  );

  useEffect(() => {
    setForm(initialState);
  }, [initialState]);

  const isDirty = JSON.stringify(form) !== JSON.stringify(initialState);

  const savePreferences = async () => {
    setSaving(true);
    setErrorText(null);
    try {
      await updateAppearance({
        themePreference: form.themePreference,
        compactDensity: form.compactDensity,
        persist: true,
      });

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

      <SettingsSectionCard
        title="Appearance Preferences"
        description="Theme and density preferences for your PT Hub experience."
      >
        <SettingsFieldRow
          label="Theme"
          hint="Set your default visual mode preference."
        >
          <div className="inline-flex items-center rounded-xl border border-border/70 bg-card/45 p-1">
            {(["dark", "light", "system"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                className={`rounded-lg px-3 py-1.5 text-sm transition ${
                  form.themePreference === mode
                    ? "bg-secondary text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                onClick={() =>
                  setForm((prev) => ({ ...prev, themePreference: mode }))
                }
              >
                {mode.charAt(0).toUpperCase() + mode.slice(1)}
              </button>
            ))}
          </div>
        </SettingsFieldRow>

        <SettingsFieldRow
          label="Compact density"
          hint="Reduce UI spacing for denser data views."
        >
          <div className="flex items-center justify-between rounded-xl border border-border/70 bg-card/40 px-4 py-3">
            <p className="text-sm text-muted-foreground">
              Toggle compact spacing across the app.
            </p>
            <Switch
              checked={form.compactDensity}
              onCheckedChange={(value) =>
                setForm((prev) => ({ ...prev, compactDensity: value }))
              }
            />
          </div>
        </SettingsFieldRow>

        <SettingsFieldRow
          label="Default workspace on login"
          hint="Used as your default coaching space."
        >
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

      <SettingsSectionCard
        title="Regional Preferences"
        description="These fields are visible for future support and currently read-only."
      >
        <SettingsFieldRow label="Date format" hint="Backend support pending.">
          <DisabledSettingField value="Not configurable yet" />
        </SettingsFieldRow>
        <SettingsFieldRow label="Week start day" hint="Backend support pending.">
          <DisabledSettingField value="Not configurable yet" />
        </SettingsFieldRow>
        <SettingsFieldRow
          label="Units and preferences"
          hint="Backend support pending."
        >
          <DisabledSettingField value="Not configurable yet" />
        </SettingsFieldRow>
      </SettingsSectionCard>

      <SettingsHelperCallout
        title="Workspace-level defaults are managed per workspace"
        body="Template defaults and workspace operations belong in Workspace Settings."
      />

      <StickySaveBar
        isDirty={isDirty}
        isSaving={saving}
        onSave={savePreferences}
        onDiscard={discard}
      />
    </div>
  );
}

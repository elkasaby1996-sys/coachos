import { useEffect, useMemo, useState } from "react";
import { usePtHubWorkspaces } from "../../../../features/pt-hub/lib/pt-hub";
import {
  SettingsFieldRow,
  SettingsSectionCard,
  StickySaveBar,
} from "../../../../features/settings/components/settings-primitives";
import { useDirtyNavigationGuard } from "../../../../features/settings/hooks/use-dirty-navigation-guard";
import { Select } from "../../../../components/ui/select";
import {
  DATE_FORMAT_OPTIONS,
  LANGUAGE_OPTIONS,
  REGION_OPTIONS,
  UNIT_PREFERENCE_OPTIONS,
  WEEK_START_OPTIONS,
  readPtHubRegionalPreferences,
  writePtHubRegionalPreferences,
  type PtHubDateFormat,
  type PtHubLanguage,
  type PtHubRegion,
  type PtHubUnitPreference,
  type PtHubWeekStartDay,
} from "../../../../features/pt-hub/lib/pt-hub-preferences";
import { useI18n } from "../../../../lib/i18n";
import { useWorkspace } from "../../../../lib/use-workspace";

type PreferencesFormState = {
  defaultWorkspaceId: string;
  dateFormat: PtHubDateFormat;
  language: PtHubLanguage;
  region: PtHubRegion;
  unitPreference: PtHubUnitPreference;
  weekStartDay: PtHubWeekStartDay;
};

export function PtHubSettingsPreferencesTab() {
  const { t } = useI18n();
  const { workspaceId, switchWorkspace } = useWorkspace();
  const workspacesQuery = usePtHubWorkspaces();
  const [form, setForm] = useState<PreferencesFormState>({
    defaultWorkspaceId: workspaceId ?? "",
    dateFormat: DATE_FORMAT_OPTIONS[0].value,
    language: LANGUAGE_OPTIONS[0].value,
    region: REGION_OPTIONS[0].value,
    weekStartDay: WEEK_START_OPTIONS[1].value,
    unitPreference: UNIT_PREFERENCE_OPTIONS[0].value,
  });
  const [saving, setSaving] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);

  const availableWorkspaceId = useMemo(
    () => workspaceId ?? workspacesQuery.data?.[0]?.id ?? "",
    [workspaceId, workspacesQuery.data],
  );

  const initialState = useMemo(
    () => ({
      defaultWorkspaceId: availableWorkspaceId,
      ...readPtHubRegionalPreferences(),
    }),
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

      writePtHubRegionalPreferences({
        dateFormat: form.dateFormat,
        language: form.language,
        region: form.region,
        unitPreference: form.unitPreference,
        weekStartDay: form.weekStartDay,
      });

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
        title={t(
          "settings.preferences.workspaceTitle",
          "Workspace Preferences",
        )}
      >
        <SettingsFieldRow
          label={t(
            "settings.preferences.defaultWorkspace",
            "Default workspace on login",
          )}
        >
          <select
            className="app-field flex min-h-[2.75rem] w-full px-3.5 py-2 text-sm"
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
        title={t("settings.preferences.regionalTitle", "Regional Preferences")}
      >
        <SettingsFieldRow label={t("i18n.language", "Language")}>
          <Select
            value={form.language}
            onChange={(event) =>
              setForm((prev) => ({
                ...prev,
                language: event.target
                  .value as PreferencesFormState["language"],
              }))
            }
          >
            {LANGUAGE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {t(`i18n.language.${option.value}`, option.label)}
              </option>
            ))}
          </Select>
        </SettingsFieldRow>
        <SettingsFieldRow label={t("i18n.region", "Region")}>
          <Select
            value={form.region}
            onChange={(event) =>
              setForm((prev) => ({
                ...prev,
                region: event.target.value as PreferencesFormState["region"],
              }))
            }
          >
            {REGION_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {t(`i18n.region.${option.value}`, option.label)}
              </option>
            ))}
          </Select>
        </SettingsFieldRow>
        <SettingsFieldRow
          label={t("settings.preferences.dateFormat", "Date format")}
        >
          <Select
            value={form.dateFormat}
            onChange={(event) =>
              setForm((prev) => ({
                ...prev,
                dateFormat: event.target
                  .value as PreferencesFormState["dateFormat"],
              }))
            }
          >
            {DATE_FORMAT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </SettingsFieldRow>
        <SettingsFieldRow
          label={t("settings.preferences.weekStartDay", "Week start day")}
        >
          <Select
            value={form.weekStartDay}
            onChange={(event) =>
              setForm((prev) => ({
                ...prev,
                weekStartDay: event.target
                  .value as PreferencesFormState["weekStartDay"],
              }))
            }
          >
            {WEEK_START_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </SettingsFieldRow>
        <SettingsFieldRow
          label={t("settings.preferences.units", "Units and preferences")}
        >
          <Select
            value={form.unitPreference}
            onChange={(event) =>
              setForm((prev) => ({
                ...prev,
                unitPreference: event.target
                  .value as PreferencesFormState["unitPreference"],
              }))
            }
          >
            {UNIT_PREFERENCE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
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

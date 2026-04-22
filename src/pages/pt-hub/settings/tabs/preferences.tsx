import { useEffect, useMemo, useState } from "react";
import { usePtHubWorkspaces } from "../../../../features/pt-hub/lib/pt-hub";
import {
  SettingsFieldRow,
  SettingsSectionCard,
  StickySaveBar,
} from "../../../../features/settings/components/settings-primitives";
import { useDirtyNavigationGuard } from "../../../../features/settings/hooks/use-dirty-navigation-guard";
import { Select } from "../../../../components/ui/select";
import { useWorkspace } from "../../../../lib/use-workspace";

const PT_HUB_DATE_FORMAT_STORAGE_KEY = "coachos-pt-hub-date-format";
const PT_HUB_WEEK_START_STORAGE_KEY = "coachos-pt-hub-week-start-day";
const PT_HUB_UNITS_STORAGE_KEY = "coachos-pt-hub-units";

const DATE_FORMAT_OPTIONS = [
  { value: "dd-mm-yyyy", label: "DD/MM/YYYY" },
  { value: "mm-dd-yyyy", label: "MM/DD/YYYY" },
  { value: "yyyy-mm-dd", label: "YYYY-MM-DD" },
] as const;

const WEEK_START_OPTIONS = [
  { value: "sunday", label: "Sunday" },
  { value: "monday", label: "Monday" },
  { value: "saturday", label: "Saturday" },
] as const;

const UNIT_PREFERENCE_OPTIONS = [
  { value: "metric", label: "Metric" },
  { value: "imperial", label: "Imperial" },
] as const;

function readStoredPreference<TValue extends string>(
  key: string,
  options: ReadonlyArray<{ value: TValue }>,
  fallback: TValue,
) {
  if (typeof window === "undefined") return fallback;
  const stored = window.localStorage.getItem(key);
  return options.some((option) => option.value === stored)
    ? (stored as TValue)
    : fallback;
}

type PreferencesFormState = {
  defaultWorkspaceId: string;
  dateFormat: (typeof DATE_FORMAT_OPTIONS)[number]["value"];
  weekStartDay: (typeof WEEK_START_OPTIONS)[number]["value"];
  unitPreference: (typeof UNIT_PREFERENCE_OPTIONS)[number]["value"];
};

export function PtHubSettingsPreferencesTab() {
  const { workspaceId, switchWorkspace } = useWorkspace();
  const workspacesQuery = usePtHubWorkspaces();
  const [form, setForm] = useState<PreferencesFormState>({
    defaultWorkspaceId: workspaceId ?? "",
    dateFormat: DATE_FORMAT_OPTIONS[0].value,
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
    () =>
      ({
        defaultWorkspaceId: availableWorkspaceId,
        dateFormat: readStoredPreference(
          PT_HUB_DATE_FORMAT_STORAGE_KEY,
          DATE_FORMAT_OPTIONS,
          DATE_FORMAT_OPTIONS[0].value,
        ),
        weekStartDay: readStoredPreference(
          PT_HUB_WEEK_START_STORAGE_KEY,
          WEEK_START_OPTIONS,
          WEEK_START_OPTIONS[1].value,
        ),
        unitPreference: readStoredPreference(
          PT_HUB_UNITS_STORAGE_KEY,
          UNIT_PREFERENCE_OPTIONS,
          UNIT_PREFERENCE_OPTIONS[0].value,
        ),
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

      if (typeof window !== "undefined") {
        window.localStorage.setItem(
          PT_HUB_DATE_FORMAT_STORAGE_KEY,
          form.dateFormat,
        );
        window.localStorage.setItem(
          PT_HUB_WEEK_START_STORAGE_KEY,
          form.weekStartDay,
        );
        window.localStorage.setItem(
          PT_HUB_UNITS_STORAGE_KEY,
          form.unitPreference,
        );
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
          <Select
            value={form.dateFormat}
            onChange={(event) =>
              setForm((prev) => ({
                ...prev,
                dateFormat: event.target.value as PreferencesFormState["dateFormat"],
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
        <SettingsFieldRow label="Week start day">
          <Select
            value={form.weekStartDay}
            onChange={(event) =>
              setForm((prev) => ({
                ...prev,
                weekStartDay:
                  event.target.value as PreferencesFormState["weekStartDay"],
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
        <SettingsFieldRow label="Units and preferences">
          <Select
            value={form.unitPreference}
            onChange={(event) =>
              setForm((prev) => ({
                ...prev,
                unitPreference:
                  event.target.value as PreferencesFormState["unitPreference"],
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

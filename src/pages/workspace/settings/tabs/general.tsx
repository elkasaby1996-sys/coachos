import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { FieldCharacterMeta } from "../../../../components/common/field-character-meta";
import { Input } from "../../../../components/ui/input";
import { Select } from "../../../../components/ui/select";
import {
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
import { useWorkspaceSettingsOutletContext } from "../outlet-context";

type GeneralFormState = {
  workspaceName: string;
  timezone: string;
  unitPreference: string;
  weekStartDay: string;
};

const emptyState: GeneralFormState = {
  workspaceName: "",
  timezone: "UTC",
  unitPreference: "metric",
  weekStartDay: "monday",
};

const timezoneOptions = [
  { value: "UTC", label: "UTC" },
  { value: "Asia/Riyadh", label: "Riyadh (GMT+3)" },
  { value: "Asia/Dubai", label: "Dubai (GMT+4)" },
  { value: "Europe/London", label: "London" },
  { value: "Europe/Paris", label: "Paris" },
  { value: "America/New_York", label: "New York" },
  { value: "America/Chicago", label: "Chicago" },
  { value: "America/Los_Angeles", label: "Los Angeles" },
  { value: "Australia/Sydney", label: "Sydney" },
];

const unitOptions = [
  { value: "metric", label: "Metric (kg, cm)" },
  { value: "imperial", label: "Imperial (lb, in)" },
];

const weekStartOptions = [
  { value: "monday", label: "Monday" },
  { value: "sunday", label: "Sunday" },
];

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
        timezone: workspace?.timezone ?? emptyState.timezone,
        unitPreference:
          workspace?.unit_preference ?? emptyState.unitPreference,
        weekStartDay: workspace?.week_start_day ?? emptyState.weekStartDay,
      }) satisfies GeneralFormState,
    [
      workspace?.name,
      workspace?.timezone,
      workspace?.unit_preference,
      workspace?.week_start_day,
    ],
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
        .update({
          name: nextName,
          timezone: form.timezone,
          unit_preference: form.unitPreference,
          week_start_day: form.weekStartDay,
        })
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
        description="Core workspace identity and operating defaults."
      >
        <SettingsFieldRow
          label="Workspace display name"
          hint="Primary workspace name shown across PT and client views."
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
          <Input
            readOnly
            disabled
            value={workspace?.id ?? workspaceId}
            className="cursor-not-allowed opacity-70"
          />
        </SettingsFieldRow>

        <SettingsFieldRow
          label="Workspace timezone"
          hint="Used for scheduling, reminders, and workspace reporting."
        >
          <Select
            aria-label="Workspace timezone"
            value={form.timezone}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, timezone: event.target.value }))
            }
            disabled={!canManage}
            className="min-h-[2.75rem] w-full"
          >
            {timezoneOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </SettingsFieldRow>

        <SettingsFieldRow
          label="Units"
          hint="Default measurement system for workout and body metrics."
        >
          <Select
            aria-label="Units"
            value={form.unitPreference}
            onChange={(event) =>
              setForm((prev) => ({
                ...prev,
                unitPreference: event.target.value,
              }))
            }
            disabled={!canManage}
            className="min-h-[2.75rem] w-full"
          >
            {unitOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </SettingsFieldRow>

        <SettingsFieldRow
          label="Week start day"
          hint="Controls calendar grids and weekly planning defaults."
        >
          <Select
            aria-label="Week start day"
            value={form.weekStartDay}
            onChange={(event) =>
              setForm((prev) => ({
                ...prev,
                weekStartDay: event.target.value,
              }))
            }
            disabled={!canManage}
            className="min-h-[2.75rem] w-full"
          >
            {weekStartOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
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

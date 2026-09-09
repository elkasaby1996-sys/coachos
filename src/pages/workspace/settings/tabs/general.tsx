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
import { NotificationToast } from "../../../../components/common/notification-toast";
import { Button } from "../../../../components/ui/button";
import {
  WorkspaceLogo,
  WorkspaceLogoPicker,
} from "../../../../features/workspace-branding/components";
import {
  getWorkspaceBrandingStyle,
  isAccentColor,
  isLogoUrl,
} from "../../../../features/workspace-branding/branding";
import { useTheme } from "../../../../components/common/theme-provider";

type GeneralFormState = {
  workspaceName: string;
  logoUrl: string;
  accentColor: string;
  timezone: string;
  unitPreference: string;
  weekStartDay: string;
};

const emptyState: GeneralFormState = {
  workspaceName: "",
  logoUrl: "",
  accentColor: "",
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
  const { workspace, workspaceId, canManage } =
    useWorkspaceSettingsOutletContext();
  const [form, setForm] = useState<GeneralFormState>(emptyState);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const { resolvedTheme } = useTheme();
  const [errorText, setErrorText] = useState<string | null>(null);

  const initialState = useMemo(
    () =>
      ({
        workspaceName: workspace?.name ?? "",
        logoUrl: workspace?.logo_url ?? "",
        accentColor: workspace?.accent_color ?? "",
        timezone: workspace?.timezone ?? emptyState.timezone,
        unitPreference: workspace?.unit_preference ?? emptyState.unitPreference,
        weekStartDay: workspace?.week_start_day ?? emptyState.weekStartDay,
      }) satisfies GeneralFormState,
    [
      workspace?.logo_url,
      workspace?.accent_color,
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
    if (uploading) return false;
    if (hasOverLimitErrors) return false;
    if (!isLogoUrl(form.logoUrl)) {
      setErrorText("Please upload a valid workspace logo.");
      return false;
    }
    if (form.accentColor && !isAccentColor(form.accentColor)) {
      setErrorText("Use a six-digit hex colour, such as #007F86.");
      return false;
    }

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
          logo_url: form.logoUrl.trim() || null,
          accent_color: form.accentColor || null,
          timezone: form.timezone,
          unit_preference: form.unitPreference,
          week_start_day: form.weekStartDay,
        })
        .eq("id", workspaceId)
        .select("id")
        .single();
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
      await queryClient.invalidateQueries({
        queryKey: ["workspace-branding", workspaceId],
      });
      setForm((current) => ({
        ...current,
        workspaceName: nextName,
        logoUrl: current.logoUrl.trim(),
      }));
      setMessage("Workspace branding and general settings saved.");
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
      <NotificationToast message={message} onDismiss={() => setMessage(null)} />

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
              setForm((prev) => ({
                ...prev,
                workspaceName: event.target.value,
              }))
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
          label="Workspace logo"
          hint="Shown in your workspace header, client portal, and invitations."
        >
          <WorkspaceLogoPicker
            workspaceId={workspaceId}
            value={form.logoUrl}
            onChange={(logoUrl) => setForm((prev) => ({ ...prev, logoUrl }))}
            disabled={!canManage || saving}
            onBusyChange={setUploading}
          />
        </SettingsFieldRow>

        <SettingsFieldRow
          label="Accent colour"
          hint="Personalise buttons, links, and highlights. Shades adjust for readable contrast in light and dark mode."
        >
          <div className="flex flex-wrap items-center gap-3">
            <input
              type="color"
              aria-label="Choose accent colour"
              value={
                isAccentColor(form.accentColor) ? form.accentColor : "#007F86"
              }
              disabled={!canManage || saving}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  accentColor: event.target.value,
                }))
              }
              className="h-11 w-14 cursor-pointer rounded-lg border border-border bg-background p-1"
            />
            <Input
              aria-label="Accent colour hex"
              value={form.accentColor}
              placeholder="Default accent"
              maxLength={7}
              disabled={!canManage || saving}
              className="w-40"
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  accentColor: event.target.value,
                }))
              }
            />
            <Button
              variant="secondary"
              disabled={!canManage || saving || !form.accentColor}
              onClick={() => setForm((prev) => ({ ...prev, accentColor: "" }))}
            >
              Use default
            </Button>
          </div>
          {form.accentColor && !isAccentColor(form.accentColor) ? (
            <p role="alert" className="text-xs text-danger">
              Enter a six-digit hex colour, such as #007F86.
            </p>
          ) : null}
        </SettingsFieldRow>

        <SettingsFieldRow
          label="Brand preview"
          hint="Preview your logo and accent before saving."
        >
          <div
            className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border bg-background p-4"
            style={getWorkspaceBrandingStyle(
              form.accentColor,
              resolvedTheme === "dark",
            )}
          >
            <div className="flex min-w-0 items-center gap-3">
              <WorkspaceLogo
                name={form.workspaceName || "Workspace"}
                url={form.logoUrl}
              />
              <span className="truncate font-semibold">
                {form.workspaceName || "Your workspace"}
              </span>
            </div>
            <span className="rounded-lg bg-[var(--ui-action)] px-4 py-2 text-sm font-medium text-[var(--ui-action-text)]">
              View your plan
            </span>
          </div>
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
        isSaving={saving || uploading}
        onSave={saveGeneral}
        onDiscard={discard}
      />
    </div>
  );
}

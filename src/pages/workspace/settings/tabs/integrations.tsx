import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Activity, Save } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "../../../../components/ui/alert";
import { Badge } from "../../../../components/ui/badge";
import { Button } from "../../../../components/ui/button";
import { Input } from "../../../../components/ui/input";
import { Select } from "../../../../components/ui/select";
import { Switch } from "../../../../components/ui/switch";
import {
  DisabledSettingField,
  SettingsFieldRow,
  SettingsHelperCallout,
  SettingsSectionCard,
  StickySaveBar,
} from "../../../../features/settings/components/settings-primitives";
import { supabase } from "../../../../lib/supabase";
import { useWorkspaceSettingsOutletContext } from "../outlet-context";
import type {
  PtWearableVisibilityMode,
  WearableMetricGroup,
  WorkspaceWearableSettings,
} from "../../../../features/wearables/types";

const providers = ["garmin", "whoop"];
const metricGroups: Array<{ value: WearableMetricGroup; label: string }> = [
  { value: "sleep", label: "Sleep" },
  { value: "recovery", label: "Recovery" },
  { value: "load_strain", label: "Load / strain" },
  { value: "activity", label: "Activity" },
  { value: "workouts", label: "Workouts" },
  { value: "body_metrics", label: "Body metrics" },
];

const defaultForm = {
  enabled: false,
  allowedProviders: ["garmin", "whoop"],
  enabledMetricGroups: metricGroups.map((group) => group.value),
  ptVisibilityMode: "summary_only" as PtWearableVisibilityMode,
  clientCanDisconnect: true,
  dataRetentionMode: "retain_on_disconnect",
  freshnessThresholdHours: "24",
  clientConsentCopy:
    "I consent to share wearable health and activity data with my coaching workspace for coaching context. Wearable data does not complete habits automatically.",
};

function toForm(settings: WorkspaceWearableSettings | null) {
  if (!settings) return defaultForm;
  return {
    enabled: settings.enabled,
    allowedProviders: settings.allowed_providers?.length
      ? settings.allowed_providers
      : defaultForm.allowedProviders,
    enabledMetricGroups: settings.enabled_metric_groups?.length
      ? settings.enabled_metric_groups
      : defaultForm.enabledMetricGroups,
    ptVisibilityMode: settings.pt_visibility_mode,
    clientCanDisconnect: settings.client_can_disconnect,
    dataRetentionMode: settings.data_retention_mode,
    freshnessThresholdHours: String(settings.freshness_threshold_hours ?? 24),
    clientConsentCopy:
      settings.client_consent_copy ?? defaultForm.clientConsentCopy,
  };
}

export function WorkspaceSettingsIntegrationsTab() {
  const { workspaceId, canManage } = useWorkspaceSettingsOutletContext();
  const [form, setForm] = useState(defaultForm);
  const [savedForm, setSavedForm] = useState(defaultForm);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const settingsQuery = useQuery({
    queryKey: ["workspace-wearable-settings", workspaceId],
    enabled: !!workspaceId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workspace_wearable_settings")
        .select("*")
        .eq("workspace_id", workspaceId)
        .maybeSingle();
      if (error) throw error;
      const nextForm = toForm((data ?? null) as WorkspaceWearableSettings | null);
      setForm(nextForm);
      setSavedForm(nextForm);
      return (data ?? null) as WorkspaceWearableSettings | null;
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const threshold = Number(form.freshnessThresholdHours);
      const payload = {
        workspace_id: workspaceId,
        enabled: form.enabled,
        allowed_providers: form.allowedProviders,
        enabled_metric_groups: form.enabledMetricGroups,
        pt_visibility_mode: form.ptVisibilityMode,
        client_can_disconnect: form.clientCanDisconnect,
        data_retention_mode: form.dataRetentionMode,
        freshness_threshold_hours:
          Number.isFinite(threshold) && threshold > 0 ? Math.round(threshold) : 24,
        client_consent_copy: form.clientConsentCopy.trim(),
        updated_at: new Date().toISOString(),
      };
      const { error } = await supabase
        .from("workspace_wearable_settings")
        .upsert(payload, { onConflict: "workspace_id" });
      if (error) throw error;
    },
    onSuccess: async () => {
      setSavedForm(form);
      setSaveMessage("Wearable settings saved.");
      await settingsQuery.refetch();
    },
  });

  const isDirty = useMemo(
    () => JSON.stringify(form) !== JSON.stringify(savedForm),
    [form, savedForm],
  );
  const toggleProvider = (provider: string) => {
    setForm((prev) => ({
      ...prev,
      allowedProviders: prev.allowedProviders.includes(provider)
        ? prev.allowedProviders.filter((item) => item !== provider)
        : [...prev.allowedProviders, provider],
    }));
  };
  const toggleMetricGroup = (group: WearableMetricGroup) => {
    setForm((prev) => ({
      ...prev,
      enabledMetricGroups: prev.enabledMetricGroups.includes(group)
        ? prev.enabledMetricGroups.filter((item) => item !== group)
        : [...prev.enabledMetricGroups, group],
    }));
  };
  const disabled = !canManage || settingsQuery.isLoading || saveMutation.isPending;

  return (
    <div className="space-y-4">
      <SettingsSectionCard
        title="Wearables"
        description="Open Wearables connection and metric visibility controls."
        action={<Badge variant={form.enabled ? "success" : "muted"}>{form.enabled ? "Enabled" : "Disabled"}</Badge>}
      >
        {settingsQuery.error ? (
          <Alert className="border-danger/30">
            <AlertTitle>Unable to load wearable settings</AlertTitle>
            <AlertDescription>
              {settingsQuery.error instanceof Error
                ? settingsQuery.error.message
                : "Request failed."}
            </AlertDescription>
          </Alert>
        ) : null}

        {saveMutation.error ? (
          <Alert className="border-danger/30">
            <AlertTitle>Unable to save wearable settings</AlertTitle>
            <AlertDescription>
              {saveMutation.error instanceof Error
                ? saveMutation.error.message
                : "Request failed."}
            </AlertDescription>
          </Alert>
        ) : null}

        {saveMessage ? (
          <Alert tone="success">
            <AlertTitle>Saved</AlertTitle>
            <AlertDescription>{saveMessage}</AlertDescription>
          </Alert>
        ) : null}

        <SettingsFieldRow label="Enable Wearables" hint="Controls the client Wearables module.">
          <div className="flex items-center gap-3">
            <Switch
              checked={form.enabled}
              disabled={disabled}
              onCheckedChange={(checked) =>
                setForm((prev) => ({ ...prev, enabled: checked }))
              }
            />
            <p className="text-sm text-muted-foreground">
              Open Wearables remains the provider OAuth and sync service.
            </p>
          </div>
        </SettingsFieldRow>

        <SettingsFieldRow label="Provider allowlist" hint="Available connection providers.">
          <div className="flex flex-wrap gap-2">
            {providers.map((provider) => (
              <Button
                key={provider}
                type="button"
                size="sm"
                variant={form.allowedProviders.includes(provider) ? "default" : "secondary"}
                disabled={disabled}
                onClick={() => toggleProvider(provider)}
              >
                {provider.toUpperCase()}
              </Button>
            ))}
          </div>
        </SettingsFieldRow>

        <SettingsFieldRow label="Metric groups" hint="Controls which health data groups are enabled.">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {metricGroups.map((group) => (
              <button
                key={group.value}
                type="button"
                disabled={disabled}
                onClick={() => toggleMetricGroup(group.value)}
                className={`rounded-lg border px-3 py-2 text-left text-sm transition ${
                  form.enabledMetricGroups.includes(group.value)
                    ? "border-primary/50 bg-primary/10 text-foreground"
                    : "border-border/70 bg-card/45 text-muted-foreground hover:text-foreground"
                } disabled:cursor-not-allowed disabled:opacity-60`}
              >
                <Activity className="mb-2 h-4 w-4 text-primary" />
                {group.label}
              </button>
            ))}
          </div>
        </SettingsFieldRow>

        <SettingsFieldRow label="PT visibility" hint="Controls what coaches can see in Client Details.">
          <Select
            value={form.ptVisibilityMode}
            disabled={disabled}
            onChange={(event) =>
              setForm((prev) => ({
                ...prev,
                ptVisibilityMode: event.target.value as PtWearableVisibilityMode,
              }))
            }
          >
            <option value="hidden">Hidden</option>
            <option value="summary_only">Summary only</option>
            <option value="full_metrics">Full metrics</option>
          </Select>
        </SettingsFieldRow>

        <SettingsFieldRow label="Freshness threshold" hint="Hours before data is shown as stale.">
          <Input
            type="number"
            min="1"
            max="720"
            value={form.freshnessThresholdHours}
            disabled={disabled}
            onChange={(event) =>
              setForm((prev) => ({
                ...prev,
                freshnessThresholdHours: event.target.value,
              }))
            }
          />
        </SettingsFieldRow>

        <SettingsFieldRow label="Disconnect behavior" hint="Client-side disconnect and retention policy.">
          <div className="grid gap-3 md:grid-cols-2">
            <label className="flex items-center gap-3 rounded-lg border border-border/70 bg-card/45 px-3 py-2">
              <Switch
                checked={form.clientCanDisconnect}
                disabled={disabled}
                onCheckedChange={(checked) =>
                  setForm((prev) => ({
                    ...prev,
                    clientCanDisconnect: checked,
                  }))
                }
              />
              <span className="text-sm">Clients can disconnect</span>
            </label>
            <Select
              value={form.dataRetentionMode}
              disabled={disabled}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  dataRetentionMode: event.target.value,
                }))
              }
            >
              <option value="retain_on_disconnect">Retain on disconnect</option>
              <option value="delete_on_disconnect">Delete on disconnect</option>
            </Select>
          </div>
        </SettingsFieldRow>

        <SettingsFieldRow label="Client consent copy" hint="Shown before the connect action.">
          <textarea
            className="min-h-[104px] w-full rounded-lg border border-border/70 bg-background/70 px-3 py-2 text-sm text-foreground shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            value={form.clientConsentCopy}
            disabled={disabled}
            onChange={(event) =>
              setForm((prev) => ({
                ...prev,
                clientConsentCopy: event.target.value,
              }))
            }
          />
        </SettingsFieldRow>

        {!canManage ? (
          <Alert className="border-warning/30">
            <AlertTitle>Read-only</AlertTitle>
            <AlertDescription>
              Your workspace role can view this configuration but cannot change it.
            </AlertDescription>
          </Alert>
        ) : null}
      </SettingsSectionCard>

      <SettingsSectionCard
        title="Other Workspace Integrations"
        description="Reserved slots for future workspace integrations."
      >
        <SettingsFieldRow label="Calendar sync" hint="No safe write path currently available.">
          <DisabledSettingField value="Not connected" />
        </SettingsFieldRow>
        <SettingsFieldRow label="Messaging integration" hint="No safe write path currently available.">
          <DisabledSettingField value="Not connected" />
        </SettingsFieldRow>
        <SettingsFieldRow label="CRM sync" hint="Future integration slot.">
          <DisabledSettingField value="Coming soon" />
        </SettingsFieldRow>
      </SettingsSectionCard>

      <SettingsHelperCallout
        title="Habit separation"
        body="Wearable metrics are read-only coaching data and do not create or complete habit logs."
      />

      <StickySaveBar
        isDirty={isDirty}
        isSaving={saveMutation.isPending}
        onSave={() => saveMutation.mutate()}
        onDiscard={() => setForm(savedForm)}
        statusText="Unsaved wearable integration changes."
      />
    </div>
  );
}

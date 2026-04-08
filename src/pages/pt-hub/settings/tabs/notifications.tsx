import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Switch } from "../../../../components/ui/switch";
import { useSessionAuth } from "../../../../lib/auth";
import {
  savePtHubSettings,
  usePtHubSettings,
} from "../../../../features/pt-hub/lib/pt-hub";
import {
  DisabledSettingField,
  SettingsFieldRow,
  SettingsHelperCallout,
  SettingsSectionCard,
  StickySaveBar,
} from "../../../../features/settings/components/settings-primitives";
import { useDirtyNavigationGuard } from "../../../../features/settings/hooks/use-dirty-navigation-guard";

type NotificationFormState = {
  clientAlerts: boolean;
  weeklyDigest: boolean;
  productUpdates: boolean;
};

const defaultState: NotificationFormState = {
  clientAlerts: true,
  weeklyDigest: true,
  productUpdates: false,
};

function PreferenceToggle({
  title,
  description,
  checked,
  onCheckedChange,
  disabled,
}: {
  title: string;
  description: string;
  checked: boolean;
  onCheckedChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-border/70 bg-card/40 px-4 py-3">
      <div>
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} disabled={disabled} />
    </div>
  );
}

export function PtHubSettingsNotificationsTab() {
  const queryClient = useQueryClient();
  const { user } = useSessionAuth();
  const settingsQuery = usePtHubSettings();
  const [form, setForm] = useState<NotificationFormState>(defaultState);
  const [saving, setSaving] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);

  const initialState = useMemo(() => {
    if (!settingsQuery.data) return defaultState;
    return {
      clientAlerts: settingsQuery.data.clientAlerts,
      weeklyDigest: settingsQuery.data.weeklyDigest,
      productUpdates: settingsQuery.data.productUpdates,
    } satisfies NotificationFormState;
  }, [settingsQuery.data]);

  useEffect(() => {
    setForm(initialState);
  }, [initialState]);

  const isDirty = JSON.stringify(form) !== JSON.stringify(initialState);

  const saveNotifications = async () => {
    if (!user?.id || !settingsQuery.data) return false;

    setSaving(true);
    setErrorText(null);
    try {
      await savePtHubSettings({
        userId: user.id,
        settings: {
          ...settingsQuery.data,
          clientAlerts: form.clientAlerts,
          weeklyDigest: form.weeklyDigest,
          productUpdates: form.productUpdates,
        },
      });

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["pt-hub-settings"] }),
        queryClient.invalidateQueries({ queryKey: ["pt-hub-overview"] }),
      ]);
      return true;
    } catch (error) {
      setErrorText(
        error instanceof Error
          ? error.message
          : "Unable to save notification settings.",
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
    onSave: saveNotifications,
  });

  if (!settingsQuery.data) {
    return (
      <SettingsSectionCard
        title="Notifications"
        description="Loading notification settings..."
      >
        <p className="text-sm text-muted-foreground">Please wait while we load your notification preferences.</p>
      </SettingsSectionCard>
    );
  }

  return (
    <div className="space-y-4">
      {guardDialog}

      {errorText ? (
        <div className="rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
          {errorText}
        </div>
      ) : null}

      <SettingsSectionCard
        title="Signal Preferences"
        description="Choose which PT Hub signals should notify you globally."
      >
        <SettingsFieldRow
          label="PT Hub alerts"
          hint="Lead alerts, inquiry alerts, and missed check-in summaries."
        >
          <PreferenceToggle
            title="Lead and inquiry alerts"
            description="High-signal updates for incoming demand and clients needing action."
            checked={form.clientAlerts}
            onCheckedChange={(value) =>
              setForm((prev) => ({ ...prev, clientAlerts: value }))
            }
          />
        </SettingsFieldRow>

        <SettingsFieldRow label="Weekly digest" hint="Weekly business health summary.">
          <PreferenceToggle
            title="Weekly digest"
            description="A weekly summary of workspace movement and profile readiness."
            checked={form.weeklyDigest}
            onCheckedChange={(value) =>
              setForm((prev) => ({ ...prev, weeklyDigest: value }))
            }
          />
        </SettingsFieldRow>

        <SettingsFieldRow label="Product updates" hint="Repsync update notifications.">
          <PreferenceToggle
            title="Product updates"
            description="Optional product and release update messages."
            checked={form.productUpdates}
            onCheckedChange={(value) =>
              setForm((prev) => ({ ...prev, productUpdates: value }))
            }
          />
        </SettingsFieldRow>
      </SettingsSectionCard>

      <SettingsSectionCard
        title="Channel Preferences"
        description="Channel-level controls are not fully supported yet."
      >
        <SettingsFieldRow label="Email channel" hint="Backend support pending.">
          <DisabledSettingField value="Not configurable yet" />
        </SettingsFieldRow>
        <SettingsFieldRow label="In-app channel" hint="Backend support pending.">
          <DisabledSettingField value="Not configurable yet" />
        </SettingsFieldRow>
        <SettingsFieldRow label="Push channel" hint="Backend support pending.">
          <DisabledSettingField value="Not configurable yet" />
        </SettingsFieldRow>
        <SettingsHelperCallout
          title="Honest placeholder"
          body="Channel-specific delivery controls will be enabled when backend support is available."
        />
      </SettingsSectionCard>

      <StickySaveBar
        isDirty={isDirty}
        isSaving={saving}
        onSave={saveNotifications}
        onDiscard={discard}
      />
    </div>
  );
}

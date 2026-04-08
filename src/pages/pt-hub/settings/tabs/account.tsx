import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "../../../../components/ui/button";
import { Input } from "../../../../components/ui/input";
import { useSessionAuth } from "../../../../lib/auth";
import { useWorkspace } from "../../../../lib/use-workspace";
import {
  savePtHubSettings,
  usePtHubSettings,
  usePtHubWorkspaces,
} from "../../../../features/pt-hub/lib/pt-hub";
import {
  DisabledSettingField,
  SettingsFieldRow,
  SettingsHelperCallout,
  SettingsSectionCard,
  StickySaveBar,
} from "../../../../features/settings/components/settings-primitives";
import { useDirtyNavigationGuard } from "../../../../features/settings/hooks/use-dirty-navigation-guard";

type AccountFormState = {
  contactEmail: string;
  supportEmail: string;
  phone: string;
  timezone: string;
  city: string;
};

const emptyState: AccountFormState = {
  contactEmail: "",
  supportEmail: "",
  phone: "",
  timezone: "",
  city: "",
};

function getInitialState(params: {
  contactEmail: string;
  supportEmail: string;
  phone: string;
  timezone: string;
  city: string;
}): AccountFormState {
  return {
    contactEmail: params.contactEmail,
    supportEmail: params.supportEmail,
    phone: params.phone,
    timezone: params.timezone,
    city: params.city,
  };
}

export function PtHubSettingsAccountTab() {
  const queryClient = useQueryClient();
  const { user } = useSessionAuth();
  const { workspaceId } = useWorkspace();
  const workspacesQuery = usePtHubWorkspaces();
  const settingsQuery = usePtHubSettings();
  const [form, setForm] = useState<AccountFormState>(emptyState);
  const [saving, setSaving] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [saveStateText, setSaveStateText] = useState<string>("Unsaved changes");

  const initialState = useMemo(() => {
    if (!settingsQuery.data) return emptyState;

    return getInitialState({
      contactEmail: settingsQuery.data.contactEmail,
      supportEmail: settingsQuery.data.supportEmail,
      phone: settingsQuery.data.phone,
      timezone: settingsQuery.data.timezone,
      city: settingsQuery.data.city,
    });
  }, [settingsQuery.data]);

  useEffect(() => {
    setForm(initialState);
  }, [initialState]);

  const isDirty = JSON.stringify(form) !== JSON.stringify(initialState);

  useEffect(() => {
    if (isDirty) {
      setSaveStateText("Unsaved changes");
    }
  }, [isDirty]);

  const saveAccountTab = async () => {
    if (!user?.id || !settingsQuery.data) return false;

    setSaving(true);
    setErrorText(null);
    try {
      await savePtHubSettings({
        userId: user.id,
        settings: {
          ...settingsQuery.data,
          contactEmail: form.contactEmail,
          supportEmail: form.supportEmail,
          phone: form.phone,
          timezone: form.timezone,
          city: form.city,
        },
      });

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["pt-hub-settings"] }),
        queryClient.invalidateQueries({ queryKey: ["pt-hub-overview"] }),
      ]);

      setSaveStateText("Saved just now");
      return true;
    } catch (error) {
      setErrorText(
        error instanceof Error ? error.message : "Unable to save account settings.",
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
    onSave: saveAccountTab,
  });

  if (!settingsQuery.data) {
    return (
      <SettingsSectionCard
        title="Account"
        description="Loading account settings..."
      >
        <p className="text-sm text-muted-foreground">Please wait while we load your account details.</p>
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
        title="Account Identity"
        description="Global PT account identity and contact settings."
      >
        <SettingsFieldRow label="Account email" hint="Authentication identity (read-only).">
          <DisabledSettingField value={user?.email ?? "No email"} />
        </SettingsFieldRow>

        <SettingsFieldRow label="Trainer ID" hint="Secondary identifier (read-only).">
          <DisabledSettingField value={user?.id ?? "Unavailable"} />
        </SettingsFieldRow>

        <SettingsFieldRow label="Contact email" hint="Primary PT Hub business contact.">
          <Input
            type="email"
            value={form.contactEmail}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, contactEmail: event.target.value }))
            }
            placeholder="coach@yourbrand.com"
          />
        </SettingsFieldRow>

        <SettingsFieldRow label="Support email" hint="Support contact for account/client communications.">
          <Input
            type="email"
            value={form.supportEmail}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, supportEmail: event.target.value }))
            }
            placeholder="support@yourbrand.com"
          />
        </SettingsFieldRow>

        <SettingsFieldRow label="Phone" hint="Global PT contact number.">
          <Input
            value={form.phone}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, phone: event.target.value }))
            }
            placeholder="+974 ..."
          />
        </SettingsFieldRow>

        <SettingsFieldRow label="Timezone" hint="Default global timezone for PT Hub behavior.">
          <Input
            value={form.timezone}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, timezone: event.target.value }))
            }
            placeholder="Asia/Qatar"
          />
        </SettingsFieldRow>

        <SettingsFieldRow label="City or region" hint="High-level geographic context.">
          <Input
            value={form.city}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, city: event.target.value }))
            }
            placeholder="Doha"
          />
        </SettingsFieldRow>

        <SettingsFieldRow
          label="Default coaching space"
          hint="Managed from your workspace context."
        >
          <DisabledSettingField
            value={
              workspacesQuery.data?.find((workspace) => workspace.id === workspaceId)
                ?.name ?? "No default workspace selected"
            }
          />
        </SettingsFieldRow>

        <SettingsFieldRow
          label="Language / region"
          hint="No safe write path currently available."
        >
          <DisabledSettingField value="Not configurable yet" />
        </SettingsFieldRow>

      </SettingsSectionCard>

      <SettingsSectionCard title="Scope Ownership" description="Keep settings ownership clear.">
        <SettingsHelperCallout
          title="Public profile fields moved out of Settings"
          body="Display name, avatar, bio, visibility, and marketplace content are now managed only on the Public Profile page."
        />
        <Button asChild variant="ghost" className="w-fit">
          <Link to="/pt-hub/profile">Open Public Profile</Link>
        </Button>
        <SettingsHelperCallout
          title="Workspace branding is managed per workspace"
          body="Client-facing workspace branding and operating defaults are managed in Workspace Settings."
        />
        <Button asChild variant="ghost" className="w-fit">
          <Link to="/pt-hub/workspaces">Open Coaching Spaces</Link>
        </Button>
      </SettingsSectionCard>

      <StickySaveBar
        isDirty={isDirty}
        isSaving={saving}
        onSave={saveAccountTab}
        onDiscard={discard}
        statusText={saveStateText}
      />
    </div>
  );
}

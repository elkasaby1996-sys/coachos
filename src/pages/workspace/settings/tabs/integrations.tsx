import {
  DisabledSettingField,
  SettingsFieldRow,
  SettingsHelperCallout,
  SettingsSectionCard,
} from "../../../../features/settings/components/settings-primitives";

export function WorkspaceSettingsIntegrationsTab() {
  return (
    <div className="space-y-4">
      <SettingsSectionCard
        title="Workspace Integrations"
        description="Workspace-level integration controls."
      >
        <SettingsFieldRow
          label="Calendar sync"
          hint="No safe write path currently available."
        >
          <DisabledSettingField value="Not connected" />
        </SettingsFieldRow>
        <SettingsFieldRow
          label="Messaging integration"
          hint="No safe write path currently available."
        >
          <DisabledSettingField value="Not connected" />
        </SettingsFieldRow>
        <SettingsFieldRow
          label="Domain / email integration"
          hint="No safe write path currently available."
        >
          <DisabledSettingField value="Not connected" />
        </SettingsFieldRow>
      </SettingsSectionCard>

      <SettingsSectionCard
        title="Future Integrations"
        description="Reserved slots for future workspace integrations."
      >
        <SettingsFieldRow label="CRM sync" hint="Future integration slot.">
          <DisabledSettingField value="Coming soon" />
        </SettingsFieldRow>
        <SettingsFieldRow
          label="Risk scoring provider"
          hint="Future integration slot."
        >
          <DisabledSettingField value="Coming soon" />
        </SettingsFieldRow>
      </SettingsSectionCard>

      <SettingsHelperCallout
        title="Honest disabled state"
        body="These controls are visible but disabled because no workspace integration backend is wired yet."
      />
    </div>
  );
}

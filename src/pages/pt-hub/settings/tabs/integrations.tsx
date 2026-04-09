import {
  DisabledSettingField,
  SettingsFieldRow,
  SettingsHelperCallout,
  SettingsSectionCard,
} from "../../../../features/settings/components/settings-primitives";

export function PtHubSettingsIntegrationsTab() {
  return (
    <div className="space-y-4">
      <SettingsSectionCard
        title="Connected Services"
        description="Global PT Hub integrations and account-level connections."
      >
        <SettingsFieldRow
          label="Calendar integration"
          hint="Google/Outlook connection is not yet supported."
        >
          <DisabledSettingField value="Not connected" />
        </SettingsFieldRow>
        <SettingsFieldRow
          label="Email/domain integration"
          hint="Domain and sender configuration is not yet supported."
        >
          <DisabledSettingField value="Not connected" />
        </SettingsFieldRow>
      </SettingsSectionCard>

      <SettingsSectionCard
        title="Future Integrations"
        description="These controls are shown as disabled until backend support is available."
      >
        <SettingsFieldRow
          label="CRM sync"
          hint="Future integration slot."
        >
          <DisabledSettingField value="Coming soon" />
        </SettingsFieldRow>
        <SettingsFieldRow
          label="Marketing automation"
          hint="Future integration slot."
        >
          <DisabledSettingField value="Coming soon" />
        </SettingsFieldRow>
      </SettingsSectionCard>

      <SettingsHelperCallout
        title="Honest placeholder state"
        body="Integration controls are intentionally disabled because no safe write path exists yet."
      />
    </div>
  );
}

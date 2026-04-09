import {
  DisabledSettingField,
  SettingsFieldRow,
  SettingsHelperCallout,
  SettingsSectionCard,
} from "../../../../features/settings/components/settings-primitives";

export function WorkspaceSettingsAutomationsTab() {
  return (
    <div className="space-y-4">
      <SettingsSectionCard
        title="Reminder Automations"
        description="Workspace-level reminder and follow-up automation rules."
      >
        <SettingsFieldRow
          label="Missed check-in reminders"
          hint="No safe write path currently available."
        >
          <DisabledSettingField value="Not configurable yet" />
        </SettingsFieldRow>
        <SettingsFieldRow
          label="Inactivity nudges"
          hint="No safe write path currently available."
        >
          <DisabledSettingField value="Not configurable yet" />
        </SettingsFieldRow>
        <SettingsFieldRow
          label="Onboarding reminders"
          hint="No safe write path currently available."
        >
          <DisabledSettingField value="Not configurable yet" />
        </SettingsFieldRow>
      </SettingsSectionCard>

      <SettingsSectionCard
        title="Risk and Overdue Logic"
        description="Risk flags and overdue behavior controls."
      >
        <SettingsFieldRow
          label="Risk flag rules"
          hint="No safe write path currently available."
        >
          <DisabledSettingField value="Not configurable yet" />
        </SettingsFieldRow>
        <SettingsFieldRow
          label="Overdue logic"
          hint="No safe write path currently available."
        >
          <DisabledSettingField value="Not configurable yet" />
        </SettingsFieldRow>
      </SettingsSectionCard>

      <SettingsHelperCallout
        title="Honest placeholder"
        body="Automation settings are intentionally disabled until backend support is available."
      />
    </div>
  );
}

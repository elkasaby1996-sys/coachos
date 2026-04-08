import {
  DisabledSettingField,
  SettingsFieldRow,
  SettingsHelperCallout,
  SettingsSectionCard,
} from "../../../../features/settings/components/settings-primitives";

const moduleRows = [
  "Training",
  "Nutrition",
  "Habits",
  "Check-ins",
  "Messaging",
  "Resources/files",
];

export function WorkspaceSettingsClientExperienceTab() {
  return (
    <div className="space-y-4">
      <SettingsSectionCard
        title="Onboarding and Messaging Defaults"
        description="Workspace-level client experience controls."
      >
        <SettingsFieldRow
          label="Onboarding defaults"
          hint="No safe write path currently available."
        >
          <DisabledSettingField value="Not configurable yet" />
        </SettingsFieldRow>
        <SettingsFieldRow
          label="Welcome message"
          hint="No safe write path currently available."
        >
          <DisabledSettingField value="Not configurable yet" />
        </SettingsFieldRow>
        <SettingsFieldRow
          label="Chat and messaging rules"
          hint="No safe write path currently available."
        >
          <DisabledSettingField value="Not configurable yet" />
        </SettingsFieldRow>
      </SettingsSectionCard>

      <SettingsSectionCard
        title="Enabled Client Modules"
        description="Module toggles are shown as disabled until workspace-level control paths are available."
      >
        <div className="space-y-2">
          {moduleRows.map((label) => (
            <div
              key={label}
              className="flex items-center justify-between rounded-xl border border-border/70 bg-card/40 px-4 py-3"
            >
              <p className="text-sm text-foreground">{label}</p>
              <span className="text-xs text-muted-foreground">Unavailable</span>
            </div>
          ))}
        </div>
      </SettingsSectionCard>

      <SettingsSectionCard
        title="Client Home Defaults"
        description="Default client-home configuration."
      >
        <SettingsFieldRow
          label="Default client home experience"
          hint="No safe write path currently available."
        >
          <DisabledSettingField value="Not configurable yet" />
        </SettingsFieldRow>
      </SettingsSectionCard>

      <SettingsHelperCallout
        title="Honest disabled state"
        body="These controls are intentionally disabled because workspace-level write handlers are not yet available."
      />
    </div>
  );
}

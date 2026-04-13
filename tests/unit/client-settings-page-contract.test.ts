import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const settingsPageSource = readFileSync(
  resolve(process.cwd(), "src", "pages", "client", "settings.tsx"),
  "utf8",
);

describe("client settings page contract", () => {
  it("defines the exact tab model", () => {
    expect(settingsPageSource).toContain('id: "profile", label: "Profile"');
    expect(settingsPageSource).toContain('id: "preferences", label: "Preferences"');
    expect(settingsPageSource).toContain('id: "notifications", label: "Notifications"');
    expect(settingsPageSource).toContain(
      'id: "privacy-security", label: "Privacy & Security"',
    );
    expect(settingsPageSource).toContain('id: "billing", label: "Billing"');
  });

  it("renders required profile fields and excludes disallowed profile labels", () => {
    expect(settingsPageSource).toContain('SettingsFieldRow label="Avatar"');
    expect(settingsPageSource).toContain('SettingsFieldRow label="Full name"');
    expect(settingsPageSource).toContain('SettingsFieldRow label="Email"');
    expect(settingsPageSource).toContain('SettingsFieldRow label="Phone number"');
    expect(settingsPageSource).toContain('SettingsFieldRow label="Date of birth"');
    expect(settingsPageSource).toContain('SettingsFieldRow label="Gender"');
    expect(settingsPageSource).toContain('SettingsFieldRow label="Height"');
    expect(settingsPageSource).toContain('SettingsFieldRow label="Weight"');
    expect(settingsPageSource).toContain('SettingsFieldRow label="Timezone"');

    expect(settingsPageSource).not.toContain("Display name");
    expect(settingsPageSource).not.toContain("Primary goals");
    expect(settingsPageSource).not.toContain("Interests");
  });

  it("renders required preferences fields", () => {
    expect(settingsPageSource).toContain('SettingsFieldRow label="Units"');
    expect(settingsPageSource).toContain('SettingsFieldRow label="Date format"');
    expect(settingsPageSource).toContain('SettingsFieldRow label="Language"');
    expect(settingsPageSource).toContain('SettingsFieldRow label="Theme"');
  });

  it("keeps privacy/security scope without MFA or data export", () => {
    expect(settingsPageSource).toContain('SettingsSectionCard title="Sign-in Security"');
    expect(settingsPageSource).toContain('SettingsSectionCard title="Sessions"');
    expect(settingsPageSource).toContain('SettingsSectionCard title="Account deletion"');
    expect(settingsPageSource).not.toContain("MFA");
    expect(settingsPageSource).not.toContain("Data export");
  });

  it("keeps billing tab focused on active service and excludes invite/application copy", () => {
    expect(settingsPageSource).toContain('SettingsSectionCard title="Current Service"');
    expect(settingsPageSource).toContain('SettingsSectionCard title="Billing Status"');
    expect(settingsPageSource).toContain('SettingsSectionCard title="Invoice History"');
    expect(settingsPageSource).toContain('SettingsSectionCard title="Payment Method"');
    expect(settingsPageSource).toContain('title="No active billing relationship"');

    expect(settingsPageSource).not.toContain("Pending applications");
    expect(settingsPageSource).not.toContain("Invites");
  });

  it("uses sticky save bars for editable tabs", () => {
    expect(settingsPageSource).toContain("isDirty={profileDirty}");
    expect(settingsPageSource).toContain("isDirty={preferencesDirty}");
    expect(settingsPageSource).toContain("isDirty={notificationsDirty}");
  });
});

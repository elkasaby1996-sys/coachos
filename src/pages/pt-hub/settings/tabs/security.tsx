import { useState } from "react";
import { useSessionAuth } from "../../../../lib/auth";
import { supabase } from "../../../../lib/supabase";
import { Button } from "../../../../components/ui/button";
import { Input } from "../../../../components/ui/input";
import {
  DisabledSettingField,
  SettingsFieldRow,
  SettingsHelperCallout,
  SettingsSectionCard,
  StickySaveBar,
} from "../../../../features/settings/components/settings-primitives";
import { useDirtyNavigationGuard } from "../../../../features/settings/hooks/use-dirty-navigation-guard";

export function PtHubSettingsSecurityTab() {
  const { session } = useSessionAuth();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);

  const isDirty =
    currentPassword.length > 0 ||
    newPassword.length > 0 ||
    confirmPassword.length > 0;

  const passwordTooShort = newPassword.length > 0 && newPassword.length < 8;
  const passwordMismatch =
    confirmPassword.length > 0 && newPassword !== confirmPassword;

  const canSave =
    currentPassword.length > 0 &&
    newPassword.length >= 8 &&
    newPassword === confirmPassword &&
    !saving;

  const saveSecurity = async () => {
    if (!canSave) return false;

    setSaving(true);
    setErrorText(null);
    try {
      const email = session?.user?.email;
      if (!email) {
        throw new Error(
          "Password update requires an email/password account session.",
        );
      }

      const { data: reauthData, error: reauthError } =
        await supabase.auth.signInWithPassword({
          email,
          password: currentPassword,
        });
      if (reauthError || !reauthData.user) {
        throw new Error("Current password is incorrect.");
      }

      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });
      if (error) throw error;

      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      return true;
    } catch (error) {
      setErrorText(
        error instanceof Error ? error.message : "Unable to update password.",
      );
      return false;
    } finally {
      setSaving(false);
    }
  };

  const discard = () => {
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setErrorText(null);
  };

  const { guardDialog } = useDirtyNavigationGuard({
    isDirty,
    onDiscard: discard,
    onSave: saveSecurity,
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
        title="Password Security"
        description="Update your PT Hub account password."
      >
        <SettingsFieldRow label="Account email" hint="Authentication identity.">
          <DisabledSettingField value={session?.user?.email ?? "No email"} />
        </SettingsFieldRow>

        <SettingsFieldRow
          label="Current password"
          hint="Required to verify your identity."
        >
          <Input
            type="password"
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
            placeholder="Current password"
          />
        </SettingsFieldRow>

        <SettingsFieldRow
          label="New password"
          hint="Use at least 8 characters."
        >
          <Input
            type="password"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            placeholder="New password"
          />
          {passwordTooShort ? (
            <p className="text-xs text-danger">
              Password must be at least 8 characters.
            </p>
          ) : null}
        </SettingsFieldRow>

        <SettingsFieldRow
          label="Confirm password"
          hint="Must match the new password."
        >
          <Input
            type="password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            placeholder="Confirm new password"
          />
          {passwordMismatch ? (
            <p className="text-xs text-danger">Passwords do not match.</p>
          ) : null}
        </SettingsFieldRow>
      </SettingsSectionCard>

      <SettingsSectionCard
        title="Advanced Security"
        description="MFA, active sessions, and recovery methods are not fully connected yet."
      >
        <SettingsFieldRow label="MFA status" hint="Not connected in this build.">
          <DisabledSettingField value="Not connected" />
        </SettingsFieldRow>
        <SettingsFieldRow
          label="Active sessions"
          hint="Session management API not wired yet."
        >
          <DisabledSettingField value="Not connected" />
        </SettingsFieldRow>
        <SettingsFieldRow
          label="Recovery methods"
          hint="Recovery management is currently external."
        >
          <DisabledSettingField value="Use password reset flow from login" />
        </SettingsFieldRow>
        <SettingsHelperCallout
          title="Honest state"
          body="Advanced security controls are shown as disabled until secure backend paths are available."
        />
      </SettingsSectionCard>

      <StickySaveBar
        isDirty={isDirty}
        isSaving={saving}
        onSave={saveSecurity}
        onDiscard={discard}
        statusText={canSave ? "Unsaved changes" : "Complete required fields"}
      />
    </div>
  );
}

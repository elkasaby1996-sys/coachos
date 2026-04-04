import { useEffect, useMemo, useState } from "react";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import {
  SettingsActions,
  SettingsBlock,
  SettingsPageShell,
  SettingsRow,
  SettingsToast,
} from "./shared";
import { useAuth } from "../../../lib/auth";
import { supabase } from "../../../lib/supabase";

export function AccountSettings() {
  const { session } = useAuth();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastVariant, setToastVariant] = useState<"success" | "error">(
    "success",
  );

  useEffect(() => {
    if (!toastMessage) return;
    const timeout = window.setTimeout(() => setToastMessage(null), 2400);
    return () => window.clearTimeout(timeout);
  }, [toastMessage]);

  const passwordTooShort = newPassword.length > 0 && newPassword.length < 8;
  const passwordMismatch =
    confirmPassword.length > 0 && newPassword !== confirmPassword;

  const canSubmit = useMemo(
    () =>
      currentPassword.length > 0 &&
      newPassword.length >= 8 &&
      newPassword === confirmPassword &&
      !saving,
    [currentPassword, newPassword, confirmPassword, saving],
  );

  const handleChangePassword = async () => {
    if (!canSubmit) return;
    setSaving(true);
    try {
      const email = session?.user?.email;
      if (!email) {
        throw new Error(
          "Password change requires an email/password account session.",
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

      setToastVariant("success");
      setToastMessage("Password updated.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (error) {
      setToastVariant("error");
      setToastMessage(
        error instanceof Error ? error.message : "Unable to update password.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <SettingsToast message={toastMessage} variant={toastVariant} />
      <SettingsPageShell
        title="Account"
        description="Secure your account and manage authentication details."
      >
        <SettingsBlock
          title="Sign-in identity"
          description="Your account email is managed through authentication."
          noBorder
        >
          <SettingsRow
            label="Email"
            hint="Read-only identity used to access Repsync."
          >
            <Input
              value={session?.user?.email ?? "No email"}
              readOnly
              disabled
            />
          </SettingsRow>

          <SettingsRow
            label="Current password"
            hint="Required before you can set a new password."
          >
            <Input
              type="password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              placeholder="Enter current password"
              data-testid="current-password-input"
            />
          </SettingsRow>

          <SettingsRow
            label="New password"
            hint="Minimum 8 characters. Use a strong, unique password."
          >
            <Input
              type="password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              placeholder="Enter new password"
              data-testid="new-password-input"
            />
            {passwordTooShort ? (
              <p className="text-xs text-danger">
                Password must be at least 8 characters.
              </p>
            ) : null}
          </SettingsRow>

          <SettingsRow
            label="Confirm password"
            hint="Must match the new password."
          >
            <Input
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              placeholder="Re-enter password"
              data-testid="confirm-password-input"
            />
            {passwordMismatch ? (
              <p className="text-xs text-danger">Passwords do not match.</p>
            ) : null}
          </SettingsRow>

          <SettingsActions>
            <Button
              type="button"
              onClick={handleChangePassword}
              disabled={!canSubmit}
              data-testid="change-password-button"
            >
              {saving ? "Updating..." : "Change password"}
            </Button>
          </SettingsActions>
        </SettingsBlock>
      </SettingsPageShell>
    </>
  );
}

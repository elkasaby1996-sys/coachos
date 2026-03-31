import { useEffect, useMemo, useState } from "react";
import { NavLink } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Lock, Palette, User } from "lucide-react";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Switch } from "../../components/ui/switch";
import { PortalPageHeader } from "../../components/client/portal";
import {
  SettingsActions,
  SettingsBlock,
  SettingsPageShell,
  SettingsRow,
  SettingsToast,
} from "../settings/sections/shared";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../lib/auth";
import { useThemePreference } from "../../lib/use-theme-preference";
import { cn } from "../../lib/utils";

type ClientSettingsProfile = {
  id: string;
  display_name: string | null;
  phone: string | null;
  location: string | null;
  timezone: string | null;
  unit_preference: string | null;
  dob: string | null;
  gender: string | null;
  gym_name: string | null;
  days_per_week: number | null;
  goal: string | null;
  injuries: string | null;
  limitations: string | null;
  height_cm: number | null;
  current_weight: number | null;
};

type ProfileForm = {
  display_name: string;
  phone: string;
  location: string;
  timezone: string;
  unit_preference: string;
  dob: string;
  gender: string;
  gym_name: string;
  days_per_week: string;
  goal: string;
  injuries: string;
  limitations: string;
  height_cm: string;
  current_weight: string;
};

const emptyForm: ProfileForm = {
  display_name: "",
  phone: "",
  location: "",
  timezone: "",
  unit_preference: "",
  dob: "",
  gender: "",
  gym_name: "",
  days_per_week: "",
  goal: "",
  injuries: "",
  limitations: "",
  height_cm: "",
  current_weight: "",
};

const toInput = (value: string | number | null | undefined) =>
  value === null || value === undefined ? "" : String(value);

const toNumberOrNull = (value: string) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export function ClientSettingsPage() {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const { themePreference, compactDensity, updateAppearance, isSaving } =
    useThemePreference();
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastVariant, setToastVariant] = useState<"success" | "error">(
    "success",
  );
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving">("idle");
  const [passwordSaveStatus, setPasswordSaveStatus] = useState<
    "idle" | "saving"
  >("idle");
  const [formState, setFormState] = useState<ProfileForm>(emptyForm);
  const [appearanceTheme, setAppearanceTheme] = useState(themePreference);
  const [appearanceCompactDensity, setAppearanceCompactDensity] =
    useState(compactDensity);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [activeSection, setActiveSection] = useState<
    "profile" | "appearance" | "security"
  >("profile");

  const clientSettingsNav = [
    {
      id: "profile" as const,
      label: "Profile",
      description: "Your personal and coaching profile fields.",
      icon: User,
    },
    {
      id: "appearance" as const,
      label: "Appearance",
      description: "Theme and density preferences.",
      icon: Palette,
    },
    {
      id: "security" as const,
      label: "Security",
      description: "Password and account security settings.",
      icon: Lock,
    },
  ];

  useEffect(() => {
    if (!toastMessage) return;
    const timeout = window.setTimeout(() => setToastMessage(null), 2400);
    return () => window.clearTimeout(timeout);
  }, [toastMessage]);

  useEffect(() => {
    setAppearanceTheme(themePreference);
  }, [themePreference]);

  useEffect(() => {
    setAppearanceCompactDensity(compactDensity);
  }, [compactDensity]);

  const profileQuery = useQuery({
    queryKey: ["client-settings-profile", session?.user?.id],
    enabled: !!session?.user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select(
          "id, display_name, phone, location, timezone, unit_preference, dob, gender, gym_name, days_per_week, goal, injuries, limitations, height_cm, current_weight",
        )
        .eq("user_id", session?.user?.id ?? "")
        .maybeSingle();
      if (error) throw error;
      return data as ClientSettingsProfile | null;
    },
  });

  useEffect(() => {
    const profile = profileQuery.data;
    if (!profile) return;
    setFormState({
      display_name: toInput(profile.display_name),
      phone: toInput(profile.phone),
      location: toInput(profile.location),
      timezone: toInput(profile.timezone),
      unit_preference: toInput(profile.unit_preference),
      dob: toInput(profile.dob),
      gender: toInput(profile.gender),
      gym_name: toInput(profile.gym_name),
      days_per_week: toInput(profile.days_per_week),
      goal: toInput(profile.goal),
      injuries: toInput(profile.injuries),
      limitations: toInput(profile.limitations),
      height_cm: toInput(profile.height_cm),
      current_weight: toInput(profile.current_weight),
    });
  }, [profileQuery.data]);

  const hasProfileChanges = useMemo(() => {
    const p = profileQuery.data;
    if (!p) return false;
    return (
      formState.display_name !== toInput(p.display_name) ||
      formState.phone !== toInput(p.phone) ||
      formState.location !== toInput(p.location) ||
      formState.timezone !== toInput(p.timezone) ||
      formState.unit_preference !== toInput(p.unit_preference) ||
      formState.dob !== toInput(p.dob) ||
      formState.gender !== toInput(p.gender) ||
      formState.gym_name !== toInput(p.gym_name) ||
      formState.days_per_week !== toInput(p.days_per_week) ||
      formState.goal !== toInput(p.goal) ||
      formState.injuries !== toInput(p.injuries) ||
      formState.limitations !== toInput(p.limitations) ||
      formState.height_cm !== toInput(p.height_cm) ||
      formState.current_weight !== toInput(p.current_weight)
    );
  }, [formState, profileQuery.data]);

  const hasAppearanceChanges = useMemo(
    () =>
      appearanceTheme !== themePreference ||
      appearanceCompactDensity !== compactDensity,
    [
      appearanceCompactDensity,
      appearanceTheme,
      compactDensity,
      themePreference,
    ],
  );

  const handleSaveProfile = async () => {
    if (!profileQuery.data?.id) return;
    setSaveStatus("saving");
    const { error } = await supabase
      .from("clients")
      .update({
        display_name: formState.display_name.trim() || null,
        phone: formState.phone.trim() || null,
        location: formState.location.trim() || null,
        timezone: formState.timezone.trim() || null,
        unit_preference: formState.unit_preference.trim() || null,
        dob: formState.dob.trim() || null,
        gender: formState.gender.trim() || null,
        gym_name: formState.gym_name.trim() || null,
        days_per_week: toNumberOrNull(formState.days_per_week),
        goal: formState.goal.trim() || null,
        injuries: formState.injuries.trim() || null,
        limitations: formState.limitations.trim() || null,
        height_cm: toNumberOrNull(formState.height_cm),
        current_weight: toNumberOrNull(formState.current_weight),
        updated_at: new Date().toISOString(),
      })
      .eq("id", profileQuery.data.id);

    setSaveStatus("idle");
    if (error) {
      setToastVariant("error");
      setToastMessage(error.message || "Unable to save profile.");
      return;
    }

    await queryClient.invalidateQueries({
      queryKey: ["client-settings-profile", session?.user?.id],
    });
    setToastVariant("success");
    setToastMessage("Profile settings saved.");
  };

  const handleSaveAppearance = async () => {
    try {
      await updateAppearance({
        themePreference: appearanceTheme,
        compactDensity: appearanceCompactDensity,
        persist: true,
      });
      setToastVariant("success");
      setToastMessage("Appearance saved.");
    } catch {
      setToastVariant("error");
      setToastMessage("Unable to save appearance settings.");
    }
  };

  const handleChangePassword = async () => {
    if (!currentPassword) {
      setToastVariant("error");
      setToastMessage("Current password is required.");
      return;
    }
    if (newPassword.length < 8) {
      setToastVariant("error");
      setToastMessage("Password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setToastVariant("error");
      setToastMessage("Passwords do not match.");
      return;
    }

    const email = session?.user?.email;
    if (!email) {
      setToastVariant("error");
      setToastMessage("No email found for this account.");
      return;
    }

    setPasswordSaveStatus("saving");
    const { data: reauthData, error: reauthError } =
      await supabase.auth.signInWithPassword({
        email,
        password: currentPassword,
      });
    if (reauthError || !reauthData.user) {
      setPasswordSaveStatus("idle");
      setToastVariant("error");
      setToastMessage("Current password is incorrect.");
      return;
    }

    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setPasswordSaveStatus("idle");
    if (error) {
      setToastVariant("error");
      setToastMessage(error.message || "Unable to change password.");
      return;
    }

    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setToastVariant("success");
    setToastMessage("Password updated.");
  };

  return (
    <div className="portal-shell-tight">
      <SettingsToast message={toastMessage} variant={toastVariant} />

      <PortalPageHeader
        title="Settings"
        subtitle="Manage account, profile, and app preferences."
      />

      <div className="md:hidden">
        <label
          htmlFor="client-settings-section-select"
          className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground"
        >
          Settings section
        </label>
        <select
          id="client-settings-section-select"
          className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"
          value={activeSection}
          onChange={(event) =>
            setActiveSection(
              event.target.value as "profile" | "appearance" | "security",
            )
          }
        >
          {clientSettingsNav.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
        </select>
      </div>

      <div className="grid gap-6 md:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="hidden md:block">
          <nav className="sticky top-24 rounded-2xl border border-border bg-card/70 p-2">
            {clientSettingsNav.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.id}
                  to="#"
                  onClick={(event) => {
                    event.preventDefault();
                    setActiveSection(item.id);
                  }}
                  className={cn(
                    "flex items-start gap-3 rounded-xl px-3 py-3 transition",
                    activeSection === item.id
                      ? "bg-accent/10 text-foreground"
                      : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                  )}
                >
                  <span className="mt-0.5 rounded-md border border-border bg-background p-1.5">
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="space-y-1">
                    <span className="block text-sm font-medium">
                      {item.label}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {item.description}
                    </span>
                  </span>
                </NavLink>
              );
            })}
          </nav>
        </aside>

        <div className="min-w-0">
          {activeSection === "profile" ? (
            <SettingsPageShell
              title="Profile"
              description="Your coaching profile details visible in the client app."
            >
              <SettingsBlock title="Profile details" noBorder>
                <SettingsRow label="Display name">
                  <Input
                    value={formState.display_name}
                    onChange={(e) =>
                      setFormState((prev) => ({
                        ...prev,
                        display_name: e.target.value,
                      }))
                    }
                  />
                </SettingsRow>
                <SettingsRow label="Phone">
                  <Input
                    value={formState.phone}
                    onChange={(e) =>
                      setFormState((prev) => ({
                        ...prev,
                        phone: e.target.value,
                      }))
                    }
                  />
                </SettingsRow>
                <SettingsRow label="Location">
                  <Input
                    value={formState.location}
                    onChange={(e) =>
                      setFormState((prev) => ({
                        ...prev,
                        location: e.target.value,
                      }))
                    }
                  />
                </SettingsRow>
                <SettingsRow label="Timezone">
                  <Input
                    value={formState.timezone}
                    onChange={(e) =>
                      setFormState((prev) => ({
                        ...prev,
                        timezone: e.target.value,
                      }))
                    }
                  />
                </SettingsRow>
                <SettingsRow label="Goal">
                  <Input
                    value={formState.goal}
                    onChange={(e) =>
                      setFormState((prev) => ({
                        ...prev,
                        goal: e.target.value,
                      }))
                    }
                  />
                </SettingsRow>
                <SettingsActions>
                  <Button
                    type="button"
                    onClick={handleSaveProfile}
                    disabled={
                      profileQuery.isLoading ||
                      saveStatus === "saving" ||
                      !hasProfileChanges
                    }
                  >
                    {saveStatus === "saving" ? "Saving..." : "Save profile"}
                  </Button>
                </SettingsActions>
              </SettingsBlock>
            </SettingsPageShell>
          ) : null}

          {activeSection === "appearance" ? (
            <SettingsPageShell
              title="Appearance"
              description="Theme and density controls aligned with PT settings."
            >
              <SettingsBlock title="Interface preferences" noBorder>
                <SettingsRow label="Theme">
                  <div className="inline-flex items-center rounded-lg border border-border bg-muted/30 p-1">
                    {(["system", "dark", "light"] as const).map((theme) => (
                      <Button
                        key={theme}
                        type="button"
                        size="sm"
                        variant={
                          appearanceTheme === theme ? "default" : "ghost"
                        }
                        onClick={() => setAppearanceTheme(theme)}
                      >
                        {theme.charAt(0).toUpperCase() + theme.slice(1)}
                      </Button>
                    ))}
                  </div>
                </SettingsRow>
                <SettingsRow
                  label="Density"
                  hint="Compact mode reduces spacing in lists and cards."
                >
                  <div className="flex items-center justify-between rounded-lg border border-border bg-muted/30 px-4 py-3">
                    <div className="text-sm">Compact mode</div>
                    <Switch
                      checked={appearanceCompactDensity}
                      onCheckedChange={setAppearanceCompactDensity}
                    />
                  </div>
                </SettingsRow>
                <SettingsActions>
                  <Button
                    type="button"
                    onClick={handleSaveAppearance}
                    disabled={!hasAppearanceChanges || isSaving}
                  >
                    {isSaving ? "Saving..." : "Save appearance"}
                  </Button>
                </SettingsActions>
              </SettingsBlock>
            </SettingsPageShell>
          ) : null}

          {activeSection === "security" ? (
            <SettingsPageShell
              title="Security"
              description="Update your account password."
            >
              <SettingsBlock title="Password" noBorder>
                <SettingsRow label="Current password">
                  <Input
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                  />
                </SettingsRow>
                <SettingsRow label="New password">
                  <Input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                  />
                </SettingsRow>
                <SettingsRow label="Confirm password">
                  <Input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                  />
                </SettingsRow>
                <SettingsActions>
                  <Button
                    type="button"
                    onClick={handleChangePassword}
                    disabled={passwordSaveStatus === "saving"}
                  >
                    {passwordSaveStatus === "saving"
                      ? "Updating..."
                      : "Change password"}
                  </Button>
                </SettingsActions>
              </SettingsBlock>
            </SettingsPageShell>
          ) : null}
        </div>
      </div>
    </div>
  );
}

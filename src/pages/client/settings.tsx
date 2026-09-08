import {
  ProfilePhotoPicker,
  TimezonePicker,
  isValidTimezone,
} from "../../components/client/profile-inputs";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bell,
  CalendarClock,
  CreditCard,
  LogOut,
  Moon,
  Shield,
  Trash2,
  User,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../../components/ui/alert-dialog";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { Select } from "../../components/ui/select";
import { Switch } from "../../components/ui/switch";
import {
  EmptyStateBlock,
  StatusBanner,
  PortalPageHeader,
} from "../../components/client/portal";
import { useBootstrapAuth, useSessionAuth } from "../../lib/auth";
import { safeSelect } from "../../lib/supabase-safe";
import { supabase } from "../../lib/supabase";
import {
  AVAILABLE_THEME_PREFERENCES,
  LIGHT_MODE_ENABLED,
  type ThemePreference,
} from "../../lib/theme";
import { useThemePreference } from "../../lib/use-theme-preference";
import {
  useNotificationPreferences,
  useUpdateNotificationPreferences,
} from "../../features/notifications/hooks/use-notifications";
import type { NotificationPreferences } from "../../features/notifications/lib/types";
import {
  type SettingsTabLink,
  DisabledSettingField,
  SettingsFieldRow,
  SettingsPageShell,
  SettingsSectionCard,
  SettingsTabs,
  StickySaveBar,
} from "../../features/settings/components/settings-primitives";

type ClientSettingsTab =
  | "profile"
  | "preferences"
  | "notifications"
  | "privacy-security"
  | "billing";

type ClientProfileRow = {
  id: string;
  workspace_id: string | null;
  display_name: string | null;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  avatar_url: string | null;
  photo_url: string | null;
  date_of_birth: string | null;
  dob: string | null;
  gender: string | null;
  sex: string | null;
  height_value: number | null;
  height_unit: string | null;
  height_cm: number | null;
  weight_value_current: number | null;
  weight_unit: string | null;
  current_weight: number | null;
  unit_preference: string | null;
  timezone: string | null;
  created_at: string | null;
};

type ProfileFormState = {
  avatarUrl: string;
  fullName: string;
  phone: string;
  dateOfBirth: string;
  gender: string;
  heightValue: string;
  heightUnit: string;
  weightValue: string;
  weightUnit: string;
  timezone: string;
};

type PreferencesFormState = {
  units: string;
  dateFormat: string;
  language: string;
  themePreference: ThemePreference;
};

type NotificationFormState = Pick<
  NotificationPreferences,
  | "in_app_enabled"
  | "email_enabled"
  | "push_enabled"
  | "message_received"
  | "workout_assigned"
  | "workout_updated"
  | "reminders_enabled"
  | "checkin_requested"
  | "checkin_submitted"
  | "milestone_events"
  | "inactivity_alerts"
  | "system_events"
>;

type BillingSnapshot = {
  providerName: string | null;
  serviceName: string | null;
  priceLabel: string | null;
  billingStatus: "active" | "none";
  nextBillingDate: string | null;
};

const CLIENT_SETTINGS_TABS: Array<{
  id: ClientSettingsTab;
  label: string;
  icon: typeof User;
}> = [
  { id: "profile", label: "Profile", icon: User },
  { id: "preferences", label: "Preferences", icon: Moon },
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "privacy-security", label: "Privacy & Security", icon: Shield },
  { id: "billing", label: "Billing", icon: CreditCard },
];

const CLIENT_SETTINGS_TAB_SET = new Set<ClientSettingsTab>(
  CLIENT_SETTINGS_TABS.map((tab) => tab.id),
);

const CLIENT_DATE_FORMAT_STORAGE_KEY = "coachos-client-date-format";
const CLIENT_LANGUAGE_STORAGE_KEY = "coachos-client-language";

const DATE_FORMAT_OPTIONS = [
  { value: "dd-mm-yyyy", label: "DD/MM/YYYY" },
  { value: "mm-dd-yyyy", label: "MM/DD/YYYY" },
  { value: "yyyy-mm-dd", label: "YYYY-MM-DD" },
] as const;

const LANGUAGE_OPTIONS = [
  { value: "en", label: "English" },
  { value: "ar", label: "Arabic" },
] as const;

const HEIGHT_UNIT_OPTIONS = [
  { value: "cm", label: "cm" },
  { value: "in", label: "in" },
] as const;

const WEIGHT_UNIT_OPTIONS = [
  { value: "kg", label: "kg" },
  { value: "lb", label: "lb" },
] as const;

const defaultProfileFormState: ProfileFormState = {
  avatarUrl: "",
  fullName: "",
  phone: "",
  dateOfBirth: "",
  gender: "",
  heightValue: "",
  heightUnit: "cm",
  weightValue: "",
  weightUnit: "kg",
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
};

const defaultNotificationFormState: NotificationFormState = {
  in_app_enabled: true,
  email_enabled: false,
  push_enabled: false,
  message_received: true,
  workout_assigned: true,
  workout_updated: true,
  reminders_enabled: true,
  checkin_requested: true,
  checkin_submitted: true,
  milestone_events: true,
  inactivity_alerts: true,
  system_events: true,
};

const notificationGroups: Array<{
  title: string;
  items: Array<{
    key: keyof NotificationFormState;
    label: string;
    description: string;
  }>;
}> = [
  {
    title: "Messages",
    items: [
      {
        key: "message_received",
        label: "Coach messages and lead replies",
        description:
          "Get notified when any conversation in your inbox receives a reply.",
      },
    ],
  },
  {
    title: "Training and Nutrition",
    items: [
      {
        key: "workout_assigned",
        label: "Workout due today",
        description:
          "Alerts when new workout tasks are assigned to your account.",
      },
      {
        key: "workout_updated",
        label: "Plan updates",
        description:
          "Updates when your training or nutrition plan details change.",
      },
      {
        key: "reminders_enabled",
        label: "Workout, meal, and day reminders",
        description:
          "Reminders for scheduled workouts, nutrition logging, and missed actions.",
      },
    ],
  },
  {
    title: "Progress and check-ins",
    items: [
      {
        key: "checkin_requested",
        label: "Check-in reminders",
        description: "Reminders to complete a check-in for your coach.",
      },
      {
        key: "checkin_submitted",
        label: "Check-in confirmations",
        description:
          "Updates when you submit a check-in or its status changes.",
      },
      {
        key: "inactivity_alerts",
        label: "Activity reminders",
        description: "Reminders when you have been less active.",
      },
      {
        key: "milestone_events",
        label: "Progress milestones",
        description: "Get updates about streaks and milestones.",
      },
    ],
  },
  {
    title: "Service",
    items: [
      {
        key: "system_events",
        label: "Coach/service updates and billing reminders",
        description: "Updates about your account and coaching service.",
      },
    ],
  },
];

const toInput = (value: string | number | null | undefined) =>
  value === null || value === undefined ? "" : String(value);

const normalizeText = (value: string) => {
  const nextValue = value.trim();
  return nextValue.length > 0 ? nextValue : null;
};

const toNumberOrNull = (value: string) => {
  const parsed = Number(value.trim());
  return Number.isFinite(parsed) ? parsed : null;
};

const parseActiveTab = (value: string | null): ClientSettingsTab => {
  if (!value) return "profile";
  return CLIENT_SETTINGS_TAB_SET.has(value as ClientSettingsTab)
    ? (value as ClientSettingsTab)
    : "profile";
};

const isMissingColumnError = (message: string | undefined) =>
  typeof message === "string" &&
  /column .* does not exist|schema cache/i.test(message);

const readStoredDateFormat = () => {
  if (typeof window === "undefined") return DATE_FORMAT_OPTIONS[0].value;
  const stored = window.localStorage.getItem(CLIENT_DATE_FORMAT_STORAGE_KEY);
  return DATE_FORMAT_OPTIONS.some((option) => option.value === stored)
    ? (stored as (typeof DATE_FORMAT_OPTIONS)[number]["value"])
    : DATE_FORMAT_OPTIONS[0].value;
};

const readStoredLanguage = () => {
  if (typeof window === "undefined") return LANGUAGE_OPTIONS[0].value;
  const stored = window.localStorage.getItem(CLIENT_LANGUAGE_STORAGE_KEY);
  return LANGUAGE_OPTIONS.some((option) => option.value === stored)
    ? (stored as (typeof LANGUAGE_OPTIONS)[number]["value"])
    : LANGUAGE_OPTIONS[0].value;
};

const buildInitialProfileForm = (
  row: ClientProfileRow | null | undefined,
): ProfileFormState => {
  if (!row) return defaultProfileFormState;
  return {
    avatarUrl: toInput(row.avatar_url ?? row.photo_url),
    fullName: toInput(row.full_name ?? row.display_name),
    phone: toInput(row.phone),
    dateOfBirth: toInput(row.date_of_birth ?? row.dob),
    gender: toInput(row.gender ?? row.sex),
    heightValue: toInput(row.height_value ?? row.height_cm),
    heightUnit: toInput(row.height_unit) || "cm",
    weightValue: toInput(row.weight_value_current ?? row.current_weight),
    weightUnit:
      toInput(row.weight_unit) ||
      (row.unit_preference === "imperial" ? "lb" : "kg"),
    timezone: toInput(row.timezone) || defaultProfileFormState.timezone,
  };
};

const buildInitialPreferencesForm = (params: {
  profile: ClientProfileRow | null | undefined;
  themePreference: ThemePreference;
}): PreferencesFormState => ({
  units: toInput(params.profile?.unit_preference) || "metric",
  dateFormat: readStoredDateFormat(),
  language: readStoredLanguage(),
  themePreference: params.themePreference,
});

const formatDateLabel = (value: string | null) => {
  if (!value) return "Not available";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Not available";
  return parsed.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

function NotificationToggleField({
  label,
  description,
  checked,
  disabled = false,
  onCheckedChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <Card className="rounded-[18px] border border-border/70 bg-background/55 p-3 sm:p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="text-sm font-medium text-foreground">{label}</p>
          <p className="text-xs leading-5 text-muted-foreground">
            {description}
          </p>
        </div>
        <Switch
          aria-label={label}
          disabled={disabled}
          checked={checked}
          onCheckedChange={onCheckedChange}
        />
      </div>
    </Card>
  );
}

export function ClientSettingsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = parseActiveTab(searchParams.get("tab"));
  const { session, user } = useSessionAuth();
  const { activeClientId } = useBootstrapAuth();
  const { themePreference, updateAppearance } = useThemePreference();

  const [banner, setBanner] = useState<{
    tone: "success" | "warning" | "error";
    title: string;
    description: string;
  } | null>(null);

  const [profileForm, setProfileForm] = useState<ProfileFormState>(
    defaultProfileFormState,
  );
  const [photoUploading, setPhotoUploading] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);

  const [preferencesForm, setPreferencesForm] = useState<PreferencesFormState>(
    () => buildInitialPreferencesForm({ profile: null, themePreference }),
  );
  const [preferencesSaving, setPreferencesSaving] = useState(false);

  const [notificationForm, setNotificationForm] =
    useState<NotificationFormState>(defaultNotificationFormState);
  const [notificationsSaving, setNotificationsSaving] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [signOutSessionsSaving, setSignOutSessionsSaving] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const settingsTabLinks = useMemo<SettingsTabLink[]>(
    () =>
      CLIENT_SETTINGS_TABS.map((tab) => ({
        id: tab.id,
        label: tab.label,
        to: `/app/settings?tab=${tab.id}`,
      })),
    [],
  );

  useEffect(() => {
    const tab = searchParams.get("tab");
    if (tab && CLIENT_SETTINGS_TAB_SET.has(tab as ClientSettingsTab)) return;

    const nextParams = new URLSearchParams(searchParams);
    nextParams.set("tab", "profile");
    setSearchParams(nextParams, { replace: true });
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    if (!banner) return;
    const timeout = window.setTimeout(() => setBanner(null), 2800);
    return () => window.clearTimeout(timeout);
  }, [banner]);

  const clientProfileQuery = useQuery({
    queryKey: ["client-settings-profile", session?.user?.id, activeClientId],
    enabled: !!session?.user?.id,
    queryFn: async (): Promise<ClientProfileRow | null> => {
      if (!session?.user?.id) return null;

      const { data, error } = await safeSelect<ClientProfileRow>({
        table: "clients",
        columns:
          "id, workspace_id, display_name, full_name, email, phone, avatar_url, photo_url, date_of_birth, dob, gender, sex, height_value, height_unit, height_cm, weight_value_current, weight_unit, current_weight, unit_preference, timezone, created_at",
        fallbackColumns:
          "id, workspace_id, display_name, email, phone, photo_url, dob, gender, height_cm, current_weight, unit_preference, timezone, created_at",
        filter: (query) =>
          query
            .eq("user_id", session.user.id)
            .order("created_at", { ascending: true })
            .limit(25),
      });
      if (error) throw error;

      const rows = data ?? [];
      if (rows.length === 0) return null;
      if (activeClientId) {
        return (
          rows.find((row) => row.id === activeClientId) ??
          rows.find((row) => !row.workspace_id) ??
          rows[0] ??
          null
        );
      }
      return rows.find((row) => !row.workspace_id) ?? rows[0] ?? null;
    },
  });

  const notificationPreferencesQuery = useNotificationPreferences(
    user?.id ?? null,
  );
  const updateNotificationPreferences = useUpdateNotificationPreferences(
    user?.id ?? null,
  );

  const billingQuery = useQuery({
    queryKey: ["client-settings-billing", clientProfileQuery.data?.id],
    enabled: Boolean(clientProfileQuery.data?.id),
    queryFn: async (): Promise<BillingSnapshot> => {
      const profile = clientProfileQuery.data;
      if (!profile?.workspace_id) {
        return {
          providerName: null,
          serviceName: null,
          priceLabel: null,
          billingStatus: "none",
          nextBillingDate: null,
        };
      }

      const [
        { data: workspaceRow, error: workspaceError },
        { data: conversationRow },
      ] = await Promise.all([
        supabase
          .from("workspaces")
          .select("id, name")
          .eq("id", profile.workspace_id)
          .maybeSingle(),
        supabase
          .from("conversations")
          .select("last_message_sender_name, last_message_sender_role")
          .eq("client_id", profile.id)
          .eq("workspace_id", profile.workspace_id)
          .order("last_message_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      if (workspaceError) throw workspaceError;

      const workspaceName =
        (workspaceRow as { name?: string | null } | null)?.name ?? null;
      const coachName =
        (
          conversationRow as {
            last_message_sender_name?: string | null;
            last_message_sender_role?: string | null;
          } | null
        )?.last_message_sender_role === "pt"
          ? ((
              conversationRow as {
                last_message_sender_name?: string | null;
              } | null
            )?.last_message_sender_name ?? null)
          : null;

      const providerName =
        coachName?.trim() || workspaceName?.trim() || "Coaching team";
      const serviceName = workspaceName?.trim()
        ? `${workspaceName.trim()} Coaching`
        : "Active coaching relationship";

      return {
        providerName,
        serviceName,
        priceLabel: null,
        billingStatus: "active",
        nextBillingDate: null,
      };
    },
  });

  const profileInitial = useMemo(
    () => buildInitialProfileForm(clientProfileQuery.data),
    [clientProfileQuery.data],
  );

  const preferencesInitial = useMemo(
    () =>
      buildInitialPreferencesForm({
        profile: clientProfileQuery.data,
        themePreference,
      }),
    [clientProfileQuery.data, themePreference],
  );

  const notificationsInitial = useMemo(() => {
    const source = notificationPreferencesQuery.data;
    if (!source) return defaultNotificationFormState;
    return {
      in_app_enabled: source.in_app_enabled,
      email_enabled: source.email_enabled,
      push_enabled: source.push_enabled,
      message_received: source.message_received,
      workout_assigned: source.workout_assigned,
      workout_updated: source.workout_updated,
      reminders_enabled: source.reminders_enabled,
      checkin_requested: source.checkin_requested,
      checkin_submitted: source.checkin_submitted,
      milestone_events: source.milestone_events,
      inactivity_alerts: source.inactivity_alerts,
      system_events: source.system_events,
    } satisfies NotificationFormState;
  }, [notificationPreferencesQuery.data]);

  useEffect(() => {
    setProfileForm(profileInitial);
  }, [profileInitial]);

  useEffect(() => {
    setPreferencesForm(preferencesInitial);
  }, [preferencesInitial]);

  useEffect(() => {
    setNotificationForm(notificationsInitial);
  }, [notificationsInitial]);

  const profileDirty = useMemo(
    () => JSON.stringify(profileForm) !== JSON.stringify(profileInitial),
    [profileForm, profileInitial],
  );

  const preferencesDirty = useMemo(
    () =>
      JSON.stringify(preferencesForm) !== JSON.stringify(preferencesInitial),
    [preferencesForm, preferencesInitial],
  );

  const notificationsDirty = useMemo(
    () =>
      JSON.stringify(notificationForm) !== JSON.stringify(notificationsInitial),
    [notificationForm, notificationsInitial],
  );

  const passwordTooShort = newPassword.length > 0 && newPassword.length < 8;
  const passwordMismatch =
    confirmPassword.length > 0 && newPassword !== confirmPassword;

  const invoices: Array<{ id: string; label: string; amount: string }> = [];

  const handleProfileSave = async () => {
    if (!clientProfileQuery.data?.id) return;
    if (!isValidTimezone(profileForm.timezone)) {
      setBanner({
        tone: "error",
        title: "Choose a timezone",
        description: "Select a valid timezone before saving your profile.",
      });
      return;
    }
    setProfileSaving(true);
    setBanner(null);

    const payload = {
      display_name: normalizeText(profileForm.fullName),
      full_name: normalizeText(profileForm.fullName),
      phone: normalizeText(profileForm.phone),
      date_of_birth: normalizeText(profileForm.dateOfBirth),
      dob: normalizeText(profileForm.dateOfBirth),
      gender: normalizeText(profileForm.gender),
      sex: normalizeText(profileForm.gender),
      height_value: toNumberOrNull(profileForm.heightValue),
      height_unit: normalizeText(profileForm.heightUnit),
      height_cm:
        profileForm.heightUnit === "cm"
          ? toNumberOrNull(profileForm.heightValue)
          : null,
      weight_value_current: toNumberOrNull(profileForm.weightValue),
      weight_unit: normalizeText(profileForm.weightUnit),
      current_weight: toNumberOrNull(profileForm.weightValue),
      unit_preference: profileForm.weightUnit === "lb" ? "imperial" : "metric",
      timezone: normalizeText(profileForm.timezone),
      avatar_url: normalizeText(profileForm.avatarUrl),
      photo_url: normalizeText(profileForm.avatarUrl),
      updated_at: new Date().toISOString(),
    };

    const fallbackPayload = {
      display_name: normalizeText(profileForm.fullName),
      phone: normalizeText(profileForm.phone),
      dob: normalizeText(profileForm.dateOfBirth),
      gender: normalizeText(profileForm.gender),
      height_cm: toNumberOrNull(profileForm.heightValue),
      current_weight: toNumberOrNull(profileForm.weightValue),
      unit_preference: profileForm.weightUnit === "lb" ? "imperial" : "metric",
      timezone: normalizeText(profileForm.timezone),
      photo_url: normalizeText(profileForm.avatarUrl),
      updated_at: new Date().toISOString(),
    };

    let updateError: { message?: string } | null = null;

    const primary = await supabase
      .from("clients")
      .update(payload)
      .eq("id", clientProfileQuery.data.id);

    if (primary.error && isMissingColumnError(primary.error.message)) {
      const fallback = await supabase
        .from("clients")
        .update(fallbackPayload)
        .eq("id", clientProfileQuery.data.id);
      updateError = fallback.error;
    } else {
      updateError = primary.error;
    }

    setProfileSaving(false);
    if (updateError) {
      setBanner({
        tone: "error",
        title: "Unable to save profile",
        description: updateError.message ?? "Please try again.",
      });
      return;
    }

    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: [
          "client-settings-profile",
          session?.user?.id,
          activeClientId,
        ],
      }),
      queryClient.invalidateQueries({ queryKey: ["bootstrap-auth"] }),
    ]);

    setBanner({
      tone: "success",
      title: "Profile updated",
      description: "Your account profile changes are now saved.",
    });
  };

  const handlePreferencesSave = async () => {
    setPreferencesSaving(true);
    setBanner(null);

    try {
      if (clientProfileQuery.data?.id) {
        const { error } = await supabase
          .from("clients")
          .update({
            unit_preference: preferencesForm.units,
            updated_at: new Date().toISOString(),
          })
          .eq("id", clientProfileQuery.data.id);
        if (error) throw error;
      }

      if (typeof window !== "undefined") {
        window.localStorage.setItem(
          CLIENT_DATE_FORMAT_STORAGE_KEY,
          preferencesForm.dateFormat,
        );
        window.localStorage.setItem(
          CLIENT_LANGUAGE_STORAGE_KEY,
          preferencesForm.language,
        );
      }

      await updateAppearance({
        themePreference: preferencesForm.themePreference,
        persist: true,
      });

      await queryClient.invalidateQueries({
        queryKey: [
          "client-settings-profile",
          session?.user?.id,
          activeClientId,
        ],
      });

      setBanner({
        tone: "success",
        title: "Preferences saved",
        description: "Display and app preference changes were applied.",
      });
    } catch (error) {
      setBanner({
        tone: "error",
        title: "Unable to save preferences",
        description:
          error instanceof Error
            ? error.message
            : "Please try again in a moment.",
      });
    } finally {
      setPreferencesSaving(false);
    }
  };

  const handleNotificationsSave = async () => {
    if (!user?.id) return;
    setNotificationsSaving(true);
    setBanner(null);

    try {
      await updateNotificationPreferences.mutateAsync(notificationForm);
      setBanner({
        tone: "success",
        title: "Notification settings saved",
        description: "Your inbox and reminder preferences are now updated.",
      });
    } catch (error) {
      setBanner({
        tone: "error",
        title: "Unable to save notifications",
        description:
          error instanceof Error
            ? error.message
            : "Please try again in a moment.",
      });
    } finally {
      setNotificationsSaving(false);
    }
  };

  const handleChangePassword = async () => {
    if (!session?.user?.email) return;
    if (!currentPassword) {
      setBanner({
        tone: "error",
        title: "Current password required",
        description: "Enter your current password before setting a new one.",
      });
      return;
    }
    if (newPassword.length < 8) {
      setBanner({
        tone: "error",
        title: "Password too short",
        description: "Use at least 8 characters for your new password.",
      });
      return;
    }
    if (newPassword !== confirmPassword) {
      setBanner({
        tone: "error",
        title: "Passwords do not match",
        description: "Confirm password must match the new password exactly.",
      });
      return;
    }

    setPasswordSaving(true);
    setBanner(null);
    try {
      const { data: reauthData, error: reauthError } =
        await supabase.auth.signInWithPassword({
          email: session.user.email,
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
      setBanner({
        tone: "success",
        title: "Password updated",
        description: "Your account password has been changed.",
      });
    } catch (error) {
      setBanner({
        tone: "error",
        title: "Unable to change password",
        description:
          error instanceof Error
            ? error.message
            : "Please try again in a moment.",
      });
    } finally {
      setPasswordSaving(false);
    }
  };

  const handleSignOutAllSessions = async () => {
    setSignOutSessionsSaving(true);
    setBanner(null);
    try {
      const { error } = await supabase.auth.signOut({ scope: "global" });
      if (error) throw error;
      navigate("/login", { replace: true });
    } catch (error) {
      setBanner({
        tone: "error",
        title: "Unable to sign out sessions",
        description:
          error instanceof Error
            ? error.message
            : "Please try again in a moment.",
      });
      setSignOutSessionsSaving(false);
    }
  };

  const handleRequestAccountDeletion = () => {
    const email = session?.user?.email ?? "";
    const userId = session?.user?.id ?? "";
    const subject = encodeURIComponent("Account deletion request");
    const body = encodeURIComponent(
      `Please delete my account.\n\nUser ID: ${userId}\nEmail: ${email}\n\nI understand this action is irreversible.`,
    );
    window.location.href = `mailto:support@repsync.app?subject=${subject}&body=${body}`;
    setDeleteDialogOpen(false);
  };

  const profileEmail =
    clientProfileQuery.data?.email?.trim() ||
    session?.user?.email ||
    "Not available";

  return (
    <div className="space-y-5">
      <PortalPageHeader
        title="Settings"
        subtitle="Manage your profile, preferences, and account."
      />
      <SettingsPageShell tabs={<SettingsTabs tabs={settingsTabLinks} />}>
        {banner ? (
          <StatusBanner
            variant={
              banner.tone === "error"
                ? "error"
                : banner.tone === "warning"
                  ? "warning"
                  : "success"
            }
            title={banner.title}
            description={banner.description}
          />
        ) : null}

        {activeTab === "profile" ? (
          <div className="space-y-4">
            {clientProfileQuery.isLoading ? (
              <StatusBanner
                variant="info"
                title="Loading profile"
                description="Loading your account details."
              />
            ) : clientProfileQuery.isError ? (
              <StatusBanner
                variant="error"
                title="Unable to load profile"
                description={
                  clientProfileQuery.error instanceof Error
                    ? clientProfileQuery.error.message
                    : "Could not load profile data."
                }
              />
            ) : clientProfileQuery.data ? (
              <>
                <SettingsSectionCard title="Identity">
                  <SettingsFieldRow label="Profile photo">
                    <ProfilePhotoPicker
                      onBusyChange={setPhotoUploading}
                      value={profileForm.avatarUrl}
                      onChange={(avatarUrl) =>
                        setProfileForm((prev) => ({ ...prev, avatarUrl }))
                      }
                      disabled={profileSaving}
                    />
                  </SettingsFieldRow>

                  <SettingsFieldRow
                    label="Full name"
                    htmlFor="client-settings-full-name"
                  >
                    <Input
                      id="client-settings-full-name"
                      value={profileForm.fullName}
                      onChange={(event) =>
                        setProfileForm((prev) => ({
                          ...prev,
                          fullName: event.target.value,
                        }))
                      }
                      placeholder="Your full name"
                    />
                  </SettingsFieldRow>

                  <SettingsFieldRow label="Email">
                    <DisabledSettingField value={profileEmail} />
                  </SettingsFieldRow>

                  <SettingsFieldRow
                    label="Phone number"
                    htmlFor="client-settings-phone"
                  >
                    <Input
                      id="client-settings-phone"
                      value={profileForm.phone}
                      onChange={(event) =>
                        setProfileForm((prev) => ({
                          ...prev,
                          phone: event.target.value,
                        }))
                      }
                      placeholder="+966 ..."
                    />
                  </SettingsFieldRow>
                </SettingsSectionCard>

                <SettingsSectionCard title="Personal details">
                  <SettingsFieldRow
                    label="Date of birth"
                    htmlFor="client-settings-dob"
                  >
                    <Input
                      id="client-settings-dob"
                      type="date"
                      value={profileForm.dateOfBirth}
                      onChange={(event) =>
                        setProfileForm((prev) => ({
                          ...prev,
                          dateOfBirth: event.target.value,
                        }))
                      }
                    />
                  </SettingsFieldRow>

                  <SettingsFieldRow
                    label="Gender"
                    htmlFor="client-settings-gender"
                  >
                    <Select
                      id="client-settings-gender"
                      value={profileForm.gender}
                      onChange={(event) =>
                        setProfileForm((prev) => ({
                          ...prev,
                          gender: event.target.value,
                        }))
                      }
                    >
                      <option value="">Select</option>
                      <option value="male">Male</option>
                      <option value="female">Female</option>
                      <option value="other">Other</option>
                      <option value="prefer_not_to_say">
                        Prefer not to say
                      </option>
                    </Select>
                  </SettingsFieldRow>

                  <SettingsFieldRow
                    label="Height"
                    htmlFor="client-settings-height"
                  >
                    <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_9rem]">
                      <Input
                        id="client-settings-height"
                        type="number"
                        min="0"
                        value={profileForm.heightValue}
                        onChange={(event) =>
                          setProfileForm((prev) => ({
                            ...prev,
                            heightValue: event.target.value,
                          }))
                        }
                        placeholder="170"
                      />
                      <Select
                        id="client-settings-height-unit"
                        aria-label="Height unit"
                        value={profileForm.heightUnit}
                        onChange={(event) =>
                          setProfileForm((prev) => ({
                            ...prev,
                            heightUnit: event.target.value,
                          }))
                        }
                      >
                        {HEIGHT_UNIT_OPTIONS.map((unit) => (
                          <option key={unit.value} value={unit.value}>
                            {unit.label}
                          </option>
                        ))}
                      </Select>
                    </div>
                  </SettingsFieldRow>

                  <SettingsFieldRow
                    label="Weight"
                    htmlFor="client-settings-weight"
                  >
                    <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_9rem]">
                      <Input
                        id="client-settings-weight"
                        type="number"
                        min="0"
                        value={profileForm.weightValue}
                        onChange={(event) =>
                          setProfileForm((prev) => ({
                            ...prev,
                            weightValue: event.target.value,
                          }))
                        }
                        placeholder="70"
                      />
                      <Select
                        id="client-settings-weight-unit"
                        aria-label="Weight unit"
                        value={profileForm.weightUnit}
                        onChange={(event) =>
                          setProfileForm((prev) => ({
                            ...prev,
                            weightUnit: event.target.value,
                          }))
                        }
                      >
                        {WEIGHT_UNIT_OPTIONS.map((unit) => (
                          <option key={unit.value} value={unit.value}>
                            {unit.label}
                          </option>
                        ))}
                      </Select>
                    </div>
                  </SettingsFieldRow>

                  <SettingsFieldRow
                    label="Timezone"
                    htmlFor="client-settings-timezone"
                  >
                    <TimezonePicker
                      id="client-settings-timezone"
                      value={profileForm.timezone}
                      onChange={(timezone) =>
                        setProfileForm((prev) => ({ ...prev, timezone }))
                      }
                    />
                  </SettingsFieldRow>
                </SettingsSectionCard>

                <StickySaveBar
                  isDirty={profileDirty}
                  isSaving={profileSaving || photoUploading}
                  statusText="Unsaved profile changes"
                  onDiscard={() => setProfileForm(profileInitial)}
                  onSave={handleProfileSave}
                />
              </>
            ) : (
              <EmptyStateBlock
                title="Profile not available"
                description="We could not find a client profile for this account yet."
                actions={
                  <Button
                    variant="secondary"
                    onClick={() => navigate("/app/home")}
                  >
                    Back to home
                  </Button>
                }
              />
            )}
          </div>
        ) : null}

        {activeTab === "preferences" ? (
          <div className="space-y-4">
            <SettingsSectionCard title="App preferences">
              <SettingsFieldRow label="Units">
                <Select
                  id="client-settings-units"
                  value={preferencesForm.units}
                  onChange={(event) =>
                    setPreferencesForm((prev) => ({
                      ...prev,
                      units: event.target.value,
                    }))
                  }
                >
                  <option value="metric">Metric</option>
                  <option value="imperial">Imperial</option>
                </Select>
              </SettingsFieldRow>

              <SettingsFieldRow label="Date format">
                <Select
                  id="client-settings-date-format"
                  value={preferencesForm.dateFormat}
                  onChange={(event) =>
                    setPreferencesForm((prev) => ({
                      ...prev,
                      dateFormat: event.target.value,
                    }))
                  }
                >
                  {DATE_FORMAT_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </SettingsFieldRow>

              <SettingsFieldRow label="Language">
                <Select
                  id="client-settings-language"
                  value={preferencesForm.language}
                  onChange={(event) =>
                    setPreferencesForm((prev) => ({
                      ...prev,
                      language: event.target.value,
                    }))
                  }
                >
                  {LANGUAGE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </SettingsFieldRow>

              <SettingsFieldRow label="Theme">
                <Select
                  id="client-settings-theme"
                  value={preferencesForm.themePreference}
                  onChange={(event) =>
                    setPreferencesForm((prev) => ({
                      ...prev,
                      themePreference: event.target.value as ThemePreference,
                    }))
                  }
                >
                  {AVAILABLE_THEME_PREFERENCES.map((option) => (
                    <option key={option} value={option}>
                      {option === "system"
                        ? "System default"
                        : option.charAt(0).toUpperCase() + option.slice(1)}
                    </option>
                  ))}
                </Select>
                {!LIGHT_MODE_ENABLED ? (
                  <p className="text-xs text-muted-foreground">
                    Light mode is currently disabled in this environment.
                  </p>
                ) : null}
              </SettingsFieldRow>
            </SettingsSectionCard>

            <StickySaveBar
              isDirty={preferencesDirty}
              isSaving={preferencesSaving}
              statusText="Unsaved preference changes"
              onDiscard={() => setPreferencesForm(preferencesInitial)}
              onSave={handlePreferencesSave}
            />
          </div>
        ) : null}

        {activeTab === "notifications" ? (
          <div className="space-y-4">
            <SettingsSectionCard title="Notification delivery">
              <SettingsFieldRow label="Channel defaults">
                <div className="grid gap-3 sm:grid-cols-3">
                  <NotificationToggleField
                    label="In-app"
                    description="Show notifications in your app inbox."
                    checked={notificationForm.in_app_enabled}
                    onCheckedChange={(checked) =>
                      setNotificationForm((prev) => ({
                        ...prev,
                        in_app_enabled: checked,
                      }))
                    }
                  />
                  <NotificationToggleField
                    label="Email"
                    description="Send a copy of important updates by email."
                    checked={notificationForm.email_enabled}
                    onCheckedChange={(checked) =>
                      setNotificationForm((prev) => ({
                        ...prev,
                        email_enabled: checked,
                      }))
                    }
                  />
                  <NotificationToggleField
                    label="Push"
                    description="Push notifications are not available yet. This device has not been registered."
                    disabled
                    checked={false}
                    onCheckedChange={(checked) =>
                      setNotificationForm((prev) => ({
                        ...prev,
                        push_enabled: checked,
                      }))
                    }
                  />
                </div>
              </SettingsFieldRow>
            </SettingsSectionCard>

            {notificationGroups.map((group) => (
              <SettingsSectionCard key={group.title} title={group.title}>
                <div className="grid gap-3 md:grid-cols-2">
                  {group.items.map((item) => (
                    <NotificationToggleField
                      key={item.key}
                      label={item.label}
                      description={item.description}
                      checked={notificationForm[item.key]}
                      onCheckedChange={(checked) =>
                        setNotificationForm((prev) => ({
                          ...prev,
                          [item.key]: checked,
                        }))
                      }
                    />
                  ))}
                </div>
              </SettingsSectionCard>
            ))}

            <StickySaveBar
              isDirty={notificationsDirty}
              isSaving={notificationsSaving}
              statusText="Unsaved notification changes"
              onDiscard={() => setNotificationForm(notificationsInitial)}
              onSave={handleNotificationsSave}
            />
          </div>
        ) : null}

        {activeTab === "privacy-security" ? (
          <div className="space-y-4">
            <SettingsSectionCard title="Sign-in security">
              <SettingsFieldRow label="Authentication">
                <DisabledSettingField
                  value={session?.user?.email ? "Email + password" : "Unknown"}
                />
              </SettingsFieldRow>

              <SettingsFieldRow
                label="Current password"
                htmlFor="client-settings-current-password"
              >
                <Input
                  id="client-settings-current-password"
                  type="password"
                  value={currentPassword}
                  onChange={(event) => setCurrentPassword(event.target.value)}
                  placeholder="Current password"
                />
              </SettingsFieldRow>

              <SettingsFieldRow
                label="New password"
                htmlFor="client-settings-new-password"
              >
                <Input
                  id="client-settings-new-password"
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
                htmlFor="client-settings-confirm-password"
              >
                <Input
                  id="client-settings-confirm-password"
                  type="password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  placeholder="Confirm password"
                />
                {passwordMismatch ? (
                  <p className="text-xs text-danger">Passwords do not match.</p>
                ) : null}
              </SettingsFieldRow>

              <div className="flex flex-wrap justify-end gap-2">
                <Button
                  onClick={handleChangePassword}
                  disabled={passwordSaving}
                >
                  {passwordSaving ? "Updating..." : "Change password"}
                </Button>
              </div>
            </SettingsSectionCard>

            <SettingsSectionCard title="Sessions">
              <SettingsFieldRow label="Active sessions">
                <p className="text-sm leading-6 text-muted-foreground">
                  This signs you out on all devices, including this one.
                </p>
                <div className="flex justify-end">
                  <Button
                    variant="secondary"
                    onClick={handleSignOutAllSessions}
                    disabled={signOutSessionsSaving}
                  >
                    <LogOut className="mr-2 h-4 w-4" />
                    {signOutSessionsSaving
                      ? "Signing out..."
                      : "Sign out all sessions"}
                  </Button>
                </div>
              </SettingsFieldRow>
            </SettingsSectionCard>

            <SettingsSectionCard title="Account deletion">
              <SettingsFieldRow label="Request account deletion">
                <p className="text-sm leading-6 text-muted-foreground">
                  Contact support to request account deletion or deactivation.
                </p>
                <div className="flex justify-end">
                  <Button
                    tone="danger"
                    variant="secondary"
                    className="border-danger/45 text-danger hover:bg-danger/12 hover:text-danger"
                    onClick={() => setDeleteDialogOpen(true)}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Request account deletion
                  </Button>
                </div>
              </SettingsFieldRow>
            </SettingsSectionCard>
          </div>
        ) : null}

        {activeTab === "billing" ? (
          <div className="space-y-4">
            {billingQuery.isLoading ? (
              <StatusBanner
                variant="info"
                title="Loading billing"
                description="Loading your coaching service and billing details."
              />
            ) : billingQuery.data?.billingStatus === "none" ? (
              <EmptyStateBlock
                icon={<CreditCard className="h-5 w-5" />}
                title="No paid coaching service"
                description="No paid coaching service is linked to your account."
                actions={
                  <Button onClick={() => navigate("/app/find-coach")}>
                    Find a Coach
                  </Button>
                }
              />
            ) : (
              <>
                <SettingsSectionCard title="Current service">
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <Card className="space-y-1 rounded-[18px] border border-border/70 bg-background/50 p-4">
                      <p className="field-label">Provider</p>
                      <p className="text-sm font-medium text-foreground">
                        {billingQuery.data?.providerName ?? "Coaching team"}
                      </p>
                    </Card>
                    <Card className="space-y-1 rounded-[18px] border border-border/70 bg-background/50 p-4">
                      <p className="field-label">Service</p>
                      <p className="text-sm font-medium text-foreground">
                        {billingQuery.data?.serviceName ??
                          "Active coaching service"}
                      </p>
                    </Card>
                    <Card className="space-y-1 rounded-[18px] border border-border/70 bg-background/50 p-4">
                      <p className="field-label">Price</p>
                      <p className="text-sm font-medium text-foreground">
                        {billingQuery.data?.priceLabel ?? "Not yet connected"}
                      </p>
                    </Card>
                    <Card className="space-y-1 rounded-[18px] border border-border/70 bg-background/50 p-4">
                      <p className="field-label">Next billing date</p>
                      <p className="text-sm font-medium text-foreground">
                        {formatDateLabel(
                          billingQuery.data?.nextBillingDate ?? null,
                        )}
                      </p>
                    </Card>
                  </div>
                </SettingsSectionCard>

                <SettingsSectionCard title="Billing status">
                  <SettingsFieldRow label="Status">
                    <div className="flex items-center gap-2">
                      <Badge variant="muted">Not connected</Badge>
                      <span className="text-sm text-muted-foreground">
                        Billing is not connected. Payment details are not
                        available here yet.
                      </span>
                    </div>
                  </SettingsFieldRow>
                </SettingsSectionCard>

                <SettingsSectionCard title="Invoice history">
                  {invoices.length > 0 ? (
                    <div className="space-y-2">
                      {invoices.map((invoice) => (
                        <Card
                          key={invoice.id}
                          className="flex items-center justify-between gap-3 rounded-[16px] border border-border/70 bg-background/50 p-3"
                        >
                          <div>
                            <p className="text-sm font-medium text-foreground">
                              {invoice.label}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Invoice details are not available yet.
                            </p>
                          </div>
                          <Badge variant="muted">{invoice.amount}</Badge>
                        </Card>
                      ))}
                    </div>
                  ) : (
                    <EmptyStateBlock
                      centered
                      icon={<CalendarClock className="h-4 w-4" />}
                      title="Billing is not connected"
                      description="Invoices will appear here when billing is connected."
                    />
                  )}
                </SettingsSectionCard>

                <SettingsSectionCard title="Payment method">
                  <SettingsFieldRow label="Saved card">
                    <p className="text-sm text-muted-foreground">
                      No payment method is connected.
                    </p>
                  </SettingsFieldRow>
                </SettingsSectionCard>
              </>
            )}
          </div>
        ) : null}
      </SettingsPageShell>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Request account deletion?</AlertDialogTitle>
            <AlertDialogDescription>
              Send a deletion request to support. This does not delete your
              account immediately.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button
              tone="danger"
              variant="secondary"
              className="border-danger/45 text-danger hover:bg-danger/12 hover:text-danger"
              onClick={handleRequestAccountDeletion}
            >
              Continue
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

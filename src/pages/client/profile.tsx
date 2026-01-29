import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Alert, AlertDescription, AlertTitle } from "../../components/ui/alert";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";
import { Input } from "../../components/ui/input";
import { Skeleton } from "../../components/ui/skeleton";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../lib/auth";

const goalOptions = [
  "Lose fat",
  "Maintain",
  "Build muscle",
  "Strength/performance",
  "Prep for show/competition",
];

const genderOptions = ["Male", "Female", "Prefer not to say"];

const unitOptions = ["Metric", "Imperial"];

const locationOptions = [
  "Qatar",
  "UAE",
  "Saudi Arabia",
  "Kuwait",
  "Bahrain",
  "Oman",
  "Egypt",
  "Jordan",
  "Lebanon",
  "UK",
  "USA",
  "Canada",
  "Australia",
  "Other",
];

const timezoneByCountry: Record<string, string> = {
  Qatar: "Asia/Qatar",
  UAE: "Asia/Dubai",
  "Saudi Arabia": "Asia/Riyadh",
  Kuwait: "Asia/Kuwait",
  Bahrain: "Asia/Bahrain",
  Oman: "Asia/Muscat",
  Egypt: "Africa/Cairo",
  Jordan: "Asia/Amman",
  Lebanon: "Asia/Beirut",
  UK: "Europe/London",
  USA: "America/New_York",
  Canada: "America/Toronto",
  Australia: "Australia/Sydney",
};

const fallbackText: Record<string, string> = {
  display_name: "Add a display name so your coach knows how to address you.",
  email: "Add an email for training updates and reminders.",
  phone: "Add a number so your coach can reach you quickly.",
  location: "Choose a country so your coach knows your timezone.",
  timezone: "Timezone will update when you pick a country.",
  unit_preference: "Choose metric or imperial units.",
  dob: "Add your birthdate for personalized programming.",
  gender: "Share your gender to tailor training.",
  gym_name: "Add your gym name or training space.",
  days_per_week: "Share how many days per week you can train.",
  training_type: "PT will set your training type.",
  goal: "Share your goal so your coach can plan around it.",
  injuries: "List any injuries so workouts stay safe.",
  limitations: "Share any limitations to keep training safe.",
  height_cm: "Add your height for better tracking.",
  current_weight: "Add your current weight for progress tracking.",
};

type ClientProfile = {
  id: string;
  workspace_id: string | null;
  user_id: string | null;
  status: string | null;
  display_name: string | null;
  goal: string | null;
  injuries: string | null;
  limitations: string | null;
  height_cm: number | null;
  current_weight: number | null;
  days_per_week: number | null;
  dob: string | null;
  created_at: string | null;
  phone: string | null;
  location: string | null;
  timezone: string | null;
  unit_preference: string | null;
  gender: string | null;
  training_type: string | null;
  gym_name: string | null;
  photo_url: string | null;
  updated_at: string | null;
  tags: string[] | string | null;
};

type ProfileFormState = {
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

const toInput = (value: string | number | null | undefined) =>
  value === null || value === undefined ? "" : String(value);

const formatDisplayValue = (value: string | null | undefined, fallback: string) =>
  value && value.trim().length > 0 ? value : fallback;

const formatNumberValue = (value: number | null | undefined, fallback: string) =>
  typeof value === "number" && !Number.isNaN(value) ? String(value) : fallback;

const formatDateValue = (value: string | null | undefined, fallback: string) => {
  if (!value) return fallback;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return fallback;
  return parsed.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};

const getInitials = (name: string | null | undefined) => {
  if (!name) return "CP";
  const parts = name.trim().split(" ").filter(Boolean);
  if (parts.length === 0) return "CP";
  if (parts.length === 1) return parts[0][0]?.toUpperCase() ?? "C";
  return `${parts[0][0] ?? "C"}${parts[parts.length - 1][0] ?? "P"}`.toUpperCase();
};

const getTimezoneForCountry = (country: string) => {
  if (!country) return Intl.DateTimeFormat().resolvedOptions().timeZone;
  if (timezoneByCountry[country]) return timezoneByCountry[country];
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
};

const stripUndefined = (payload: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(payload).filter(([, value]) => value !== undefined));

const toNumberOrNull = (value: string) => {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? null : parsed;
};

export function ClientProfilePage() {
  const navigate = useNavigate();
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const [profile, setProfile] = useState<ClientProfile | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [formState, setFormState] = useState<ProfileFormState>({
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
  });
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving">("idle");
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastVariant, setToastVariant] = useState<"success" | "error">("success");
  const [inlineError, setInlineError] = useState<string | null>(null);

  const clientQuery = useQuery({
    queryKey: ["client-profile", session?.user?.id],
    enabled: !!session?.user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select(
          "id, workspace_id, user_id, status, display_name, goal, injuries, limitations, height_cm, current_weight, days_per_week, dob, created_at, phone, location, timezone, unit_preference, gender, training_type, gym_name, photo_url, updated_at, tags"
        )
        .eq("user_id", session?.user?.id ?? "")
        .maybeSingle();
      if (error) throw error;
      return data as ClientProfile | null;
    },
  });

  useEffect(() => {
    setProfile(clientQuery.data ?? null);
  }, [clientQuery.data]);

  useEffect(() => {
    if (!profile) return;
    setFormState({
      display_name: toInput(profile.display_name),
      phone: toInput(profile.phone),
      location: toInput(profile.location),
      timezone: toInput(profile.timezone || getTimezoneForCountry(profile.location ?? "")),
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
  }, [profile, editOpen]);

  useEffect(() => {
    if (!toastMessage) return;
    const timer = window.setTimeout(() => setToastMessage(null), 3000);
    return () => window.clearTimeout(timer);
  }, [toastMessage]);

  const handleCountryChange = (value: string) => {
    const timezone = getTimezoneForCountry(value);
    setFormState((prev) => ({ ...prev, location: value, timezone }));
  };

  const uploadPhotoIfNeeded = async (clientId: string) => {
    if (!photoFile) return { url: null, error: null };
    const fileExt = photoFile.name.split(".").pop() || "jpg";
    const filePath = `clients/${clientId}/${Date.now()}.${fileExt}`;

    const { error: uploadError } = await supabase
      .storage
      .from("client-photos")
      .upload(filePath, photoFile, { upsert: true });

    if (uploadError) {
      return { url: null, error: uploadError };
    }

    const { data } = supabase.storage.from("client-photos").getPublicUrl(filePath);
    return { url: data.publicUrl, error: null };
  };

  const handleSave = async () => {
    if (!profile) return;
    setSaveStatus("saving");
    setInlineError(null);

    let photoUrl: string | null | undefined = undefined;
    if (photoFile) {
      const { url, error } = await uploadPhotoIfNeeded(profile.id);
      if (error) {
        setToastVariant("error");
        setToastMessage("Photo upload coming soon.");
      } else {
        photoUrl = url;
      }
    }

    const payload = stripUndefined({
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
      photo_url: photoUrl,
      updated_at: new Date().toISOString(),
    });

    const { data, error } = await supabase
      .from("clients")
      .update(payload)
      .eq("id", profile.id)
      .select("*")
      .maybeSingle();

    if (error) {
      setToastVariant("error");
      setToastMessage("Failed to update profile.");
      setInlineError(error.message ?? "Failed to update profile.");
      setSaveStatus("idle");
      return;
    }

    let nextProfile = data as ClientProfile | null;
    if (!nextProfile) {
      const { data: fallbackData, error: fallbackError } = await supabase
        .from("clients")
        .select("*")
        .eq("user_id", session?.user?.id ?? "")
        .maybeSingle();
      if (fallbackError) {
        setToastVariant("error");
        setToastMessage("Failed to refresh profile.");
        setInlineError(
          fallbackError.message ?? "Client record not accessible (RLS) or not found."
        );
        setSaveStatus("idle");
        return;
      }
      nextProfile = fallbackData as ClientProfile | null;
    }

    if (!nextProfile) {
      setToastVariant("error");
      setToastMessage("Profile updated, but refresh failed.");
      setInlineError("Client record not accessible (RLS) or not found.");
      setSaveStatus("idle");
      return;
    }

    setProfile(nextProfile);
    setToastVariant("success");
    setToastMessage("Profile updated.");
    setSaveStatus("idle");
    setEditOpen(false);
    setPhotoFile(null);
    queryClient.invalidateQueries({ queryKey: ["client-profile"] });
    queryClient.invalidateQueries({ queryKey: ["client", session?.user?.id] });
    queryClient.invalidateQueries({ queryKey: ["pt-client", profile.id] });
    queryClient.invalidateQueries({ queryKey: ["pt-client"] });
  };

  const identityFields = useMemo(
    () => [
      {
        label: "Display name",
        value: formatDisplayValue(profile?.display_name ?? null, fallbackText.display_name),
      },
      {
        label: "Email",
        value: formatDisplayValue(session?.user?.email ?? null, fallbackText.email),
      },
      {
        label: "Phone",
        value: formatDisplayValue(profile?.phone ?? null, fallbackText.phone),
      },
      {
        label: "Country",
        value: formatDisplayValue(profile?.location ?? null, fallbackText.location),
      },
      {
        label: "Timezone",
        value: formatDisplayValue(profile?.timezone ?? null, fallbackText.timezone),
      },
      {
        label: "Units",
        value: formatDisplayValue(profile?.unit_preference ?? null, fallbackText.unit_preference),
      },
      {
        label: "Birthdate",
        value: formatDateValue(profile?.dob ?? null, fallbackText.dob),
      },
      {
        label: "Gender",
        value: formatDisplayValue(profile?.gender ?? null, fallbackText.gender),
      },
    ],
    [profile, session?.user?.email]
  );

  const trainingFields = useMemo(
    () => [
      {
        label: "Training type",
        value: formatDisplayValue(profile?.training_type ?? null, fallbackText.training_type),
      },
      {
        label: "Gym",
        value: formatDisplayValue(profile?.gym_name ?? null, fallbackText.gym_name),
      },
      {
        label: "Days per week",
        value: formatNumberValue(profile?.days_per_week ?? null, fallbackText.days_per_week),
      },
    ],
    [profile]
  );

  const healthFields = useMemo(
    () => [
      {
        label: "Goal",
        value: formatDisplayValue(profile?.goal ?? null, fallbackText.goal),
      },
      {
        label: "Injuries",
        value: formatDisplayValue(profile?.injuries ?? null, fallbackText.injuries),
      },
      {
        label: "Limitations",
        value: formatDisplayValue(profile?.limitations ?? null, fallbackText.limitations),
      },
      {
        label: "Height (cm)",
        value: formatNumberValue(profile?.height_cm ?? null, fallbackText.height_cm),
      },
      {
        label: "Current weight",
        value: formatNumberValue(profile?.current_weight ?? null, fallbackText.current_weight),
      },
    ],
    [profile]
  );

  return (
    <div className="space-y-6 pb-16 md:pb-0">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Profile</h1>
          <p className="text-sm text-muted-foreground">
            Keep your profile current so your coach can tailor your plan.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={() => navigate("/app/messages")}>Message coach</Button>
          <Button onClick={() => setEditOpen(true)} disabled={!profile}>Edit Profile</Button>
        </div>
      </div>

      {toastMessage ? (
        <Alert className={toastVariant === "error" ? "border-danger/30" : "border-emerald-200"}>
          <AlertTitle>{toastVariant === "error" ? "Update failed" : "Saved"}</AlertTitle>
          <AlertDescription>{toastMessage}</AlertDescription>
        </Alert>
      ) : null}

      {inlineError ? (
        <Alert className="border-danger/30">
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{inlineError}</AlertDescription>
        </Alert>
      ) : null}

      {clientQuery.isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : clientQuery.error ? (
        <Alert className="border-danger/30">
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>
            {clientQuery.error instanceof Error
              ? clientQuery.error.message
              : "Failed to load profile."}
          </AlertDescription>
        </Alert>
      ) : !profile ? (
        <Card>
          <CardContent className="space-y-2 py-6 text-sm text-muted-foreground">
            Client record not accessible (RLS) or not found.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          <Card>
            <CardHeader className="flex flex-row items-start justify-between gap-4">
              <div>
                <CardTitle>Identity & Preferences</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Keep the basics up to date for smoother coaching.
                </p>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex h-14 w-14 items-center justify-center rounded-full border border-border bg-muted/40 text-sm font-semibold text-muted-foreground">
                  {profile.photo_url ? (
                    <img
                      src={profile.photo_url}
                      alt={profile.display_name ?? "Client"}
                      className="h-full w-full rounded-full object-cover"
                    />
                  ) : (
                    getInitials(profile.display_name)
                  )}
                </div>
                <div className="text-xs text-muted-foreground">Profile photo</div>
              </div>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              {identityFields.map((field) => (
                <div key={field.label} className="space-y-1">
                  <p className="text-xs font-semibold uppercase text-muted-foreground">
                    {field.label}
                  </p>
                  <p className="text-sm text-foreground">{field.value}</p>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Training Context</CardTitle>
              <p className="text-sm text-muted-foreground">
                Share how and where you train so programming fits your reality.
              </p>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              {trainingFields.map((field) => (
                <div key={field.label} className="space-y-1">
                  <p className="text-xs font-semibold uppercase text-muted-foreground">
                    {field.label}
                  </p>
                  {field.label === "Training type" ? (
                    <Badge variant="secondary">{field.value}</Badge>
                  ) : (
                    <p className="text-sm text-foreground">{field.value}</p>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Health & Goals</CardTitle>
              <p className="text-sm text-muted-foreground">
                Help us protect your body while pushing progress.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              {healthFields.map((field) => (
                <div key={field.label} className="space-y-1">
                  <p className="text-xs font-semibold uppercase text-muted-foreground">
                    {field.label}
                  </p>
                  <p className="text-sm text-foreground">{field.value}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-[640px]">
          <DialogHeader>
            <DialogTitle>Edit profile</DialogTitle>
            <DialogDescription>
              Update your details so your coach can tailor your plan.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <label className="text-xs font-semibold text-muted-foreground">Profile photo</label>
              <Input
                type="file"
                accept="image/*"
                onChange={(event) => setPhotoFile(event.target.files?.[0] ?? null)}
              />
              <p className="text-xs text-muted-foreground">
                Upload support is in progress. If it fails, we&apos;ll keep your current photo.
              </p>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-semibold text-muted-foreground">Display name</label>
              <Input
                value={formState.display_name}
                onChange={(event) =>
                  setFormState((prev) => ({ ...prev, display_name: event.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-semibold text-muted-foreground">Email</label>
              <Input value={session?.user?.email ?? ""} readOnly />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-semibold text-muted-foreground">Phone</label>
              <Input
                value={formState.phone}
                onChange={(event) =>
                  setFormState((prev) => ({ ...prev, phone: event.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-semibold text-muted-foreground">Country</label>
              <select
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={formState.location}
                onChange={(event) => handleCountryChange(event.target.value)}
              >
                <option value="">Select country</option>
                {locationOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-semibold text-muted-foreground">Timezone</label>
              <Input value={formState.timezone} readOnly />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-semibold text-muted-foreground">Units</label>
              <select
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={formState.unit_preference}
                onChange={(event) =>
                  setFormState((prev) => ({ ...prev, unit_preference: event.target.value }))
                }
              >
                <option value="">Select units</option>
                {unitOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-semibold text-muted-foreground">Birthdate</label>
              <Input
                type="date"
                value={formState.dob}
                onChange={(event) =>
                  setFormState((prev) => ({ ...prev, dob: event.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-semibold text-muted-foreground">Gender</label>
              <select
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={formState.gender}
                onChange={(event) =>
                  setFormState((prev) => ({ ...prev, gender: event.target.value }))
                }
              >
                <option value="">Select gender</option>
                {genderOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-semibold text-muted-foreground">Gym name</label>
              <Input
                value={formState.gym_name}
                onChange={(event) =>
                  setFormState((prev) => ({ ...prev, gym_name: event.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-semibold text-muted-foreground">Days per week</label>
              <Input
                type="number"
                min="0"
                value={formState.days_per_week}
                onChange={(event) =>
                  setFormState((prev) => ({ ...prev, days_per_week: event.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-semibold text-muted-foreground">Goal</label>
              <select
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={formState.goal}
                onChange={(event) =>
                  setFormState((prev) => ({ ...prev, goal: event.target.value }))
                }
              >
                <option value="">Select goal</option>
                {goalOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-semibold text-muted-foreground">Height (cm)</label>
              <Input
                type="number"
                min="0"
                value={formState.height_cm}
                onChange={(event) =>
                  setFormState((prev) => ({ ...prev, height_cm: event.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-semibold text-muted-foreground">Current weight</label>
              <Input
                type="number"
                min="0"
                value={formState.current_weight}
                onChange={(event) =>
                  setFormState((prev) => ({ ...prev, current_weight: event.target.value }))
                }
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <label className="text-xs font-semibold text-muted-foreground">Injuries</label>
              <textarea
                className="min-h-[96px] w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={formState.injuries}
                onChange={(event) =>
                  setFormState((prev) => ({ ...prev, injuries: event.target.value }))
                }
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <label className="text-xs font-semibold text-muted-foreground">Limitations</label>
              <textarea
                className="min-h-[96px] w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={formState.limitations}
                onChange={(event) =>
                  setFormState((prev) => ({ ...prev, limitations: event.target.value }))
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setEditOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saveStatus === "saving"}>
              {saveStatus === "saving" ? "Saving..." : "Save changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Alert, AlertDescription, AlertTitle } from "../../components/ui/alert";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "../../components/ui/dialog";
import { Input } from "../../components/ui/input";
import { Skeleton } from "../../components/ui/skeleton";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../lib/auth";

const fallbackText: Record<string, string> = {
  display_name: "Add a display name so your coach knows how to address you.",
  email: "Add an email for training updates and reminders.",
  phone: "Add a number so your coach can reach you quickly.",
  location: "Add your training location for better planning.",
  timezone: "Set your timezone so sessions land at the right time.",
  unit_preference: "Choose metric or imperial units.",
  dob: "Add your birthdate for personalized programming.",
  gender: "Share your gender to tailor training.",
  training_type: "Tell us how you like to train.",
  gym_name: "Add your gym name or training space.",
  equipment: "List the equipment you have access to.",
  tags: "Add tags like Strength, Fat loss, or Mobility.",
  goal: "Share your goal so your coach can plan around it.",
  injuries: "List any injuries so workouts stay safe.",
  limitations: "Share any limitations to keep training safe.",
};

type ClientProfile = {
  id: string;
  workspace_id: string | null;
  user_id: string | null;
  status: string | null;
  display_name: string | null;
  goal: string | null;
  injuries: string | null;
  equipment: string | null;
  height_cm: number | null;
  dob: string | null;
  tags: string[] | string | null;
  created_at: string | null;
  phone: string | null;
  email: string | null;
  location: string | null;
  timezone: string | null;
  unit_preference: string | null;
  gender: string | null;
  training_type: string | null;
  gym_name: string | null;
  photo_url: string | null;
  limitations: string | null;
  updated_at: string | null;
};

type ProfileFormState = {
  display_name: string;
  email: string;
  phone: string;
  location: string;
  timezone: string;
  unit_preference: string;
  dob: string;
  gender: string;
  training_type: string;
  gym_name: string;
  equipment: string;
  tags: string;
  goal: string;
  injuries: string;
  limitations: string;
  photo_url: string;
};

const toInput = (value: string | null | undefined) => value ?? "";

const normalizeList = (value: string[] | string | null | undefined) => {
  if (!value) return "";
  if (Array.isArray(value)) return value.join(", ");
  return value;
};

const parseList = (value: string) =>
  value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

const formatDisplayValue = (value: string | null | undefined, fallback: string) =>
  value && value.trim().length > 0 ? value : fallback;

const formatListValue = (value: string[] | string | null | undefined, fallback: string) => {
  if (!value) return fallback;
  if (Array.isArray(value)) return value.length > 0 ? value.join(", ") : fallback;
  return value.trim().length > 0 ? value : fallback;
};

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

export function ClientProfilePage() {
  const navigate = useNavigate();
  const { session } = useAuth();
  const [profile, setProfile] = useState<ClientProfile | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [formState, setFormState] = useState<ProfileFormState>({
    display_name: "",
    email: "",
    phone: "",
    location: "",
    timezone: "",
    unit_preference: "",
    dob: "",
    gender: "",
    training_type: "",
    gym_name: "",
    equipment: "",
    tags: "",
    goal: "",
    injuries: "",
    limitations: "",
    photo_url: "",
  });
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving">("idle");
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastVariant, setToastVariant] = useState<"success" | "error">("success");

  const clientQuery = useQuery({
    queryKey: ["client-profile", session?.user?.id],
    enabled: !!session?.user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select(
          "id, workspace_id, user_id, status, display_name, goal, injuries, equipment, height_cm, dob, tags, created_at, phone, email, location, timezone, unit_preference, gender, training_type, gym_name, photo_url, limitations, updated_at"
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
      email: toInput(profile.email),
      phone: toInput(profile.phone),
      location: toInput(profile.location),
      timezone: toInput(profile.timezone),
      unit_preference: toInput(profile.unit_preference),
      dob: toInput(profile.dob),
      gender: toInput(profile.gender),
      training_type: toInput(profile.training_type),
      gym_name: toInput(profile.gym_name),
      equipment: toInput(profile.equipment),
      tags: normalizeList(profile.tags),
      goal: toInput(profile.goal),
      injuries: toInput(profile.injuries),
      limitations: toInput(profile.limitations),
      photo_url: toInput(profile.photo_url),
    });
  }, [profile, editOpen]);

  useEffect(() => {
    if (!toastMessage) return;
    const timer = window.setTimeout(() => setToastMessage(null), 3000);
    return () => window.clearTimeout(timer);
  }, [toastMessage]);

  const handleSave = async () => {
    if (!profile) return;
    setSaveStatus("saving");

    const parsedTags = parseList(formState.tags);

    const payload = {
      display_name: formState.display_name.trim() || null,
      email: formState.email.trim() || null,
      phone: formState.phone.trim() || null,
      location: formState.location.trim() || null,
      timezone: formState.timezone.trim() || null,
      unit_preference: formState.unit_preference.trim() || null,
      dob: formState.dob.trim() || null,
      gender: formState.gender.trim() || null,
      training_type: formState.training_type.trim() || null,
      gym_name: formState.gym_name.trim() || null,
      equipment: formState.equipment.trim() || null,
      tags: parsedTags.length > 0 ? parsedTags : null,
      goal: formState.goal.trim() || null,
      injuries: formState.injuries.trim() || null,
      limitations: formState.limitations.trim() || null,
      photo_url: formState.photo_url.trim() || null,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from("clients")
      .update(payload)
      .eq("id", profile.id)
      .select()
      .single();

    if (error) {
      setToastVariant("error");
      setToastMessage(error.message ?? "Failed to update profile.");
      setSaveStatus("idle");
      return;
    }

    setProfile(data as ClientProfile);
    setToastVariant("success");
    setToastMessage("Profile updated.");
    setSaveStatus("idle");
    setEditOpen(false);
  };

  const identityFields = useMemo(
    () => [
      {
        label: "Display name",
        value: formatDisplayValue(profile?.display_name ?? null, fallbackText.display_name),
      },
      {
        label: "Email",
        value: formatDisplayValue(profile?.email ?? null, fallbackText.email),
      },
      {
        label: "Phone",
        value: formatDisplayValue(profile?.phone ?? null, fallbackText.phone),
      },
      {
        label: "Location",
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
    [profile]
  );

  const trainingFields = useMemo(
    () => [
      {
        label: "Training style",
        value: formatDisplayValue(profile?.training_type ?? null, fallbackText.training_type),
      },
      {
        label: "Gym",
        value: formatDisplayValue(profile?.gym_name ?? null, fallbackText.gym_name),
      },
      {
        label: "Equipment",
        value: formatListValue(profile?.equipment ?? null, fallbackText.equipment),
      },
      {
        label: "Tags",
        value: formatListValue(profile?.tags ?? null, fallbackText.tags),
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
            We couldn&apos;t find a profile yet. Ask your coach to create one.
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
                  <p className="text-sm text-foreground">{field.value}</p>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Health & Limitations</CardTitle>
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
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
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
              <Input
                value={formState.email}
                onChange={(event) =>
                  setFormState((prev) => ({ ...prev, email: event.target.value }))
                }
              />
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
              <label className="text-xs font-semibold text-muted-foreground">Location</label>
              <Input
                value={formState.location}
                onChange={(event) =>
                  setFormState((prev) => ({ ...prev, location: event.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-semibold text-muted-foreground">Timezone</label>
              <Input
                value={formState.timezone}
                onChange={(event) =>
                  setFormState((prev) => ({ ...prev, timezone: event.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-semibold text-muted-foreground">Unit preference</label>
              <select
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={formState.unit_preference}
                onChange={(event) =>
                  setFormState((prev) => ({ ...prev, unit_preference: event.target.value }))
                }
              >
                <option value="">Select units</option>
                <option value="metric">Metric</option>
                <option value="imperial">Imperial</option>
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
              <Input
                value={formState.gender}
                onChange={(event) =>
                  setFormState((prev) => ({ ...prev, gender: event.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-semibold text-muted-foreground">Training type</label>
              <Input
                value={formState.training_type}
                onChange={(event) =>
                  setFormState((prev) => ({ ...prev, training_type: event.target.value }))
                }
              />
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
            <div className="space-y-2 sm:col-span-2">
              <label className="text-xs font-semibold text-muted-foreground">Equipment</label>
              <Input
                value={formState.equipment}
                onChange={(event) =>
                  setFormState((prev) => ({ ...prev, equipment: event.target.value }))
                }
                placeholder="Dumbbells, squat rack, pull-up bar"
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <label className="text-xs font-semibold text-muted-foreground">Tags</label>
              <Input
                value={formState.tags}
                onChange={(event) => setFormState((prev) => ({ ...prev, tags: event.target.value }))}
                placeholder="Strength, Mobility"
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <label className="text-xs font-semibold text-muted-foreground">Goal</label>
              <textarea
                className="min-h-[96px] w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={formState.goal}
                onChange={(event) =>
                  setFormState((prev) => ({ ...prev, goal: event.target.value }))
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
            <div className="space-y-2 sm:col-span-2">
              <label className="text-xs font-semibold text-muted-foreground">Photo URL</label>
              <Input
                value={formState.photo_url}
                onChange={(event) =>
                  setFormState((prev) => ({ ...prev, photo_url: event.target.value }))
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

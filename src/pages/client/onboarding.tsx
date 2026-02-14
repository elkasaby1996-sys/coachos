import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Alert, AlertDescription, AlertTitle } from "../../components/ui/alert";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { Skeleton } from "../../components/ui/skeleton";
import { useAuth } from "../../lib/auth";
import { hasCompletedClientOnboarding, type ClientOnboardingProfile } from "../../lib/client-onboarding";
import { supabase } from "../../lib/supabase";

type OnboardingStep = 0 | 1 | 2 | 3 | 4 | 5;

type ClientOnboardingRow = ClientOnboardingProfile & {
  id: string;
};

type OnboardingForm = {
  display_name: string;
  dob: string;
  location: string;
  timezone: string;
  gender: string;
  gym_name: string;
  days_per_week: string;
  goal: string;
  height_cm: string;
  current_weight: string;
};

const goalOptions = ["Lose fat", "Maintain", "Build muscle", "Strength/performance", "Prep for event"];
const genderOptions = ["Male", "Female", "Non-binary", "Prefer not to say"];
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

const getTimezoneForCountry = (country: string) => {
  if (!country) return Intl.DateTimeFormat().resolvedOptions().timeZone;
  return timezoneByCountry[country] ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
};

const toInput = (value: string | number | null | undefined) =>
  value === null || value === undefined ? "" : String(value);

const toNumberOrNull = (value: string) => {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const stepMeta: Array<{ title: string; subtitle: string }> = [
  { title: "What should we call you?", subtitle: "This name is shown to your coach." },
  { title: "What is your date of birth?", subtitle: "Used to personalize your plan." },
  { title: "Where are you located?", subtitle: "We will set your timezone from your country." },
  { title: "What is your gender?", subtitle: "Optional context for tailored coaching." },
  { title: "Tell us about your training setup", subtitle: "Gym, available days, and your main goal." },
  { title: "What are your current body metrics?", subtitle: "Height and current weight." },
];

const getFirstIncompleteStep = (profile: ClientOnboardingProfile): OnboardingStep => {
  if (!(profile.display_name && profile.display_name.trim().length > 0)) return 0;
  if (!(profile.dob && profile.dob.trim().length > 0)) return 1;
  if (!(profile.location && profile.location.trim().length > 0 && profile.timezone && profile.timezone.trim().length > 0))
    return 2;
  if (!(profile.gender && profile.gender.trim().length > 0)) return 3;
  if (
    !(profile.gym_name && profile.gym_name.trim().length > 0) ||
    !(typeof profile.days_per_week === "number" && profile.days_per_week > 0) ||
    !(profile.goal && profile.goal.trim().length > 0)
  ) {
    return 4;
  }
  return 5;
};

export function ClientOnboardingPage() {
  const navigate = useNavigate();
  const { session } = useAuth();

  const [step, setStep] = useState<OnboardingStep>(0);
  const [clientId, setClientId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<OnboardingForm>({
    display_name: "",
    dob: "",
    location: "",
    timezone: "",
    gender: "",
    gym_name: "",
    days_per_week: "",
    goal: "",
    height_cm: "",
    current_weight: "",
  });

  useEffect(() => {
    let active = true;

    const load = async () => {
      if (!session?.user?.id) {
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      const { data, error: loadError } = await supabase
        .from("clients")
        .select(
          "id, display_name, dob, location, timezone, gender, gym_name, days_per_week, goal, height_cm, current_weight"
        )
        .eq("user_id", session.user.id)
        .maybeSingle();

      if (!active) return;

      if (loadError) {
        setError(loadError.message ?? "Failed to load onboarding profile.");
        setLoading(false);
        return;
      }

      if (!data) {
        setError("Client profile not found for this account.");
        setLoading(false);
        return;
      }

      const profile = data as ClientOnboardingRow;
      if (hasCompletedClientOnboarding(profile)) {
        navigate("/app/home", { replace: true });
        return;
      }

      setClientId(profile.id);
      setForm({
        display_name: toInput(profile.display_name),
        dob: toInput(profile.dob),
        location: toInput(profile.location),
        timezone: toInput(profile.timezone || getTimezoneForCountry(profile.location ?? "")),
        gender: toInput(profile.gender),
        gym_name: toInput(profile.gym_name),
        days_per_week: toInput(profile.days_per_week),
        goal: toInput(profile.goal),
        height_cm: toInput(profile.height_cm),
        current_weight: toInput(profile.current_weight),
      });
      setStep(getFirstIncompleteStep(profile));
      setLoading(false);
    };

    load();

    return () => {
      active = false;
    };
  }, [navigate, session?.user?.id]);

  const progress = useMemo(() => Math.round(((step + 1) / stepMeta.length) * 100), [step]);

  const validateStep = () => {
    switch (step) {
      case 0:
        return form.display_name.trim().length > 0 ? null : "Please enter your name.";
      case 1:
        return form.dob.trim().length > 0 ? null : "Please enter your date of birth.";
      case 2:
        if (!form.location.trim()) return "Please select your country.";
        if (!form.timezone.trim()) return "Timezone is required.";
        return null;
      case 3:
        return form.gender.trim().length > 0 ? null : "Please select your gender.";
      case 4:
        if (!form.gym_name.trim()) return "Please enter your gym name.";
        if (!toNumberOrNull(form.days_per_week)) return "Please enter training days per week.";
        if (!form.goal.trim()) return "Please select your goal.";
        return null;
      case 5:
        if (!toNumberOrNull(form.height_cm)) return "Please enter your height.";
        if (!toNumberOrNull(form.current_weight)) return "Please enter your current weight.";
        return null;
      default:
        return "Invalid step.";
    }
  };

  const buildStepPayload = () => {
    switch (step) {
      case 0:
        return { display_name: form.display_name.trim() };
      case 1:
        return { dob: form.dob.trim() };
      case 2:
        return { location: form.location.trim(), timezone: form.timezone.trim() };
      case 3:
        return { gender: form.gender.trim() };
      case 4:
        return {
          gym_name: form.gym_name.trim(),
          days_per_week: toNumberOrNull(form.days_per_week),
          goal: form.goal.trim(),
        };
      case 5:
        return {
          height_cm: toNumberOrNull(form.height_cm),
          current_weight: toNumberOrNull(form.current_weight),
        };
      default:
        return {};
    }
  };

  const saveCurrentStep = async () => {
    if (!clientId) return false;

    const validationError = validateStep();
    if (validationError) {
      setError(validationError);
      return false;
    }

    setSaving(true);
    setError(null);

    const payload = {
      ...buildStepPayload(),
      updated_at: new Date().toISOString(),
    };

    const { error: saveError } = await supabase.from("clients").update(payload).eq("id", clientId);

    setSaving(false);

    if (saveError) {
      setError(saveError.message ?? "Failed to save this step.");
      return false;
    }

    return true;
  };

  const onNext = async () => {
    const ok = await saveCurrentStep();
    if (!ok) return;

    if (step === 5) {
      navigate("/app/home", { replace: true });
      return;
    }

    setStep((prev) => (prev + 1) as OnboardingStep);
  };

  const onBack = () => {
    setError(null);
    setStep((prev) => (prev > 0 ? ((prev - 1) as OnboardingStep) : prev));
  };

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-2xl space-y-4">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-2 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6 pb-16 md:pb-0">
      <div className="space-y-2">
        <p className="text-xs uppercase tracking-[0.2em] text-primary/80">Client onboarding</p>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Let&apos;s set up your profile</h1>
        <p className="text-sm text-muted-foreground">Step {step + 1} of {stepMeta.length}</p>
        <div className="h-2 w-full rounded-full bg-muted">
          <div className="h-2 rounded-full bg-primary transition-all" style={{ width: `${progress}%` }} />
        </div>
      </div>

      <Card className="rounded-2xl border-border/70 bg-card/95 shadow-card backdrop-blur-sm">
        <CardHeader>
          <CardTitle className="text-xl">{stepMeta[step].title}</CardTitle>
          <p className="text-sm text-muted-foreground">{stepMeta[step].subtitle}</p>
        </CardHeader>
        <CardContent className="space-y-5">
          {error ? (
            <Alert className="border-danger/30 bg-danger/10">
              <AlertTitle>Fix this before continuing</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          {step === 0 ? (
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground" htmlFor="onboarding-display-name">Name</label>
              <Input
                id="onboarding-display-name"
                value={form.display_name}
                onChange={(event) => setForm((prev) => ({ ...prev, display_name: event.target.value }))}
                placeholder="e.g. Ahmed Khalid"
                autoFocus
              />
            </div>
          ) : null}

          {step === 1 ? (
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground" htmlFor="onboarding-dob">Date of birth</label>
              <Input
                id="onboarding-dob"
                type="date"
                value={form.dob}
                onChange={(event) => setForm((prev) => ({ ...prev, dob: event.target.value }))}
                autoFocus
              />
            </div>
          ) : null}

          {step === 2 ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground" htmlFor="onboarding-country">Country</label>
                <select
                  id="onboarding-country"
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={form.location}
                  onChange={(event) => {
                    const nextCountry = event.target.value;
                    setForm((prev) => ({
                      ...prev,
                      location: nextCountry,
                      timezone: getTimezoneForCountry(nextCountry),
                    }));
                  }}
                  autoFocus
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
                <label className="text-sm font-medium text-foreground" htmlFor="onboarding-timezone">Timezone</label>
                <Input id="onboarding-timezone" value={form.timezone} readOnly />
              </div>
            </div>
          ) : null}

          {step === 3 ? (
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground" htmlFor="onboarding-gender">Gender</label>
              <select
                id="onboarding-gender"
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={form.gender}
                onChange={(event) => setForm((prev) => ({ ...prev, gender: event.target.value }))}
                autoFocus
              >
                <option value="">Select gender</option>
                {genderOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          {step === 4 ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <label className="text-sm font-medium text-foreground" htmlFor="onboarding-gym-name">Gym name</label>
                <Input
                  id="onboarding-gym-name"
                  value={form.gym_name}
                  onChange={(event) => setForm((prev) => ({ ...prev, gym_name: event.target.value }))}
                  placeholder="e.g. Gold's Gym Doha"
                  autoFocus
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground" htmlFor="onboarding-days-per-week">Days per week</label>
                <Input
                  id="onboarding-days-per-week"
                  type="number"
                  min="1"
                  max="7"
                  value={form.days_per_week}
                  onChange={(event) => setForm((prev) => ({ ...prev, days_per_week: event.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground" htmlFor="onboarding-goal">Goal</label>
                <select
                  id="onboarding-goal"
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={form.goal}
                  onChange={(event) => setForm((prev) => ({ ...prev, goal: event.target.value }))}
                >
                  <option value="">Select goal</option>
                  {goalOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          ) : null}

          {step === 5 ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground" htmlFor="onboarding-height">Height (cm)</label>
                <Input
                  id="onboarding-height"
                  type="number"
                  min="1"
                  value={form.height_cm}
                  onChange={(event) => setForm((prev) => ({ ...prev, height_cm: event.target.value }))}
                  autoFocus
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground" htmlFor="onboarding-current-weight">Current weight</label>
                <Input
                  id="onboarding-current-weight"
                  type="number"
                  min="1"
                  value={form.current_weight}
                  onChange={(event) => setForm((prev) => ({ ...prev, current_weight: event.target.value }))}
                />
              </div>
            </div>
          ) : null}

          <div className="flex items-center justify-between border-t border-border/60 pt-4">
            <Button type="button" variant="secondary" onClick={onBack} disabled={step === 0 || saving}>
              Back
            </Button>
            <Button type="button" onClick={() => void onNext()} disabled={saving}>
              {saving ? "Saving..." : step === 5 ? "Finish setup" : "Continue"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

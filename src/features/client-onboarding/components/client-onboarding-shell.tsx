import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Loader2,
  Save,
  ShieldCheck,
} from "lucide-react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "../../../components/ui/alert";
import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../../../components/ui/card";
import { Input } from "../../../components/ui/input";
import { Skeleton } from "../../../components/ui/skeleton";
import { useAuth } from "../../../lib/auth";
import { formatRelativeTime } from "../../../lib/relative-time";
import { useClientOnboarding } from "../hooks/use-client-onboarding";
import {
  clientOnboardingSteps,
  getCurrentStepPayload,
  getOnboardingStatusMeta,
  getOnboardingStepHref,
  getOnboardingStepTitle,
  getPreferredOnboardingStep,
  getStepProgress,
  getUpdatedStepState,
  validateStep,
} from "../lib/client-onboarding";
import {
  getOnboardingSectionForStep,
  saveClientOnboardingDraft,
  submitClientOnboarding,
  updateClientOnboardingStepState,
} from "../lib/client-onboarding-api";
import type {
  ClientOnboardingFieldState,
  ClientOnboardingStepKey,
} from "../types";

const selectClassName =
  "h-11 w-full rounded-xl border border-border/70 bg-background px-3 text-sm text-foreground shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

const experienceOptions = [
  "Brand new",
  "Beginner",
  "Intermediate",
  "Advanced",
] as const;

const trainingFrequencyOptions = [
  "Not training currently",
  "1-2 sessions / week",
  "3-4 sessions / week",
  "5+ sessions / week",
] as const;

const confidenceOptions = [
  "Need a lot of guidance",
  "Comfortable with basics",
  "Confident training alone",
] as const;

const cookingConfidenceOptions = [
  "Very low",
  "Basic",
  "Comfortable",
  "High",
] as const;

const eatingOutOptions = [
  "Rarely",
  "1-2 times / week",
  "3-5 times / week",
  "Most days",
] as const;

const sleepQualityOptions = [
  "Poor",
  "Inconsistent",
  "Decent",
  "Strong",
] as const;

const stressLevelOptions = ["Low", "Moderate", "High", "Very high"] as const;

const trainingTimeOptions = [
  "Early morning",
  "Late morning",
  "Afternoon",
  "Evening",
  "Varies",
] as const;

const unitOptions = [
  { label: "Metric", value: "metric" },
  { label: "Imperial", value: "imperial" },
] as const;

const genderOptions = ["Male", "Female", "Prefer not to say"] as const;

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
] as const;

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

const phoneCountryCodes = [
  { label: "Qatar (+974)", value: "+974" },
  { label: "UAE (+971)", value: "+971" },
  { label: "Saudi Arabia (+966)", value: "+966" },
  { label: "Kuwait (+965)", value: "+965" },
  { label: "Bahrain (+973)", value: "+973" },
  { label: "Oman (+968)", value: "+968" },
  { label: "Egypt (+20)", value: "+20" },
  { label: "Jordan (+962)", value: "+962" },
  { label: "Lebanon (+961)", value: "+961" },
  { label: "UK (+44)", value: "+44" },
  { label: "USA (+1)", value: "+1" },
  { label: "Canada (+1)", value: "+1" },
  { label: "Australia (+61)", value: "+61" },
] as const;

function getTimezoneForCountry(country: string) {
  if (!country) return "";
  return (
    timezoneByCountry[country] ??
    Intl.DateTimeFormat().resolvedOptions().timeZone
  );
}

function splitPhoneValue(value: string) {
  const normalized = value.trim();
  if (!normalized) {
    return { countryCode: "+966", localNumber: "" };
  }

  const matchedCode = phoneCountryCodes.find((option) =>
    normalized.startsWith(option.value),
  );

  if (!matchedCode) {
    return { countryCode: "+966", localNumber: normalized };
  }

  return {
    countryCode: matchedCode.value,
    localNumber: normalized.slice(matchedCode.value.length).trim(),
  };
}

function buildPhoneValue(countryCode: string, localNumber: string) {
  const trimmedLocalNumber = localNumber.trim();
  if (!trimmedLocalNumber) return "";
  return `${countryCode} ${trimmedLocalNumber}`.trim();
}

function FieldLabel({
  label,
  required = false,
  optional = false,
}: {
  label: string;
  required?: boolean;
  optional?: boolean;
}) {
  return (
    <div className="mb-2 flex items-center gap-2">
      <label className="text-sm font-medium text-foreground">{label}</label>
      {required ? <Badge variant="secondary">Required</Badge> : null}
      {optional ? <Badge variant="muted">Optional</Badge> : null}
    </div>
  );
}

function StepField({
  label,
  required,
  optional,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  optional?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <FieldLabel label={label} required={required} optional={optional} />
      {children}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function toReviewValue(value: unknown) {
  if (Array.isArray(value)) {
    return value.filter(Boolean).join(", ") || "Not provided";
  }
  if (typeof value === "number") return String(value);
  if (typeof value === "string") return value.trim() || "Not provided";
  return "Not provided";
}

export function ClientOnboardingShell() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const onboardingQuery = useClientOnboarding();
  const summary = onboardingQuery.data ?? null;

  const [draft, setDraft] = useState<ClientOnboardingFieldState | null>(null);
  const [saveState, setSaveState] = useState<
    "idle" | "saving" | "autosaving" | "error" | "saved"
  >("idle");
  const [submitState, setSubmitState] = useState<
    "idle" | "saving" | "success" | "error"
  >("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const autosaveRef = useRef<number | null>(null);
  const hydratedRef = useRef(false);
  const hydratedOnboardingIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!summary) return;
    if (
      hydratedOnboardingIdRef.current === summary.onboarding.id &&
      hydratedRef.current
    ) {
      return;
    }
    setDraft({
      basics: {
        display_name:
          summary.onboarding.basics?.display_name ??
          summary.client.display_name ??
          "",
        phone: summary.onboarding.basics?.phone ?? summary.client.phone ?? "",
        email:
          summary.onboarding.basics?.email ??
          summary.client.email ??
          user?.email ??
          "",
        location:
          summary.onboarding.basics?.location_country ??
          summary.onboarding.basics?.location ??
          summary.client.location_country ??
          summary.client.location ??
          "",
        timezone:
          summary.onboarding.basics?.timezone ??
          summary.client.timezone ??
          getTimezoneForCountry(
            summary.onboarding.basics?.location_country ??
              summary.onboarding.basics?.location ??
              summary.client.location_country ??
              summary.client.location ??
              "",
          ),
        gender:
          summary.onboarding.basics?.gender ?? summary.client.gender ?? "",
        unit_preference:
          summary.onboarding.basics?.unit_preference ??
          summary.client.unit_preference ??
          "",
      },
      goals: {
        goal: summary.onboarding.goals?.goal ?? summary.client.goal ?? "",
        secondary_goals: Array.isArray(
          summary.onboarding.goals?.secondary_goals,
        )
          ? summary.onboarding.goals?.secondary_goals.join("\n")
          : "",
        motivation: summary.onboarding.goals?.motivation ?? "",
      },
      trainingHistory: {
        experience_level:
          summary.onboarding.training_history?.experience_level ?? "",
        current_training_frequency:
          summary.onboarding.training_history?.current_training_frequency ?? "",
        equipment:
          summary.onboarding.training_history?.equipment ??
          summary.client.equipment ??
          "",
        gym_name:
          summary.onboarding.training_history?.gym_name ??
          summary.client.gym_name ??
          "",
        current_training_routine:
          summary.onboarding.training_history?.current_training_routine ?? "",
        confidence_level:
          summary.onboarding.training_history?.confidence_level ?? "",
        days_per_week:
          summary.onboarding.training_history?.days_per_week === null ||
          summary.onboarding.training_history?.days_per_week === undefined
            ? summary.client.days_per_week === null ||
              summary.client.days_per_week === undefined
              ? ""
              : String(summary.client.days_per_week)
            : String(summary.onboarding.training_history?.days_per_week),
      },
      injuriesLimitations: {
        injuries:
          summary.onboarding.injuries_limitations?.injuries ??
          summary.client.injuries ??
          "",
        limitations:
          summary.onboarding.injuries_limitations?.limitations ??
          summary.client.limitations ??
          "",
        exercises_to_avoid:
          summary.onboarding.injuries_limitations?.exercises_to_avoid ?? "",
        surgeries_history:
          summary.onboarding.injuries_limitations?.surgeries_history ?? "",
      },
      nutritionLifestyle: {
        dietary_preferences:
          summary.onboarding.nutrition_lifestyle?.dietary_preferences ?? "",
        allergies: summary.onboarding.nutrition_lifestyle?.allergies ?? "",
        foods_avoided: Array.isArray(
          summary.onboarding.nutrition_lifestyle?.foods_avoided,
        )
          ? summary.onboarding.nutrition_lifestyle?.foods_avoided.join("\n")
          : "",
        cooking_confidence:
          summary.onboarding.nutrition_lifestyle?.cooking_confidence ?? "",
        eating_out_frequency:
          summary.onboarding.nutrition_lifestyle?.eating_out_frequency ?? "",
        sleep_quality:
          summary.onboarding.nutrition_lifestyle?.sleep_quality ?? "",
        stress_level:
          summary.onboarding.nutrition_lifestyle?.stress_level ?? "",
        schedule_constraints:
          summary.onboarding.nutrition_lifestyle?.schedule_constraints ?? "",
        preferred_training_time:
          summary.onboarding.nutrition_lifestyle?.preferred_training_time ?? "",
      },
    });
    hydratedRef.current = true;
    hydratedOnboardingIdRef.current = summary.onboarding.id;
  }, [summary, user?.email]);

  const currentStep = useMemo(() => {
    const requested = getPreferredOnboardingStep(searchParams.get("step"));
    if (requested) return requested;
    return summary?.resumeStep ?? "basics";
  }, [searchParams, summary?.resumeStep]);

  useEffect(() => {
    if (!summary) return;
    const requested = getPreferredOnboardingStep(searchParams.get("step"));
    if (requested) return;
    setSearchParams({ step: summary.resumeStep }, { replace: true });
  }, [searchParams, setSearchParams, summary]);

  const progress = useMemo(() => {
    if (!draft || !summary) return null;
    return getStepProgress({
      draft,
      latestSubmittedBaseline: summary.latestSubmittedBaseline,
      linkedSubmittedBaseline: summary.linkedSubmittedBaseline,
    });
  }, [draft, summary]);

  useEffect(() => {
    if (!summary || !progress || !summary.canEdit) return;
    if (progress.basics.complete || currentStep === "basics") return;
    setSearchParams({ step: "basics" }, { replace: true });
  }, [currentStep, progress, setSearchParams, summary]);

  const completionPercent = useMemo(() => {
    if (!progress) return summary?.completionPercent ?? 0;
    const completedCount = Object.values(progress).filter(
      (step) => step.complete,
    ).length;
    return Math.round((completedCount / clientOnboardingSteps.length) * 100);
  }, [progress, summary?.completionPercent]);

  const baselineStepHref = useMemo(() => {
    const returnTo = encodeURIComponent(
      getOnboardingStepHref("initial-assessment"),
    );
    return `/app/baseline?onboarding=1&returnTo=${returnTo}`;
  }, []);

  const saveStepDraft = useCallback(
    async (mode: "manual" | "autosave" = "manual") => {
      if (!summary || !draft || !progress) return false;

      const section = getOnboardingSectionForStep(currentStep);
      if (!section) {
        const nextStepState = getUpdatedStepState({
          previous: summary.onboarding.step_state,
          progress,
          currentStep,
        });
        await updateClientOnboardingStepState({
          onboardingId: summary.onboarding.id,
          stepState: nextStepState,
          status:
            summary.onboarding.status === "invited" ? "in_progress" : undefined,
        });
        await queryClient.invalidateQueries({
          queryKey: ["client-workspace-onboarding"],
        });
        return true;
      }

      const payload = getCurrentStepPayload(currentStep, draft);
      if (!payload) return false;

      setSaveState(mode === "autosave" ? "autosaving" : "saving");
      setErrorMessage(null);

      try {
        const nextStepState = getUpdatedStepState({
          previous: summary.onboarding.step_state,
          progress,
          currentStep,
        });

        await saveClientOnboardingDraft({
          onboardingId: summary.onboarding.id,
          status: summary.onboarding.status,
          section,
          value: payload,
          stepState: nextStepState,
        });

        await queryClient.invalidateQueries({
          queryKey: ["client-workspace-onboarding"],
        });

        setSaveState("saved");
        if (mode === "manual") {
          setSuccessMessage("Draft saved.");
        }
        window.setTimeout(() => setSaveState("idle"), 1200);
        return true;
      } catch (error) {
        setSaveState("error");
        setErrorMessage(
          error instanceof Error ? error.message : "Unable to save draft.",
        );
        return false;
      }
    },
    [currentStep, draft, progress, queryClient, summary],
  );

  useEffect(() => {
    if (!summary || !draft || !progress || !summary.canEdit) return;
    const section = getOnboardingSectionForStep(currentStep);
    if (!section || !hydratedRef.current) return;

    if (autosaveRef.current !== null) {
      window.clearTimeout(autosaveRef.current);
    }

    autosaveRef.current = window.setTimeout(() => {
      void saveStepDraft("autosave");
    }, 1000);

    return () => {
      if (autosaveRef.current !== null) {
        window.clearTimeout(autosaveRef.current);
        autosaveRef.current = null;
      }
    };
  }, [currentStep, draft, progress, saveStepDraft, summary, summary?.canEdit]);

  const goToStep = async (stepKey: ClientOnboardingStepKey) => {
    if (summary?.canEdit && currentStep !== stepKey) {
      await saveStepDraft("manual");
    }
    setErrorMessage(null);
    setSuccessMessage(null);
    setSearchParams({ step: stepKey });
  };

  const handleNext = async () => {
    if (!draft || !progress) return;
    const validationError = validateStep(currentStep, draft);
    if (validationError) {
      setErrorMessage(validationError);
      return;
    }

    const saved = await saveStepDraft("manual");
    if (!saved) return;

    const currentIndex = clientOnboardingSteps.findIndex(
      (step) => step.key === currentStep,
    );
    const nextStep = clientOnboardingSteps[currentIndex + 1];
    if (nextStep) {
      setSearchParams({ step: nextStep.key });
    }
  };

  const handleBack = async () => {
    if (!summary) return;
    const currentIndex = clientOnboardingSteps.findIndex(
      (step) => step.key === currentStep,
    );
    const previousStep = clientOnboardingSteps[currentIndex - 1];
    if (!previousStep) return;
    if (summary.canEdit) {
      await saveStepDraft("manual");
    }
    setSearchParams({ step: previousStep.key });
  };

  const handleSaveAndExit = async () => {
    if (summary?.canEdit) {
      await saveStepDraft("manual");
    }
    navigate("/app/home");
  };

  const handleSubmit = async () => {
    if (!summary || !draft || !progress) return;
    if (!progress["review-submit"].complete) {
      setErrorMessage(
        "Finish all required steps, including the initial assessment, before submitting.",
      );
      return;
    }

    setSubmitState("saving");
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      await saveStepDraft("manual");
      await submitClientOnboarding(summary.client.id);
      await queryClient.invalidateQueries({
        queryKey: ["client-workspace-onboarding"],
      });
      setSubmitState("success");
      setSuccessMessage("Onboarding submitted for PT review.");
    } catch (error) {
      setSubmitState("error");
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to submit onboarding right now.",
      );
    } finally {
      setSubmitState("idle");
    }
  };

  if (onboardingQuery.isLoading || !draft || !summary || !progress) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-28 w-full" />
        <div className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
          <Skeleton className="h-[520px] w-full" />
          <Skeleton className="h-[520px] w-full" />
        </div>
      </div>
    );
  }

  if (onboardingQuery.error || !summary) {
    return (
      <Alert className="border-danger/30">
        <AlertTitle>Unable to load onboarding</AlertTitle>
        <AlertDescription>
          {onboardingQuery.error instanceof Error
            ? onboardingQuery.error.message
            : "Client onboarding could not be loaded."}
        </AlertDescription>
      </Alert>
    );
  }

  const statusMeta = getOnboardingStatusMeta(summary.onboarding.status);
  const lastSavedLabel = summary.onboarding.last_saved_at
    ? `Saved ${formatRelativeTime(summary.onboarding.last_saved_at)}`
    : "Not saved yet";
  const reviewCards = [
    {
      title: "Basics",
      values: [
        ["Full name", draft.basics.display_name],
        ["Phone", draft.basics.phone],
        ["Email", draft.basics.email],
        ["Location", draft.basics.location],
        ["Timezone", draft.basics.timezone],
        ["Gender", draft.basics.gender],
        ["Units", draft.basics.unit_preference],
      ],
    },
    {
      title: "Goals",
      values: [
        ["Primary goal", draft.goals.goal],
        ["Secondary goals", draft.goals.secondary_goals],
        ["Motivation", draft.goals.motivation],
      ],
    },
    {
      title: "Training History",
      values: [
        ["Experience", draft.trainingHistory.experience_level],
        [
          "Current training frequency",
          draft.trainingHistory.current_training_frequency,
        ],
        ["Gym / equipment access", draft.trainingHistory.equipment],
        ["Training space", draft.trainingHistory.gym_name],
        ["Current routine", draft.trainingHistory.current_training_routine],
        ["Confidence", draft.trainingHistory.confidence_level],
        ["Days available", draft.trainingHistory.days_per_week],
      ],
    },
    {
      title: "Injuries / Limitations",
      values: [
        ["Current injuries", draft.injuriesLimitations.injuries],
        ["Movement limitations", draft.injuriesLimitations.limitations],
        ["Exercises to avoid", draft.injuriesLimitations.exercises_to_avoid],
        ["Surgeries / history", draft.injuriesLimitations.surgeries_history],
      ],
    },
    {
      title: "Nutrition & Lifestyle",
      values: [
        ["Dietary preferences", draft.nutritionLifestyle.dietary_preferences],
        ["Allergies / intolerances", draft.nutritionLifestyle.allergies],
        ["Foods avoided", draft.nutritionLifestyle.foods_avoided],
        ["Cooking confidence", draft.nutritionLifestyle.cooking_confidence],
        ["Eating out frequency", draft.nutritionLifestyle.eating_out_frequency],
        ["Sleep quality", draft.nutritionLifestyle.sleep_quality],
        ["Stress level", draft.nutritionLifestyle.stress_level],
        ["Routine constraints", draft.nutritionLifestyle.schedule_constraints],
        [
          "Preferred training time",
          draft.nutritionLifestyle.preferred_training_time,
        ],
      ],
    },
  ];
  const phoneParts = splitPhoneValue(draft.basics.phone);

  return (
    <section className="space-y-6">
      <Card className="border-border/70 bg-[linear-gradient(180deg,oklch(var(--card)/0.98),oklch(var(--card)/0.94))] shadow-[0_26px_72px_-50px_rgba(0,0,0,0.85)]">
        <CardContent className="space-y-5 px-5 py-5 sm:px-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={statusMeta.variant}>{statusMeta.label}</Badge>
                <Badge variant="secondary">{completionPercent}% complete</Badge>
                <Badge variant="muted">{lastSavedLabel}</Badge>
              </div>
              <div className="space-y-1.5">
                <p className="text-xs uppercase tracking-[0.24em] text-primary/80">
                  Workspace onboarding
                </p>
                <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                  Guided onboarding for your coaching workspace
                </h1>
                <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
                  Move through the steps at your own pace, save whenever you
                  want, and send everything to your coach when it is ready.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                onClick={() => void handleSaveAndExit()}
              >
                <Save className="h-4 w-4" />
                Save and finish later
              </Button>
              <Button asChild variant="ghost">
                <Link to="/app/home">Back to workspace</Link>
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs uppercase tracking-[0.18em] text-muted-foreground">
              <span>Overall progress</span>
              <span>{completionPercent}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-[width]"
                style={{ width: `${completionPercent}%` }}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {errorMessage ? (
        <Alert className="border-danger/30 bg-danger/10">
          <AlertTitle>Action needed</AlertTitle>
          <AlertDescription>{errorMessage}</AlertDescription>
        </Alert>
      ) : null}

      {successMessage ? (
        <Alert className="border-success/25 bg-success/10">
          <AlertTitle>Status</AlertTitle>
          <AlertDescription>{successMessage}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[280px_minmax(0,1fr)]">
        <Card className="border-border/70 bg-card/92">
          <CardHeader className="space-y-2">
            <CardTitle className="text-base">Steps</CardTitle>
            <p className="text-sm text-muted-foreground">
              Resume from any step. Required steps show completion only when
              enough information has been saved.
            </p>
          </CardHeader>
          <CardContent className="space-y-2">
            {clientOnboardingSteps.map((step, index) => {
              const isActive = step.key === currentStep;
              const isComplete = progress[step.key].complete;
              return (
                <button
                  key={step.key}
                  type="button"
                  onClick={() => void goToStep(step.key)}
                  className={`flex w-full items-start gap-3 rounded-2xl border px-3 py-3 text-left transition ${
                    isActive
                      ? "border-primary/30 bg-primary/8"
                      : "border-border/60 bg-background/35 hover:border-border"
                  }`}
                >
                  <div
                    className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border text-xs font-semibold ${
                      isComplete
                        ? "border-success/30 bg-success/10 text-success"
                        : isActive
                          ? "border-primary/30 bg-primary/10 text-primary"
                          : "border-border/70 bg-background text-muted-foreground"
                    }`}
                  >
                    {isComplete ? (
                      <CheckCircle2 className="h-4 w-4" />
                    ) : (
                      index + 1
                    )}
                  </div>
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium text-foreground">
                        {step.title}
                      </p>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <p className="text-xs leading-5 text-muted-foreground">
                      {step.description}
                    </p>
                  </div>
                </button>
              );
            })}
          </CardContent>
        </Card>

        <Card className="border-border/70 bg-card/95 shadow-[0_20px_60px_-46px_rgba(0,0,0,0.9)]">
          <CardHeader className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <CardTitle className="text-xl">
                  {getOnboardingStepTitle(currentStep)}
                </CardTitle>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  {
                    clientOnboardingSteps.find(
                      (step) => step.key === currentStep,
                    )?.description
                  }
                </p>
              </div>
              {saveState === "autosaving" || saveState === "saving" ? (
                <Badge variant="secondary">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Saving
                </Badge>
              ) : saveState === "saved" ? (
                <Badge variant="success">Saved</Badge>
              ) : summary.awaitingReview ? (
                <Badge variant="muted">Read only</Badge>
              ) : null}
            </div>
          </CardHeader>

          <CardContent className="space-y-6">
            {summary.awaitingReview ? (
              <div className="rounded-2xl border border-border/70 bg-secondary/18 p-5">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-border/70 bg-background/60 text-primary">
                    <ShieldCheck className="h-5 w-5" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-foreground">
                      Your onboarding is already submitted.
                    </p>
                    <p className="text-sm leading-6 text-muted-foreground">
                      You can review what you sent below while your coach works
                      through the next phase.
                    </p>
                  </div>
                </div>
              </div>
            ) : null}

            {currentStep === "basics" ? (
              <div className="grid gap-5 md:grid-cols-2">
                <StepField label="Full name" required>
                  <Input
                    value={draft.basics.display_name}
                    onChange={(event) =>
                      setDraft((prev) =>
                        prev
                          ? {
                              ...prev,
                              basics: {
                                ...prev.basics,
                                display_name: event.target.value,
                              },
                            }
                          : prev,
                      )
                    }
                    disabled={!summary.canEdit}
                    placeholder="How should your coach address you?"
                  />
                </StepField>
                <StepField label="Phone" required>
                  <div className="grid gap-3 sm:grid-cols-[180px_minmax(0,1fr)]">
                    <select
                      className={selectClassName}
                      value={phoneParts.countryCode}
                      onChange={(event) =>
                        setDraft((prev) =>
                          prev
                            ? {
                                ...prev,
                                basics: {
                                  ...prev.basics,
                                  phone: buildPhoneValue(
                                    event.target.value,
                                    phoneParts.localNumber,
                                  ),
                                },
                              }
                            : prev,
                        )
                      }
                      disabled={!summary.canEdit}
                    >
                      {phoneCountryCodes.map((option) => (
                        <option
                          key={`${option.label}-${option.value}`}
                          value={option.value}
                        >
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <Input
                      value={phoneParts.localNumber}
                      onChange={(event) =>
                        setDraft((prev) =>
                          prev
                            ? {
                                ...prev,
                                basics: {
                                  ...prev.basics,
                                  phone: buildPhoneValue(
                                    phoneParts.countryCode,
                                    event.target.value,
                                  ),
                                },
                              }
                            : prev,
                        )
                      }
                      disabled={!summary.canEdit}
                      placeholder="555123456"
                    />
                  </div>
                </StepField>
                <StepField label="Email" required>
                  <Input
                    value={draft.basics.email}
                    disabled
                    readOnly
                    placeholder="you@example.com"
                  />
                </StepField>
                <StepField label="Location" required>
                  <select
                    className={selectClassName}
                    value={draft.basics.location}
                    onChange={(event) =>
                      setDraft((prev) =>
                        prev
                          ? {
                              ...prev,
                              basics: {
                                ...prev.basics,
                                location: event.target.value,
                                timezone: getTimezoneForCountry(
                                  event.target.value,
                                ),
                              },
                            }
                          : prev,
                      )
                    }
                    disabled={!summary.canEdit}
                  >
                    <option value="">Select country</option>
                    {locationOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </StepField>
                <StepField label="Timezone" required>
                  <Input
                    value={draft.basics.timezone}
                    disabled
                    readOnly
                    placeholder="Asia/Riyadh"
                  />
                </StepField>
                <StepField label="Gender" optional>
                  <select
                    className={selectClassName}
                    value={draft.basics.gender}
                    onChange={(event) =>
                      setDraft((prev) =>
                        prev
                          ? {
                              ...prev,
                              basics: {
                                ...prev.basics,
                                gender: event.target.value,
                              },
                            }
                          : prev,
                      )
                    }
                    disabled={!summary.canEdit}
                  >
                    <option value="">Select gender</option>
                    {genderOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </StepField>
                <div className="md:col-span-2">
                  <StepField label="Unit preference" required>
                    <select
                      className={selectClassName}
                      value={draft.basics.unit_preference}
                      onChange={(event) =>
                        setDraft((prev) =>
                          prev
                            ? {
                                ...prev,
                                basics: {
                                  ...prev.basics,
                                  unit_preference: event.target.value,
                                },
                              }
                            : prev,
                        )
                      }
                      disabled={!summary.canEdit}
                    >
                      <option value="">Select units</option>
                      {unitOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </StepField>
                </div>
              </div>
            ) : null}

            {currentStep === "goals" ? (
              <div className="grid gap-5">
                <StepField label="Primary goal" required>
                  <Input
                    value={draft.goals.goal}
                    onChange={(event) =>
                      setDraft((prev) =>
                        prev
                          ? {
                              ...prev,
                              goals: {
                                ...prev.goals,
                                goal: event.target.value,
                              },
                            }
                          : prev,
                      )
                    }
                    disabled={!summary.canEdit}
                    placeholder="Lose fat, build muscle, improve performance..."
                  />
                </StepField>
                <StepField
                  label="Secondary goals"
                  optional
                  hint="One per line if you have several."
                >
                  <textarea
                    className="min-h-[120px] w-full rounded-2xl border border-border/70 bg-background px-3 py-2.5 text-sm text-foreground shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    value={draft.goals.secondary_goals}
                    onChange={(event) =>
                      setDraft((prev) =>
                        prev
                          ? {
                              ...prev,
                              goals: {
                                ...prev.goals,
                                secondary_goals: event.target.value,
                              },
                            }
                          : prev,
                      )
                    }
                    disabled={!summary.canEdit}
                    placeholder={"Improve energy\nBuild consistency"}
                  />
                </StepField>
                <StepField
                  label="Motivation / what success looks like"
                  required
                >
                  <textarea
                    className="min-h-[150px] w-full rounded-2xl border border-border/70 bg-background px-3 py-2.5 text-sm text-foreground shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    value={draft.goals.motivation}
                    onChange={(event) =>
                      setDraft((prev) =>
                        prev
                          ? {
                              ...prev,
                              goals: {
                                ...prev.goals,
                                motivation: event.target.value,
                              },
                            }
                          : prev,
                      )
                    }
                    disabled={!summary.canEdit}
                    placeholder="What outcome matters most to you, and why now?"
                  />
                </StepField>
              </div>
            ) : null}

            {currentStep === "training-history" ? (
              <div className="grid gap-5 md:grid-cols-2">
                <StepField label="Training experience" required>
                  <select
                    className={selectClassName}
                    value={draft.trainingHistory.experience_level}
                    onChange={(event) =>
                      setDraft((prev) =>
                        prev
                          ? {
                              ...prev,
                              trainingHistory: {
                                ...prev.trainingHistory,
                                experience_level: event.target.value,
                              },
                            }
                          : prev,
                      )
                    }
                    disabled={!summary.canEdit}
                  >
                    <option value="">Select level</option>
                    {experienceOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </StepField>
                <StepField label="Current training frequency" required>
                  <select
                    className={selectClassName}
                    value={draft.trainingHistory.current_training_frequency}
                    onChange={(event) =>
                      setDraft((prev) =>
                        prev
                          ? {
                              ...prev,
                              trainingHistory: {
                                ...prev.trainingHistory,
                                current_training_frequency: event.target.value,
                              },
                            }
                          : prev,
                      )
                    }
                    disabled={!summary.canEdit}
                  >
                    <option value="">Select frequency</option>
                    {trainingFrequencyOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </StepField>
                <div className="md:col-span-2">
                  <StepField
                    label="Gym / equipment access"
                    required
                    hint="Explain where you train and what equipment you reliably have."
                  >
                    <textarea
                      className="min-h-[130px] w-full rounded-2xl border border-border/70 bg-background px-3 py-2.5 text-sm text-foreground shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      value={draft.trainingHistory.equipment}
                      onChange={(event) =>
                        setDraft((prev) =>
                          prev
                            ? {
                                ...prev,
                                trainingHistory: {
                                  ...prev.trainingHistory,
                                  equipment: event.target.value,
                                },
                              }
                            : prev,
                        )
                      }
                      disabled={!summary.canEdit}
                      placeholder="Commercial gym, dumbbells up to 30kg, cable machine..."
                    />
                  </StepField>
                </div>
                <StepField label="Training space / gym name" optional>
                  <Input
                    value={draft.trainingHistory.gym_name}
                    onChange={(event) =>
                      setDraft((prev) =>
                        prev
                          ? {
                              ...prev,
                              trainingHistory: {
                                ...prev.trainingHistory,
                                gym_name: event.target.value,
                              },
                            }
                          : prev,
                      )
                    }
                    disabled={!summary.canEdit}
                    placeholder="Optional"
                  />
                </StepField>
                <StepField label="Confidence level" optional>
                  <select
                    className={selectClassName}
                    value={draft.trainingHistory.confidence_level}
                    onChange={(event) =>
                      setDraft((prev) =>
                        prev
                          ? {
                              ...prev,
                              trainingHistory: {
                                ...prev.trainingHistory,
                                confidence_level: event.target.value,
                              },
                            }
                          : prev,
                      )
                    }
                    disabled={!summary.canEdit}
                  >
                    <option value="">Select confidence</option>
                    {confidenceOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </StepField>
                <StepField label="Days available per week" required>
                  <Input
                    type="number"
                    min="1"
                    max="7"
                    value={draft.trainingHistory.days_per_week}
                    onChange={(event) =>
                      setDraft((prev) =>
                        prev
                          ? {
                              ...prev,
                              trainingHistory: {
                                ...prev.trainingHistory,
                                days_per_week: event.target.value,
                              },
                            }
                          : prev,
                      )
                    }
                    disabled={!summary.canEdit}
                    placeholder="4"
                  />
                </StepField>
                <div className="md:col-span-2">
                  <StepField label="Current training routine" optional>
                    <textarea
                      className="min-h-[120px] w-full rounded-2xl border border-border/70 bg-background px-3 py-2.5 text-sm text-foreground shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      value={draft.trainingHistory.current_training_routine}
                      onChange={(event) =>
                        setDraft((prev) =>
                          prev
                            ? {
                                ...prev,
                                trainingHistory: {
                                  ...prev.trainingHistory,
                                  current_training_routine: event.target.value,
                                },
                              }
                            : prev,
                        )
                      }
                      disabled={!summary.canEdit}
                      placeholder="Optional notes about what you're doing right now."
                    />
                  </StepField>
                </div>
              </div>
            ) : null}

            {currentStep === "injuries-limitations" ? (
              <div className="grid gap-5">
                <StepField
                  label="Current injuries"
                  required
                  hint="Write 'None' if not applicable."
                >
                  <textarea
                    className="min-h-[120px] w-full rounded-2xl border border-border/70 bg-background px-3 py-2.5 text-sm text-foreground shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    value={draft.injuriesLimitations.injuries}
                    onChange={(event) =>
                      setDraft((prev) =>
                        prev
                          ? {
                              ...prev,
                              injuriesLimitations: {
                                ...prev.injuriesLimitations,
                                injuries: event.target.value,
                              },
                            }
                          : prev,
                      )
                    }
                    disabled={!summary.canEdit}
                  />
                </StepField>
                <StepField
                  label="Movement limitations"
                  required
                  hint="Write 'None' if not applicable."
                >
                  <textarea
                    className="min-h-[120px] w-full rounded-2xl border border-border/70 bg-background px-3 py-2.5 text-sm text-foreground shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    value={draft.injuriesLimitations.limitations}
                    onChange={(event) =>
                      setDraft((prev) =>
                        prev
                          ? {
                              ...prev,
                              injuriesLimitations: {
                                ...prev.injuriesLimitations,
                                limitations: event.target.value,
                              },
                            }
                          : prev,
                      )
                    }
                    disabled={!summary.canEdit}
                  />
                </StepField>
                <StepField
                  label="Exercises to avoid"
                  required
                  hint="Write 'None' if not applicable."
                >
                  <textarea
                    className="min-h-[120px] w-full rounded-2xl border border-border/70 bg-background px-3 py-2.5 text-sm text-foreground shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    value={draft.injuriesLimitations.exercises_to_avoid}
                    onChange={(event) =>
                      setDraft((prev) =>
                        prev
                          ? {
                              ...prev,
                              injuriesLimitations: {
                                ...prev.injuriesLimitations,
                                exercises_to_avoid: event.target.value,
                              },
                            }
                          : prev,
                      )
                    }
                    disabled={!summary.canEdit}
                  />
                </StepField>
                <StepField label="Surgeries / injury history" optional>
                  <textarea
                    className="min-h-[120px] w-full rounded-2xl border border-border/70 bg-background px-3 py-2.5 text-sm text-foreground shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    value={draft.injuriesLimitations.surgeries_history}
                    onChange={(event) =>
                      setDraft((prev) =>
                        prev
                          ? {
                              ...prev,
                              injuriesLimitations: {
                                ...prev.injuriesLimitations,
                                surgeries_history: event.target.value,
                              },
                            }
                          : prev,
                      )
                    }
                    disabled={!summary.canEdit}
                  />
                </StepField>
              </div>
            ) : null}

            {currentStep === "nutrition-lifestyle" ? (
              <div className="grid gap-5 md:grid-cols-2">
                <StepField label="Dietary preferences" required>
                  <Input
                    value={draft.nutritionLifestyle.dietary_preferences}
                    onChange={(event) =>
                      setDraft((prev) =>
                        prev
                          ? {
                              ...prev,
                              nutritionLifestyle: {
                                ...prev.nutritionLifestyle,
                                dietary_preferences: event.target.value,
                              },
                            }
                          : prev,
                      )
                    }
                    disabled={!summary.canEdit}
                    placeholder="No preference, halal, vegetarian..."
                  />
                </StepField>
                <StepField
                  label="Allergies / intolerances"
                  required
                  hint="Write 'None' if not applicable."
                >
                  <Input
                    value={draft.nutritionLifestyle.allergies}
                    onChange={(event) =>
                      setDraft((prev) =>
                        prev
                          ? {
                              ...prev,
                              nutritionLifestyle: {
                                ...prev.nutritionLifestyle,
                                allergies: event.target.value,
                              },
                            }
                          : prev,
                      )
                    }
                    disabled={!summary.canEdit}
                    placeholder="None"
                  />
                </StepField>
                <div className="md:col-span-2">
                  <StepField
                    label="Foods avoided"
                    optional
                    hint="One per line if helpful."
                  >
                    <textarea
                      className="min-h-[110px] w-full rounded-2xl border border-border/70 bg-background px-3 py-2.5 text-sm text-foreground shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      value={draft.nutritionLifestyle.foods_avoided}
                      onChange={(event) =>
                        setDraft((prev) =>
                          prev
                            ? {
                                ...prev,
                                nutritionLifestyle: {
                                  ...prev.nutritionLifestyle,
                                  foods_avoided: event.target.value,
                                },
                              }
                            : prev,
                        )
                      }
                      disabled={!summary.canEdit}
                      placeholder="Optional"
                    />
                  </StepField>
                </div>
                <StepField label="Cooking confidence" optional>
                  <select
                    className={selectClassName}
                    value={draft.nutritionLifestyle.cooking_confidence}
                    onChange={(event) =>
                      setDraft((prev) =>
                        prev
                          ? {
                              ...prev,
                              nutritionLifestyle: {
                                ...prev.nutritionLifestyle,
                                cooking_confidence: event.target.value,
                              },
                            }
                          : prev,
                      )
                    }
                    disabled={!summary.canEdit}
                  >
                    <option value="">Select</option>
                    {cookingConfidenceOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </StepField>
                <StepField label="Eating out frequency" optional>
                  <select
                    className={selectClassName}
                    value={draft.nutritionLifestyle.eating_out_frequency}
                    onChange={(event) =>
                      setDraft((prev) =>
                        prev
                          ? {
                              ...prev,
                              nutritionLifestyle: {
                                ...prev.nutritionLifestyle,
                                eating_out_frequency: event.target.value,
                              },
                            }
                          : prev,
                      )
                    }
                    disabled={!summary.canEdit}
                  >
                    <option value="">Select</option>
                    {eatingOutOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </StepField>
                <StepField label="Sleep quality" required>
                  <select
                    className={selectClassName}
                    value={draft.nutritionLifestyle.sleep_quality}
                    onChange={(event) =>
                      setDraft((prev) =>
                        prev
                          ? {
                              ...prev,
                              nutritionLifestyle: {
                                ...prev.nutritionLifestyle,
                                sleep_quality: event.target.value,
                              },
                            }
                          : prev,
                      )
                    }
                    disabled={!summary.canEdit}
                  >
                    <option value="">Select</option>
                    {sleepQualityOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </StepField>
                <StepField label="Stress level" required>
                  <select
                    className={selectClassName}
                    value={draft.nutritionLifestyle.stress_level}
                    onChange={(event) =>
                      setDraft((prev) =>
                        prev
                          ? {
                              ...prev,
                              nutritionLifestyle: {
                                ...prev.nutritionLifestyle,
                                stress_level: event.target.value,
                              },
                            }
                          : prev,
                      )
                    }
                    disabled={!summary.canEdit}
                  >
                    <option value="">Select</option>
                    {stressLevelOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </StepField>
                <div className="md:col-span-2">
                  <StepField
                    label="Work schedule / routine constraints"
                    required
                  >
                    <textarea
                      className="min-h-[130px] w-full rounded-2xl border border-border/70 bg-background px-3 py-2.5 text-sm text-foreground shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      value={draft.nutritionLifestyle.schedule_constraints}
                      onChange={(event) =>
                        setDraft((prev) =>
                          prev
                            ? {
                                ...prev,
                                nutritionLifestyle: {
                                  ...prev.nutritionLifestyle,
                                  schedule_constraints: event.target.value,
                                },
                              }
                            : prev,
                        )
                      }
                      disabled={!summary.canEdit}
                      placeholder="Shift work, travel, family constraints..."
                    />
                  </StepField>
                </div>
                <StepField label="Preferred training time" optional>
                  <select
                    className={selectClassName}
                    value={draft.nutritionLifestyle.preferred_training_time}
                    onChange={(event) =>
                      setDraft((prev) =>
                        prev
                          ? {
                              ...prev,
                              nutritionLifestyle: {
                                ...prev.nutritionLifestyle,
                                preferred_training_time: event.target.value,
                              },
                            }
                          : prev,
                      )
                    }
                    disabled={!summary.canEdit}
                  >
                    <option value="">Select</option>
                    {trainingTimeOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </StepField>
              </div>
            ) : null}

            {currentStep === "initial-assessment" ? (
              <div className="space-y-5">
                <div className="rounded-[26px] border border-border/70 bg-[linear-gradient(180deg,oklch(var(--card)/0.95),oklch(var(--card)/0.9))] p-5">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge
                          variant={
                            progress["initial-assessment"].complete
                              ? "success"
                              : summary.latestDraftBaseline
                                ? "secondary"
                                : "warning"
                          }
                        >
                          {progress["initial-assessment"].complete
                            ? "Submitted"
                            : summary.latestDraftBaseline
                              ? "Draft in progress"
                              : "Not started"}
                        </Badge>
                      </div>
                      <p className="text-sm font-semibold text-foreground">
                        Reuse the existing baseline flow for your initial
                        assessment.
                      </p>
                      <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
                        This step uses the current baseline system for metrics,
                        markers, and photos. Completion only counts once the
                        baseline is submitted.
                      </p>
                    </div>

                    {summary.canEdit ? (
                      <Button asChild>
                        <Link to={baselineStepHref}>
                          {summary.latestDraftBaseline
                            ? "Resume assessment"
                            : progress["initial-assessment"].complete
                              ? "View assessment status"
                              : "Start assessment"}
                          <ArrowRight className="h-4 w-4" />
                        </Link>
                      </Button>
                    ) : null}
                  </div>
                </div>

                {progress["initial-assessment"].complete ? (
                  <div className="rounded-2xl border border-success/20 bg-success/10 p-4 text-sm text-foreground">
                    <p className="font-semibold">
                      Initial assessment completed
                    </p>
                    <p className="mt-1 text-muted-foreground">
                      Submitted{" "}
                      {summary.linkedSubmittedBaseline?.submitted_at
                        ? formatRelativeTime(
                            summary.linkedSubmittedBaseline.submitted_at,
                          )
                        : summary.latestSubmittedBaseline?.submitted_at
                          ? formatRelativeTime(
                              summary.latestSubmittedBaseline.submitted_at,
                            )
                          : "recently"}
                      .
                    </p>
                  </div>
                ) : summary.latestDraftBaseline ? (
                  <div className="rounded-2xl border border-border/70 bg-secondary/18 p-4 text-sm text-muted-foreground">
                    A baseline draft already exists. Resume it and submit to
                    complete this onboarding step.
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed border-border/70 bg-background/35 p-4 text-sm text-muted-foreground">
                    Start the assessment when you&apos;re ready. It will open
                    the existing baseline flow and return you here after
                    submission.
                  </div>
                )}
              </div>
            ) : null}

            {currentStep === "review-submit" ? (
              <div className="space-y-5">
                <div className="rounded-2xl border border-border/70 bg-secondary/18 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-foreground">
                        Submission readiness
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Review each section below. The initial assessment must
                        be submitted before you can send this to your coach.
                      </p>
                    </div>
                    <Badge
                      variant={
                        progress["review-submit"].complete
                          ? "success"
                          : "warning"
                      }
                    >
                      {progress["review-submit"].complete
                        ? "Ready to submit"
                        : "Still missing required items"}
                    </Badge>
                  </div>
                </div>

                <div className="grid gap-4">
                  {reviewCards.map((section) => (
                    <Card key={section.title} className="border-border/70">
                      <CardHeader className="pb-3">
                        <CardTitle className="text-base">
                          {section.title}
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="grid gap-3 md:grid-cols-2">
                        {section.values.map(([label, value]) => (
                          <div
                            key={`${section.title}-${label}`}
                            className="space-y-1"
                          >
                            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                              {label}
                            </p>
                            <p className="text-sm text-foreground">
                              {toReviewValue(value)}
                            </p>
                          </div>
                        ))}
                      </CardContent>
                    </Card>
                  ))}

                  <Card className="border-border/70">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">
                        Initial Assessment
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Badge
                          variant={
                            progress["initial-assessment"].complete
                              ? "success"
                              : "warning"
                          }
                        >
                          {progress["initial-assessment"].complete
                            ? "Submitted"
                            : "Required"}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {progress["initial-assessment"].complete
                          ? "Your baseline has been submitted and will travel with this onboarding package."
                          : "Complete the Initial Assessment step before submission."}
                      </p>
                    </CardContent>
                  </Card>
                </div>
              </div>
            ) : null}

            <div className="flex flex-col gap-3 border-t border-border/60 pt-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Clock3 className="h-3.5 w-3.5" />
                {summary.awaitingReview
                  ? "Read-only while your coach reviews this onboarding."
                  : "Draft changes save automatically while you work."}
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => void handleBack()}
                  disabled={
                    clientOnboardingSteps.findIndex(
                      (step) => step.key === currentStep,
                    ) === 0
                  }
                >
                  <ArrowLeft className="h-4 w-4" />
                  Back
                </Button>

                {currentStep !== "review-submit" ? (
                  <Button
                    type="button"
                    onClick={() => void handleNext()}
                    disabled={
                      !summary.canEdit ||
                      currentStep === "initial-assessment" ||
                      saveState === "saving"
                    }
                  >
                    Next
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                ) : (
                  <Button
                    type="button"
                    onClick={() => void handleSubmit()}
                    disabled={
                      !summary.canEdit ||
                      !progress["review-submit"].complete ||
                      submitState === "saving"
                    }
                  >
                    {submitState === "saving" ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : null}
                    Submit onboarding
                  </Button>
                )}
              </div>
            </div>

            {currentStep === "initial-assessment" && summary.canEdit ? (
              <div className="rounded-2xl border border-border/60 bg-background/35 p-4 text-sm text-muted-foreground">
                Use the button above to open the baseline step. Once you submit
                the baseline, return here and continue to review.
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </section>
  );
}

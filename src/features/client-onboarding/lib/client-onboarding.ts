import type {
  ClientBaselineEntrySummary,
  ClientOnboardingBasics,
  ClientOnboardingClientProfile,
  ClientOnboardingFieldState,
  ClientOnboardingGoals,
  ClientOnboardingInjuriesLimitations,
  ClientOnboardingNutritionLifestyle,
  ClientOnboardingStatus,
  ClientOnboardingStepKey,
  ClientOnboardingStepProgress,
  ClientOnboardingStepState,
  ClientOnboardingTrainingHistory,
  WorkspaceClientOnboardingRow,
} from "../types";

export const clientOnboardingSteps: Array<{
  key: ClientOnboardingStepKey;
  title: string;
  shortTitle: string;
  description: string;
}> = [
  {
    key: "basics",
    title: "Basics",
    shortTitle: "Basics",
    description: "How your coach should contact and identify you.",
  },
  {
    key: "goals",
    title: "Goals",
    shortTitle: "Goals",
    description: "What you want to achieve and how success should feel.",
  },
  {
    key: "training-history",
    title: "Training History",
    shortTitle: "History",
    description: "Your current training context, access, and confidence.",
  },
  {
    key: "injuries-limitations",
    title: "Injuries / Limitations",
    shortTitle: "Limitations",
    description: "Anything your coach should protect around immediately.",
  },
  {
    key: "nutrition-lifestyle",
    title: "Nutrition & Lifestyle",
    shortTitle: "Lifestyle",
    description: "The routine constraints that shape your plan.",
  },
  {
    key: "initial-assessment",
    title: "Initial Assessment",
    shortTitle: "Assessment",
    description: "Your baseline metrics, markers, and progress photos.",
  },
  {
    key: "review-submit",
    title: "Review & Submit",
    shortTitle: "Review",
    description: "Check everything, then send it for PT review.",
  },
];

const editableStatuses: ClientOnboardingStatus[] = ["invited", "in_progress"];
const awaitingReviewStatuses: ClientOnboardingStatus[] = [
  "submitted",
  "review_needed",
];

const hasText = (value: string | null | undefined) =>
  Boolean(value && value.trim().length > 0);

const hasPositiveNumber = (value: number | null | undefined) =>
  typeof value === "number" && Number.isFinite(value) && value > 0;

const normalizeText = (value: string | null | undefined) => value?.trim() ?? "";

const normalizeTextList = (value: unknown) => {
  if (!Array.isArray(value)) return [] as string[];
  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
};

const splitMultilineList = (value: string) =>
  value
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);

export function getOnboardingStatusMeta(status: ClientOnboardingStatus) {
  switch (status) {
    case "invited":
      return {
        label: "Not started",
        description:
          "Your coach workspace is ready. Start onboarding when you are.",
        variant: "warning" as const,
      };
    case "in_progress":
      return {
        label: "In progress",
        description:
          "Your onboarding draft is saved. Continue where you left off.",
        variant: "secondary" as const,
      };
    case "review_needed":
      return {
        label: "Awaiting PT review",
        description:
          "Your onboarding is submitted. Your coach will review it next.",
        variant: "muted" as const,
      };
    case "submitted":
      return {
        label: "Reviewed by coach",
        description:
          "Your coach reviewed your onboarding and is wrapping up the last admin details.",
        variant: "secondary" as const,
      };
    case "partially_activated":
      return {
        label: "Reviewed by coach",
        description:
          "This onboarding is using an older intermediate state and will be treated as reviewed.",
        variant: "secondary" as const,
      };
    case "completed":
      return {
        label: "Completed",
        description: "Onboarding is complete for this workspace.",
        variant: "success" as const,
      };
    default:
      return {
        label: "Unknown",
        description: "Onboarding status is unavailable.",
        variant: "muted" as const,
      };
  }
}

export function isOnboardingEditable(status: ClientOnboardingStatus) {
  return editableStatuses.includes(status);
}

export function isOnboardingAwaitingReview(status: ClientOnboardingStatus) {
  return awaitingReviewStatuses.includes(status);
}

export function getOnboardingStepTitle(stepKey: ClientOnboardingStepKey) {
  return (
    clientOnboardingSteps.find((step) => step.key === stepKey)?.title ?? "Step"
  );
}

export function getOnboardingStepHref(stepKey: ClientOnboardingStepKey) {
  return `/app/onboarding?step=${stepKey}`;
}

export function getPreferredOnboardingStep(
  value: string | null | undefined,
): ClientOnboardingStepKey | null {
  return clientOnboardingSteps.find((step) => step.key === value)?.key ?? null;
}

export function getDraftFields(
  client: ClientOnboardingClientProfile,
  onboarding: WorkspaceClientOnboardingRow,
  sessionEmail: string | null | undefined,
): ClientOnboardingFieldState {
  const basics = onboarding.basics ?? {};
  const goals = onboarding.goals ?? {};
  const trainingHistory = onboarding.training_history ?? {};
  const injuriesLimitations = onboarding.injuries_limitations ?? {};
  const nutritionLifestyle = onboarding.nutrition_lifestyle ?? {};

  return {
    basics: {
      display_name: normalizeText(
        basics.display_name ?? client.display_name ?? "",
      ),
      phone: normalizeText(basics.phone ?? client.phone ?? ""),
      email: normalizeText(basics.email ?? client.email ?? sessionEmail ?? ""),
      location: normalizeText(
        basics.location_country ?? basics.location ?? client.location ?? "",
      ),
      timezone: normalizeText(basics.timezone ?? client.timezone ?? ""),
      gender: normalizeText(basics.gender ?? client.gender ?? ""),
      unit_preference: normalizeText(
        basics.unit_preference ?? client.unit_preference ?? "",
      ),
    },
    goals: {
      goal: normalizeText(goals.goal ?? client.goal ?? ""),
      secondary_goals: normalizeTextList(goals.secondary_goals).join("\n"),
      motivation: normalizeText(goals.motivation ?? ""),
    },
    trainingHistory: {
      experience_level: normalizeText(trainingHistory.experience_level ?? ""),
      current_training_frequency: normalizeText(
        trainingHistory.current_training_frequency ?? "",
      ),
      equipment: normalizeText(
        trainingHistory.equipment ?? client.equipment ?? "",
      ),
      gym_name: normalizeText(
        trainingHistory.gym_name ?? client.gym_name ?? "",
      ),
      current_training_routine: normalizeText(
        trainingHistory.current_training_routine ?? "",
      ),
      confidence_level: normalizeText(trainingHistory.confidence_level ?? ""),
      days_per_week:
        trainingHistory.days_per_week === null ||
        trainingHistory.days_per_week === undefined
          ? client.days_per_week === null || client.days_per_week === undefined
            ? ""
            : String(client.days_per_week)
          : String(trainingHistory.days_per_week),
    },
    injuriesLimitations: {
      injuries: normalizeText(
        injuriesLimitations.injuries ?? client.injuries ?? "",
      ),
      limitations: normalizeText(
        injuriesLimitations.limitations ?? client.limitations ?? "",
      ),
      exercises_to_avoid: normalizeText(
        injuriesLimitations.exercises_to_avoid ?? "",
      ),
      surgeries_history: normalizeText(
        injuriesLimitations.surgeries_history ?? "",
      ),
    },
    nutritionLifestyle: {
      dietary_preferences: normalizeText(
        nutritionLifestyle.dietary_preferences ?? "",
      ),
      allergies: normalizeText(nutritionLifestyle.allergies ?? ""),
      foods_avoided: normalizeTextList(nutritionLifestyle.foods_avoided).join(
        "\n",
      ),
      cooking_confidence: normalizeText(
        nutritionLifestyle.cooking_confidence ?? "",
      ),
      eating_out_frequency: normalizeText(
        nutritionLifestyle.eating_out_frequency ?? "",
      ),
      sleep_quality: normalizeText(nutritionLifestyle.sleep_quality ?? ""),
      stress_level: normalizeText(nutritionLifestyle.stress_level ?? ""),
      schedule_constraints: normalizeText(
        nutritionLifestyle.schedule_constraints ?? "",
      ),
      preferred_training_time: normalizeText(
        nutritionLifestyle.preferred_training_time ?? "",
      ),
    },
  };
}

export function getCurrentStepPayload(
  stepKey: ClientOnboardingStepKey,
  draft: ClientOnboardingFieldState,
) {
  switch (stepKey) {
    case "basics":
      return {
        display_name: normalizeText(draft.basics.display_name),
        phone: normalizeText(draft.basics.phone),
        email: normalizeText(draft.basics.email),
        location: normalizeText(draft.basics.location),
        location_country: normalizeText(draft.basics.location),
        timezone: normalizeText(draft.basics.timezone),
        gender: normalizeText(draft.basics.gender),
        unit_preference: normalizeText(
          draft.basics.unit_preference,
        ).toLowerCase(),
      } satisfies ClientOnboardingBasics;
    case "goals":
      return {
        goal: normalizeText(draft.goals.goal),
        secondary_goals: splitMultilineList(draft.goals.secondary_goals),
        motivation: normalizeText(draft.goals.motivation),
      } satisfies ClientOnboardingGoals;
    case "training-history":
      return {
        experience_level: normalizeText(draft.trainingHistory.experience_level),
        current_training_frequency: normalizeText(
          draft.trainingHistory.current_training_frequency,
        ),
        equipment: normalizeText(draft.trainingHistory.equipment),
        gym_name: normalizeText(draft.trainingHistory.gym_name),
        current_training_routine: normalizeText(
          draft.trainingHistory.current_training_routine,
        ),
        confidence_level: normalizeText(draft.trainingHistory.confidence_level),
        days_per_week: draft.trainingHistory.days_per_week.trim()
          ? Number(draft.trainingHistory.days_per_week)
          : null,
      } satisfies ClientOnboardingTrainingHistory;
    case "injuries-limitations":
      return {
        injuries: normalizeText(draft.injuriesLimitations.injuries),
        limitations: normalizeText(draft.injuriesLimitations.limitations),
        exercises_to_avoid: normalizeText(
          draft.injuriesLimitations.exercises_to_avoid,
        ),
        surgeries_history: normalizeText(
          draft.injuriesLimitations.surgeries_history,
        ),
      } satisfies ClientOnboardingInjuriesLimitations;
    case "nutrition-lifestyle":
      return {
        dietary_preferences: normalizeText(
          draft.nutritionLifestyle.dietary_preferences,
        ),
        allergies: normalizeText(draft.nutritionLifestyle.allergies),
        foods_avoided: splitMultilineList(
          draft.nutritionLifestyle.foods_avoided,
        ),
        cooking_confidence: normalizeText(
          draft.nutritionLifestyle.cooking_confidence,
        ),
        eating_out_frequency: normalizeText(
          draft.nutritionLifestyle.eating_out_frequency,
        ),
        sleep_quality: normalizeText(draft.nutritionLifestyle.sleep_quality),
        stress_level: normalizeText(draft.nutritionLifestyle.stress_level),
        schedule_constraints: normalizeText(
          draft.nutritionLifestyle.schedule_constraints,
        ),
        preferred_training_time: normalizeText(
          draft.nutritionLifestyle.preferred_training_time,
        ),
      } satisfies ClientOnboardingNutritionLifestyle;
    default:
      return null;
  }
}

export function validateStep(
  stepKey: ClientOnboardingStepKey,
  draft: ClientOnboardingFieldState,
) {
  switch (stepKey) {
    case "basics":
      if (!hasText(draft.basics.display_name)) return "Full name is required.";
      if (!hasText(draft.basics.phone)) return "Phone is required.";
      if (!hasText(draft.basics.email)) return "Email is required.";
      if (!hasText(draft.basics.location)) return "Location is required.";
      if (!hasText(draft.basics.timezone)) return "Timezone is required.";
      if (!hasText(draft.basics.unit_preference))
        return "Choose your preferred units.";
      return null;
    case "goals":
      if (!hasText(draft.goals.goal)) return "Primary goal is required.";
      if (!hasText(draft.goals.motivation))
        return "Motivation / success definition is required.";
      return null;
    case "training-history":
      if (!hasText(draft.trainingHistory.experience_level))
        return "Training experience is required.";
      if (!hasText(draft.trainingHistory.current_training_frequency))
        return "Current training frequency is required.";
      if (!hasText(draft.trainingHistory.equipment))
        return "Gym / equipment access is required.";
      if (!hasPositiveNumber(Number(draft.trainingHistory.days_per_week)))
        return "Days available per week is required.";
      return null;
    case "injuries-limitations":
      if (!hasText(draft.injuriesLimitations.injuries))
        return "Current injuries is required. Write 'None' if not applicable.";
      if (!hasText(draft.injuriesLimitations.limitations))
        return "Movement limitations is required. Write 'None' if not applicable.";
      if (!hasText(draft.injuriesLimitations.exercises_to_avoid))
        return "Exercises to avoid is required. Write 'None' if not applicable.";
      return null;
    case "nutrition-lifestyle":
      if (!hasText(draft.nutritionLifestyle.dietary_preferences))
        return "Dietary preferences is required.";
      if (!hasText(draft.nutritionLifestyle.allergies))
        return "Allergies / intolerances is required. Write 'None' if not applicable.";
      if (!hasText(draft.nutritionLifestyle.sleep_quality))
        return "Sleep quality is required.";
      if (!hasText(draft.nutritionLifestyle.stress_level))
        return "Stress level is required.";
      if (!hasText(draft.nutritionLifestyle.schedule_constraints))
        return "Work schedule / routine constraints is required.";
      return null;
    default:
      return null;
  }
}

export function getStepProgress(params: {
  draft: ClientOnboardingFieldState;
  latestSubmittedBaseline: ClientBaselineEntrySummary | null;
  linkedSubmittedBaseline: ClientBaselineEntrySummary | null;
}) {
  const baselineComplete = Boolean(
    params.linkedSubmittedBaseline?.id ?? params.latestSubmittedBaseline?.id,
  );

  return {
    basics: { complete: !validateStep("basics", params.draft) },
    goals: { complete: !validateStep("goals", params.draft) },
    "training-history": {
      complete: !validateStep("training-history", params.draft),
    },
    "injuries-limitations": {
      complete: !validateStep("injuries-limitations", params.draft),
    },
    "nutrition-lifestyle": {
      complete: !validateStep("nutrition-lifestyle", params.draft),
    },
    "initial-assessment": { complete: baselineComplete },
    "review-submit": {
      complete:
        !validateStep("basics", params.draft) &&
        !validateStep("goals", params.draft) &&
        !validateStep("training-history", params.draft) &&
        !validateStep("injuries-limitations", params.draft) &&
        !validateStep("nutrition-lifestyle", params.draft) &&
        baselineComplete,
    },
  } satisfies ClientOnboardingStepProgress;
}

export function getCompletionPercent(progress: ClientOnboardingStepProgress) {
  const completed = Object.values(progress).filter(
    (step) => step.complete,
  ).length;
  return Math.round((completed / clientOnboardingSteps.length) * 100);
}

export function getResumeStep(params: {
  status: ClientOnboardingStatus;
  progress: ClientOnboardingStepProgress;
  stepState: ClientOnboardingStepState | null | undefined;
}) {
  if (params.status === "completed") return "review-submit" as const;

  const preferred = getPreferredOnboardingStep(
    params.stepState?.currentStep ?? params.stepState?.lastVisitedStep ?? null,
  );
  if (preferred && params.status !== "invited") {
    if (
      preferred === "initial-assessment" ||
      preferred === "review-submit" ||
      !params.progress[preferred].complete
    ) {
      return preferred;
    }
  }

  return (
    clientOnboardingSteps.find(
      (step) =>
        step.key !== "review-submit" && !params.progress[step.key].complete,
    )?.key ?? "review-submit"
  );
}

export function getUpdatedStepState(params: {
  previous: ClientOnboardingStepState | null | undefined;
  progress: ClientOnboardingStepProgress;
  currentStep: ClientOnboardingStepKey;
}) {
  const completedSteps = clientOnboardingSteps.reduce<
    Partial<Record<ClientOnboardingStepKey, boolean>>
  >((acc, step) => {
    acc[step.key] = params.progress[step.key].complete;
    return acc;
  }, {});

  const lastCompletedStep =
    [...clientOnboardingSteps]
      .reverse()
      .find((step) => completedSteps[step.key])?.key ?? null;

  return {
    ...(params.previous ?? {}),
    currentStep: params.currentStep,
    lastVisitedStep: params.currentStep,
    lastCompletedStep,
    completedSteps,
  } satisfies ClientOnboardingStepState;
}

export const clientOnboardingStepKeys = [
  "basics",
  "goals",
  "training-history",
  "injuries-limitations",
  "nutrition-lifestyle",
  "initial-assessment",
  "review-submit",
] as const;

export type ClientOnboardingStepKey = (typeof clientOnboardingStepKeys)[number];

export type ClientOnboardingStatus =
  | "invited"
  | "in_progress"
  | "submitted"
  | "review_needed"
  | "partially_activated"
  | "completed";

export type ClientOnboardingSource = "direct_invite" | "converted_lead";

export type ClientOnboardingBasics = {
  display_name?: string;
  phone?: string;
  email?: string;
  location?: string;
  location_country?: string;
  timezone?: string;
  gender?: string;
  unit_preference?: string;
};

export type ClientOnboardingGoals = {
  goal?: string;
  secondary_goals?: string[];
  motivation?: string;
};

export type ClientOnboardingTrainingHistory = {
  experience_level?: string;
  current_training_frequency?: string;
  equipment?: string;
  gym_name?: string;
  current_training_routine?: string;
  confidence_level?: string;
  days_per_week?: number | null;
};

export type ClientOnboardingInjuriesLimitations = {
  injuries?: string;
  limitations?: string;
  exercises_to_avoid?: string;
  surgeries_history?: string;
};

export type ClientOnboardingNutritionLifestyle = {
  dietary_preferences?: string;
  allergies?: string;
  foods_avoided?: string[];
  cooking_confidence?: string;
  eating_out_frequency?: string;
  sleep_quality?: string;
  stress_level?: string;
  schedule_constraints?: string;
  preferred_training_time?: string;
};

export type ClientOnboardingStepState = {
  currentStep?: ClientOnboardingStepKey;
  lastVisitedStep?: ClientOnboardingStepKey;
  lastCompletedStep?: ClientOnboardingStepKey | null;
  completedSteps?: Partial<Record<ClientOnboardingStepKey, boolean>>;
};

export type WorkspaceClientOnboardingRow = {
  id: string;
  workspace_id: string;
  client_id: string;
  source: ClientOnboardingSource;
  status: ClientOnboardingStatus;
  basics: ClientOnboardingBasics | null;
  goals: ClientOnboardingGoals | null;
  training_history: ClientOnboardingTrainingHistory | null;
  injuries_limitations: ClientOnboardingInjuriesLimitations | null;
  nutrition_lifestyle: ClientOnboardingNutritionLifestyle | null;
  step_state: ClientOnboardingStepState | null;
  initial_baseline_entry_id: string | null;
  coach_review_notes: string | null;
  first_program_template_id: string | null;
  first_program_applied_at: string | null;
  first_checkin_template_id: string | null;
  first_checkin_date: string | null;
  first_checkin_scheduled_at: string | null;
  reviewed_by_user_id: string | null;
  last_saved_at: string | null;
  submitted_at: string | null;
  reviewed_at: string | null;
  activated_at: string | null;
  completed_at: string | null;
  started_at: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export type ClientOnboardingClientProfile = {
  id: string;
  workspace_id: string | null;
  display_name: string | null;
  phone: string | null;
  location: string | null;
  location_country: string | null;
  timezone: string | null;
  gender: string | null;
  unit_preference: string | null;
  goal: string | null;
  injuries: string | null;
  limitations: string | null;
  equipment: string | null;
  days_per_week: number | null;
  gym_name: string | null;
  email: string | null;
  training_type: string | null;
};

export type ClientBaselineEntrySummary = {
  id: string;
  status: string | null;
  created_at: string | null;
  submitted_at: string | null;
};

export type ClientOnboardingFieldState = {
  basics: {
    display_name: string;
    phone: string;
    email: string;
    location: string;
    timezone: string;
    gender: string;
    unit_preference: string;
  };
  goals: {
    goal: string;
    secondary_goals: string;
    motivation: string;
  };
  trainingHistory: {
    experience_level: string;
    current_training_frequency: string;
    equipment: string;
    gym_name: string;
    current_training_routine: string;
    confidence_level: string;
    days_per_week: string;
  };
  injuriesLimitations: {
    injuries: string;
    limitations: string;
    exercises_to_avoid: string;
    surgeries_history: string;
  };
  nutritionLifestyle: {
    dietary_preferences: string;
    allergies: string;
    foods_avoided: string;
    cooking_confidence: string;
    eating_out_frequency: string;
    sleep_quality: string;
    stress_level: string;
    schedule_constraints: string;
    preferred_training_time: string;
  };
};

export type ClientOnboardingStepProgress = Record<
  ClientOnboardingStepKey,
  {
    complete: boolean;
    optional?: boolean;
  }
>;

export type ClientOnboardingSummary = {
  client: ClientOnboardingClientProfile;
  onboarding: WorkspaceClientOnboardingRow;
  latestDraftBaseline: ClientBaselineEntrySummary | null;
  latestSubmittedBaseline: ClientBaselineEntrySummary | null;
  linkedSubmittedBaseline: ClientBaselineEntrySummary | null;
  progress: ClientOnboardingStepProgress;
  resumeStep: ClientOnboardingStepKey;
  completionPercent: number;
  canEdit: boolean;
  awaitingReview: boolean;
};

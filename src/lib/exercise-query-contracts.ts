export const EXERCISE_LIBRARY_FULL_PROJECTION =
  "id, owner_user_id, workspace_id, name, category, muscle_group, primary_muscle, secondary_muscles, equipment, video_url, instructions, notes, cues, is_unilateral, tags, created_at, source, source_exercise_id, source_payload";

export const EXERCISE_EDITOR_WRITABLE_FIELDS = [
  "owner_user_id",
  "name",
  "muscle_group",
  "secondary_muscles",
  "equipment",
  "video_url",
  "is_unilateral",
  "source",
] as const;

export const exerciseQueryKeys = {
  library: {
    all: ["exercise-library"] as const,
    owner: (ownerUserId: string | null) =>
      ["exercise-library", ownerUserId] as const,
    full: (ownerUserId: string | null) =>
      ["exercise-library", ownerUserId, "full"] as const,
  },
};

export const workoutTemplateExerciseQueryKeys = {
  all: ["workout-template-exercises"] as const,
  template: (templateId: string | null | undefined) =>
    ["workout-template-exercises", templateId] as const,
  builder: (templateId: string | null | undefined) =>
    ["workout-template-exercises", templateId, "builder"] as const,
  preview: (templateId: string | null | undefined) =>
    ["workout-template-exercises", templateId, "preview"] as const,
  today: (templateId: string | null | undefined) =>
    ["workout-template-exercises", templateId, "today"] as const,
  detail: (templateId: string | null | undefined) =>
    ["workout-template-exercises", templateId, "detail"] as const,
  runner: (templateId: string | null | undefined) =>
    ["workout-template-exercises", templateId, "runner"] as const,
};

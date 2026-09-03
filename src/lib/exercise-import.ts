import type { ProviderNormalizedExercise } from "./exercise-domain";
import { buildCurrentProviderCanonicalMuscleFields } from "./exercise-muscle-mapping";

const joinParagraphs = (values: readonly string[]) =>
  values
    .map((value) => value.trim())
    .filter(Boolean)
    .join("\n\n");

export function buildCurrentProviderExerciseInsertPayload(
  ownerUserId: string,
  exercise: ProviderNormalizedExercise,
) {
  return {
    owner_user_id: ownerUserId,
    workspace_id: null,
    name: exercise.name,
    muscle_group: exercise.bodyPart,
    primary_muscle: exercise.target,
    secondary_muscles: exercise.secondaryMuscles.length
      ? exercise.secondaryMuscles
      : null,
    equipment: exercise.equipment,
    instructions: exercise.instructions.length
      ? joinParagraphs(exercise.instructions)
      : null,
    video_url: exercise.videoUrl,
    notes: exercise.overview,
    cues: exercise.exerciseTips.length
      ? joinParagraphs(exercise.exerciseTips)
      : null,
    tags: Array.from(
      new Set(
        [exercise.bodyPart, exercise.target, exercise.equipment]
          .map((value) => value?.trim())
          .filter((value): value is string => Boolean(value)),
      ),
    ),
    category: exercise.bodyPart,
    ...buildCurrentProviderCanonicalMuscleFields(exercise),
    source: "exercise_dataset",
    source_exercise_id: exercise.id,
    source_payload: exercise.raw,
  };
}

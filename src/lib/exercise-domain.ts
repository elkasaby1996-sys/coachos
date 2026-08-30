export type PersistentExerciseLibraryRecord = {
  id: string;
  owner_user_id: string;
  workspace_id: string | null;
  name: string;
  category: string | null;
  muscle_group: string | null;
  primary_muscle: string | null;
  secondary_muscles: string[] | null;
  equipment: string | null;
  video_url: string | null;
  instructions: string | null;
  notes: string | null;
  cues: string | null;
  is_unilateral: boolean;
  tags: string[] | null;
  created_at: string | null;
  source: string;
  source_exercise_id: string | null;
  source_payload: Record<string, unknown> | null;
};

export type ProviderNormalizedExercise = {
  id: string;
  name: string;
  bodyPart: string | null;
  target: string | null;
  secondaryMuscles: string[];
  equipment: string | null;
  instructions: string[];
  exerciseTips: string[];
  overview: string | null;
  keywords: string[];
  videoUrl: string | null;
  imageUrl: string | null;
  raw: Record<string, unknown>;
};

export type ExerciseSelectionKey = `library:${string}` | `dataset:${string}`;

export type ResolvedExerciseSelection = {
  exerciseId: string;
};

export type ExerciseSelectionState = {
  keys: ExerciseSelectionKey[];
  providerByKey: Record<string, ProviderNormalizedExercise>;
};

export type ExerciseSelectionCandidate =
  | {
      key: ExerciseSelectionKey;
      source: "library";
      exerciseId: string;
    }
  | {
      key: ExerciseSelectionKey;
      source: "dataset";
      exercise: ProviderNormalizedExercise;
    };

export const emptyExerciseSelectionState = (): ExerciseSelectionState => ({
  keys: [],
  providerByKey: {},
});

export function makeExerciseSelectionKey(
  source: "library" | "dataset",
  id: string,
): ExerciseSelectionKey {
  return `${source}:${id}`;
}

export function parseExerciseSelectionKey(value: string): {
  source: "library" | "dataset";
  id: string;
} | null {
  const separatorIndex = value.indexOf(":");
  if (separatorIndex <= 0) return null;
  const source = value.slice(0, separatorIndex);
  const id = value.slice(separatorIndex + 1);
  if ((source !== "library" && source !== "dataset") || !id) return null;
  return { source, id };
}

export function toggleExerciseSelection(
  state: ExerciseSelectionState,
  key: ExerciseSelectionKey,
  providerExercise?: ProviderNormalizedExercise,
): ExerciseSelectionState {
  if (state.keys.includes(key)) {
    const providerByKey = { ...state.providerByKey };
    delete providerByKey[key];
    return {
      keys: state.keys.filter((selectedKey) => selectedKey !== key),
      providerByKey,
    };
  }

  return {
    keys: [...state.keys, key],
    providerByKey:
      providerExercise === undefined
        ? state.providerByKey
        : { ...state.providerByKey, [key]: providerExercise },
  };
}

export function resolveExerciseSelectionCandidates(
  selectionState: ExerciseSelectionState,
  libraryExercises: readonly PersistentExerciseLibraryRecord[],
): {
  candidates: ExerciseSelectionCandidate[];
  unresolvedKeys: string[];
} {
  const libraryIds = new Set(libraryExercises.map((exercise) => exercise.id));
  const candidates: ExerciseSelectionCandidate[] = [];
  const unresolvedKeys: string[] = [];

  selectionState.keys.forEach((key) => {
    const parsed = parseExerciseSelectionKey(key);
    if (!parsed) {
      unresolvedKeys.push(key);
      return;
    }

    if (parsed.source === "library") {
      if (!libraryIds.has(parsed.id)) {
        unresolvedKeys.push(key);
        return;
      }
      candidates.push({ key, source: "library", exerciseId: parsed.id });
      return;
    }

    const exercise = selectionState.providerByKey[key];
    if (!exercise || exercise.id !== parsed.id) {
      unresolvedKeys.push(key);
      return;
    }
    candidates.push({ key, source: "dataset", exercise });
  });

  return { candidates, unresolvedKeys };
}

export function findLibraryExerciseForProvider(
  providerExercise: ProviderNormalizedExercise,
  libraryExercises: readonly PersistentExerciseLibraryRecord[],
) {
  const providerName = providerExercise.name.trim().toLowerCase();
  return (
    libraryExercises.find(
      (exercise) =>
        exercise.source_exercise_id === providerExercise.id ||
        exercise.name.trim().toLowerCase() === providerName,
    ) ?? null
  );
}

export function partitionNewExerciseSelections(
  selections: readonly ResolvedExerciseSelection[],
  existingExerciseIds: ReadonlySet<string>,
): {
  newSelections: ResolvedExerciseSelection[];
  duplicateExerciseIds: string[];
} {
  const seen = new Set(existingExerciseIds);
  const newSelections: ResolvedExerciseSelection[] = [];
  const duplicateExerciseIds: string[] = [];

  selections.forEach((selection) => {
    if (seen.has(selection.exerciseId)) {
      duplicateExerciseIds.push(selection.exerciseId);
      return;
    }
    seen.add(selection.exerciseId);
    newSelections.push(selection);
  });

  return { newSelections, duplicateExerciseIds };
}

export function buildWorkoutTemplateExerciseInsertRows(
  workoutTemplateId: string,
  selections: readonly ResolvedExerciseSelection[],
  maxSortOrder: number,
) {
  return selections.map(({ exerciseId }, index) => ({
    workout_template_id: workoutTemplateId,
    exercise_id: exerciseId,
    sort_order: maxSortOrder + (index + 1) * 10,
  }));
}

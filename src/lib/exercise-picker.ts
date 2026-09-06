import {
  adaptPersistedExerciseBrowserItem,
  classifyProviderSavedMatch,
  type ExerciseBrowserItem,
} from "./exercise-browser";
import type {
  ExerciseSelectionCandidate,
  ExerciseSelectionKey,
  PersistentExerciseLibraryRecord,
  ProviderNormalizedExercise,
} from "./exercise-domain";
import { makeExerciseSelectionKey } from "./exercise-domain";

export type ExercisePickerSelectionEntry = {
  key: ExerciseSelectionKey;
  item: ExerciseBrowserItem;
  providerExercise: ProviderNormalizedExercise | null;
};

export type ExercisePickerSelectionState = Map<
  ExerciseSelectionKey,
  ExercisePickerSelectionEntry
>;

export const emptyExercisePickerSelection = (): ExercisePickerSelectionState =>
  new Map();

export type ExercisePickerSelectionResolution = {
  candidates: ExerciseSelectionCandidate[];
  unresolvedKeys: ExerciseSelectionKey[];
  nameConflictKeys: ExerciseSelectionKey[];
};

export function getExercisePickerSelectionKey(
  item: ExerciseBrowserItem,
): ExerciseSelectionKey | null {
  if (item.kind === "persisted" && item.exerciseId) {
    return makeExerciseSelectionKey("library", item.exerciseId);
  }
  if (item.kind !== "provider" || !item.providerExerciseId) return null;
  if (item.savedMatch.status === "exact") {
    return makeExerciseSelectionKey("library", item.savedMatch.exerciseId);
  }
  if (item.savedMatch.status === "name_conflict") return null;
  return makeExerciseSelectionKey("dataset", item.providerExerciseId);
}

export function createExercisePickerSelectionEntry(
  item: ExerciseBrowserItem,
  providerExercise: ProviderNormalizedExercise | null,
  libraryExercises: readonly PersistentExerciseLibraryRecord[],
): ExercisePickerSelectionEntry | null {
  if (item.kind === "persisted" && item.exerciseId) {
    return {
      key: makeExerciseSelectionKey("library", item.exerciseId),
      item,
      providerExercise: null,
    };
  }

  if (item.kind !== "provider" || !item.providerExerciseId) return null;
  if (item.savedMatch.status === "name_conflict") return null;

  if (item.savedMatch.status === "exact") {
    const savedExerciseId = item.savedMatch.exerciseId;
    const saved = libraryExercises.find(({ id }) => id === savedExerciseId);
    if (!saved) return null;
    return {
      key: makeExerciseSelectionKey("library", saved.id),
      item: adaptPersistedExerciseBrowserItem(saved),
      providerExercise: null,
    };
  }

  if (!providerExercise || providerExercise.id !== item.providerExerciseId) {
    return null;
  }

  return {
    key: makeExerciseSelectionKey("dataset", providerExercise.id),
    item,
    providerExercise,
  };
}

export function toggleExercisePickerSelection(
  state: ExercisePickerSelectionState,
  entry: ExercisePickerSelectionEntry,
): ExercisePickerSelectionState {
  const next = new Map(state);
  if (next.has(entry.key)) next.delete(entry.key);
  else next.set(entry.key, entry);
  return next;
}

export function removeExercisePickerSelection(
  state: ExercisePickerSelectionState,
  key: ExerciseSelectionKey,
): ExercisePickerSelectionState {
  const next = new Map(state);
  next.delete(key);
  return next;
}

export function resolveExercisePickerSelections(
  state: ExercisePickerSelectionState,
  libraryExercises: readonly PersistentExerciseLibraryRecord[],
): ExercisePickerSelectionResolution {
  const libraryIds = new Set(libraryExercises.map(({ id }) => id));
  const candidates: ExerciseSelectionCandidate[] = [];
  const unresolvedKeys: ExerciseSelectionKey[] = [];
  const nameConflictKeys: ExerciseSelectionKey[] = [];

  state.forEach((entry, key) => {
    if (entry.key !== key) {
      unresolvedKeys.push(key);
    } else if (key.startsWith("library:")) {
      const exerciseId = key.slice("library:".length);
      if (!exerciseId || !libraryIds.has(exerciseId)) {
        unresolvedKeys.push(key);
      } else {
        candidates.push({ key, source: "library", exerciseId });
      }
    } else if (
      !entry.providerExercise ||
      key !== makeExerciseSelectionKey("dataset", entry.providerExercise.id)
    ) {
      unresolvedKeys.push(key);
    } else {
      const savedMatch = classifyProviderSavedMatch(
        entry.providerExercise,
        libraryExercises,
      );
      if (savedMatch.status === "name_conflict") {
        nameConflictKeys.push(key);
      } else if (savedMatch.status === "exact") {
        candidates.push({
          key,
          source: "library",
          exerciseId: savedMatch.exerciseId,
        });
      } else {
        candidates.push({
          key,
          source: "dataset",
          exercise: entry.providerExercise,
        });
      }
    }
  });

  return { candidates, unresolvedKeys, nameConflictKeys };
}

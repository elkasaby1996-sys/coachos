import { supabase } from "./supabase";
import type { PersistentExerciseLibraryRecord } from "./exercise-domain";
import {
  EXERCISE_LIBRARY_FULL_PROJECTION,
  exerciseQueryKeys,
} from "./exercise-query-contracts";

export function exerciseLibraryFullQueryOptions(ownerUserId: string | null) {
  return {
    queryKey: exerciseQueryKeys.library.full(ownerUserId),
    enabled: Boolean(ownerUserId),
    queryFn: async (): Promise<PersistentExerciseLibraryRecord[]> => {
      const { data, error } = await supabase
        .from("exercises")
        .select(EXERCISE_LIBRARY_FULL_PROJECTION)
        .eq("owner_user_id", ownerUserId ?? "")
        .order("name");
      if (error) throw error;
      return (data ?? []) as PersistentExerciseLibraryRecord[];
    },
  };
}

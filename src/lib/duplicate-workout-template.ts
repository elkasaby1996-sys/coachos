import { supabase } from "./supabase";

type ExercisePrescription = {
  exercise_id: string;
  sort_order: number | null;
  sets: number | null;
  reps: string | null;
  superset_group: string | null;
  rest_seconds: number | null;
  tempo: string | null;
  rpe: number | null;
  video_url: string | null;
  notes: string | null;
};

export async function duplicateWorkoutTemplate(
  templateId: string,
  workspaceId: string,
) {
  const { data: template, error: templateError } = await supabase
    .from("workout_templates")
    .select("name, description, workout_type, workout_type_tag")
    .eq("id", templateId)
    .eq("workspace_id", workspaceId)
    .single();
  if (templateError) throw templateError;

  const { data: exercises, error: exercisesError } = await supabase
    .from("workout_template_exercises")
    .select(
      "exercise_id, sort_order, sets, reps, superset_group, rest_seconds, tempo, rpe, video_url, notes",
    )
    .eq("workout_template_id", templateId)
    .order("sort_order", { ascending: true });
  if (exercisesError) throw exercisesError;

  const copyId = crypto.randomUUID();
  const name = `${template.name?.trim() || "Workout template"} (copy)`;
  try {
    const { error } = await supabase
      .from("workout_templates")
      .insert({
        id: copyId,
        workspace_id: workspaceId,
        name,
        description: template.description,
        workout_type: template.workout_type,
        workout_type_tag: template.workout_type_tag,
      })
      .select("id")
      .single();
    if (error) throw error;

    const prescriptions = (exercises ?? []) as ExercisePrescription[];
    if (prescriptions.length) {
      const { data: copied, error: copyError } = await supabase
        .from("workout_template_exercises")
        .insert(
          prescriptions.map((exercise) => ({
            ...exercise,
            workout_template_id: copyId,
          })),
        )
        .select("id");
      if (copyError) throw copyError;
      if (copied?.length !== prescriptions.length)
        throw new Error("Some exercises could not be copied.");
    }
    return { id: copyId, name };
  } catch (error) {
    // Remove only this newly generated copy; the source is never modified.
    const { error: cleanupError } = await supabase
      .from("workout_templates")
      .delete()
      .eq("id", copyId)
      .eq("workspace_id", workspaceId);
    if (cleanupError) {
      throw new Error(
        `The workout could not be fully copied, and the incomplete “${name}” could not be removed. Delete that copy before retrying.`,
      );
    }
    throw error;
  }
}

import { supabase } from "./supabase";

export async function hydrateNutritionAssignmentContext(relation: unknown) {
  const plan = (Array.isArray(relation) ? relation[0] : relation) as {
    id?: string;
    nutrition_template?: unknown;
  } | null;
  if (!plan?.id || plan.nutrition_template) return;
  const { data, error } = await supabase.rpc(
    "client_nutrition_assignment_context",
    { p_plan_id: plan.id },
  );
  if (error) throw error;
  if (data?.[0]) plan.nutrition_template = data[0];
}

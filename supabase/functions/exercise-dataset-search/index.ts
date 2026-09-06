import { createClient } from "https://esm.sh/@supabase/supabase-js@2.103.0";
import {
  decideExerciseProviderAccess,
  exerciseDatasetGatewayCorsHeaders,
  handleExerciseDatasetGatewayRequest,
  type ExerciseDatasetProviderConfig,
} from "../_shared/exercise-dataset-gateway.ts";

function getEnv(name: string) {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function getOptionalEnv(name: string) {
  return Deno.env.get(name)?.trim() ?? "";
}

function getProviderConfig(): ExerciseDatasetProviderConfig | null {
  const configuredBaseUrl = getOptionalEnv("EXERCISE_DATASET_BASE_URL");
  const configuredApiKey = getOptionalEnv("EXERCISE_DATASET_API_KEY");
  const openWearablesBaseUrl = getOptionalEnv("OPEN_WEARABLES_API_URL");
  const openWearablesApiKey = getOptionalEnv("OPEN_WEARABLES_API_KEY");
  const usesOpenWearablesFallback =
    !configuredBaseUrl &&
    !configuredApiKey &&
    Boolean(openWearablesBaseUrl && openWearablesApiKey);
  const baseUrl = usesOpenWearablesFallback
    ? openWearablesBaseUrl.replace(/\/api\/v1\/?$/i, "")
    : configuredBaseUrl;
  const apiKey = usesOpenWearablesFallback
    ? openWearablesApiKey
    : configuredApiKey;
  if (!baseUrl || !apiKey) return null;
  return {
    baseUrl,
    apiKey,
    apiKeyHeader:
      getOptionalEnv("EXERCISE_DATASET_API_KEY_HEADER") ||
      (usesOpenWearablesFallback ? "X-Open-Wearables-API-Key" : "x-api-key"),
    apiHost: getOptionalEnv("EXERCISE_DATASET_API_HOST"),
  };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: exerciseDatasetGatewayCorsHeaders });
  }

  const supabase = createClient(
    getEnv("SUPABASE_URL"),
    getEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false } },
  );

  return handleExerciseDatasetGatewayRequest(request, {
    authenticate: async (accessToken) => {
      const {
        data: { user },
        error,
      } = await supabase.auth.getUser(accessToken);
      if (error || !user) return null;
      return { id: user.id };
    },
    authorize: async (userId) => {
      const [membership, ownedWorkspace, hubProfile, ptProfile] =
        await Promise.all([
          supabase
            .from("workspace_members")
            .select("id, role")
            .eq("user_id", userId)
            .limit(1)
            .maybeSingle(),
          supabase
            .from("workspaces")
            .select("id")
            .eq("owner_user_id", userId)
            .limit(1)
            .maybeSingle(),
          supabase
            .from("pt_hub_profiles")
            .select("user_id")
            .eq("user_id", userId)
            .maybeSingle(),
          supabase
            .from("pt_profiles")
            .select("user_id")
            .eq("user_id", userId)
            .limit(1)
            .maybeSingle(),
        ]);

      const firstError = [membership, ownedWorkspace, hubProfile, ptProfile]
        .map((result) => result.error)
        .find(Boolean);
      if (firstError) throw firstError;

      return decideExerciseProviderAccess({
        hasPtWorkspaceMembership: Boolean(
          membership.data?.role?.startsWith("pt_"),
        ),
        ownsWorkspace: Boolean(ownedWorkspace.data),
        hasPtHubProfile: Boolean(hubProfile.data),
        hasPtProfile: Boolean(ptProfile.data),
      });
    },
    getProviderConfig,
    log: (event) => console.info(JSON.stringify(event)),
  });
});

import { useEffect, useState } from "react";
import { supabase } from "./supabase";
import { useAuth } from "./auth";

export function useWorkspace() {
  const { user } = useAuth();
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let mounted = true;

    const loadWorkspace = async () => {
      if (!user?.id) {
        setWorkspaceId(null);
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const { data: memberData, error: memberError } = await supabase
          .from("workspace_members")
          .select("workspace_id")
          .eq("user_id", user.id)
          .maybeSingle();

        if (memberError) throw memberError;
        if (memberData?.workspace_id) {
          if (mounted) setWorkspaceId(memberData.workspace_id);
          return;
        }

        const { data: clientData, error: clientError } = await supabase
          .from("clients")
          .select("workspace_id")
          .eq("user_id", user.id)
          .maybeSingle();

        if (clientError) throw clientError;
        if (!clientData?.workspace_id) {
          throw new Error("Workspace not found for this user.");
        }
        if (mounted) setWorkspaceId(clientData.workspace_id);
      } catch (err) {
        console.error("Workspace bootstrap failed", err);
        if (mounted) {
          setWorkspaceId(null);
          setError(err instanceof Error ? err : new Error("Workspace bootstrap failed"));
        }
      } finally {
        if (mounted) setLoading(false);
      }
    };

    loadWorkspace();

    return () => {
      mounted = false;
    };
  }, [user?.id]);

  return { workspaceId, loading, error };
}

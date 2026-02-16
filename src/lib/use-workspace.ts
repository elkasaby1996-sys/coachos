import { useEffect, useState } from "react";
import { supabase } from "./supabase";
import { useAuth } from "./auth";

export function useWorkspace() {
  const { user } = useAuth();
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [hasCached, setHasCached] = useState(false);

  const withTimeout = async <T>(
    promise: PromiseLike<T>,
    ms: number,
    message: string,
  ): Promise<T> => {
    return new Promise((resolve, reject) => {
      const timer = window.setTimeout(() => reject(new Error(message)), ms);
      Promise.resolve(promise)
        .then((value) => {
          window.clearTimeout(timer);
          resolve(value);
        })
        .catch((err) => {
          window.clearTimeout(timer);
          reject(err);
        });
    });
  };

  useEffect(() => {
    let mounted = true;
    if (typeof window !== "undefined") {
      const cached = window.localStorage.getItem("coachos_workspace_id");
      if (cached) {
        setWorkspaceId(cached);
        setHasCached(true);
        setLoading(false);
      }
    }

    const loadWorkspace = async () => {
      if (!user?.id) {
        setWorkspaceId(null);
        setHasCached(false);
        setLoading(false);
        return;
      }

      if (!hasCached) {
        setLoading(true);
      }
      setError(null);

      try {
        const { data: memberData, error: memberError } = await withTimeout(
          supabase
            .from("workspace_members")
            .select("workspace_id, created_at")
            .eq("user_id", user.id)
            .order("created_at", { ascending: true })
            .limit(1)
            .maybeSingle(),
          8000,
          "Workspace lookup timed out (8s).",
        );

        if (memberError) throw memberError;
        if (memberData?.workspace_id) {
          if (mounted) setWorkspaceId(memberData.workspace_id);
          if (typeof window !== "undefined") {
            window.localStorage.setItem(
              "coachos_workspace_id",
              memberData.workspace_id,
            );
          }
          return;
        }

        const { data: clientData, error: clientError } = await withTimeout(
          supabase
            .from("clients")
            .select("workspace_id")
            .eq("user_id", user.id)
            .maybeSingle(),
          8000,
          "Client workspace lookup timed out (8s).",
        );

        if (clientError) throw clientError;
        if (!clientData?.workspace_id) {
          throw new Error("Workspace not found for this user.");
        }
        if (mounted) setWorkspaceId(clientData.workspace_id);
        if (typeof window !== "undefined") {
          window.localStorage.setItem(
            "coachos_workspace_id",
            clientData.workspace_id,
          );
        }
      } catch (err) {
        console.error("Workspace bootstrap failed", err);
        if (mounted) {
          setWorkspaceId(null);
          if (typeof window !== "undefined") {
            window.localStorage.removeItem("coachos_workspace_id");
          }
          setError(
            err instanceof Error
              ? err
              : new Error("Workspace bootstrap failed"),
          );
        }
      } finally {
        if (mounted) setLoading(false);
      }
    };

    loadWorkspace();

    return () => {
      mounted = false;
    };
  }, [user?.id, hasCached]);

  return { workspaceId, loading, error };
}

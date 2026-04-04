import { useCallback, useEffect, useState } from "react";
import { supabase } from "./supabase";
import { useAuth } from "./auth";

const ACTIVE_WORKSPACE_STORAGE_KEY = "coachos_workspace_id";

export function useWorkspace() {
  const { user } = useAuth();
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [workspaceIds, setWorkspaceIds] = useState<string[]>([]);
  const [ownerUserId, setOwnerUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [hasCached, setHasCached] = useState(false);
  const [reloadNonce, setReloadNonce] = useState(0);

  const switchWorkspace = useCallback((nextWorkspaceId: string) => {
    if (!nextWorkspaceId) return;
    setWorkspaceId(nextWorkspaceId);
    setHasCached(true);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(
        ACTIVE_WORKSPACE_STORAGE_KEY,
        nextWorkspaceId,
      );
    }
  }, []);

  const refreshWorkspace = useCallback(() => {
    setReloadNonce((value) => value + 1);
  }, []);

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
      const cached = window.localStorage.getItem(ACTIVE_WORKSPACE_STORAGE_KEY);
      if (cached) {
        setWorkspaceId(cached);
        setHasCached(true);
        setLoading(false);
      }
    }

    const loadWorkspace = async () => {
      if (!user?.id) {
        setWorkspaceId(null);
        setWorkspaceIds([]);
        setOwnerUserId(null);
        setHasCached(false);
        setLoading(false);
        if (typeof window !== "undefined") {
          window.localStorage.removeItem(ACTIVE_WORKSPACE_STORAGE_KEY);
        }
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
            .returns<
              Array<{ workspace_id: string | null; created_at: string }>
            >(),
          8000,
          "Workspace lookup timed out (8s).",
        );

        if (memberError) throw memberError;
        const memberWorkspaceIds = (memberData ?? [])
          .map((member) => member.workspace_id)
          .filter((id): id is string => Boolean(id));
        if (memberWorkspaceIds.length > 0) {
          const { data: workspaceData, error: workspaceError } =
            await withTimeout(
              supabase
                .from("workspaces")
                .select("id, owner_user_id")
                .in("id", memberWorkspaceIds)
                .returns<Array<{ id: string; owner_user_id: string | null }>>(),
              8000,
              "Workspace owner lookup timed out (8s).",
            );

          if (workspaceError) throw workspaceError;

          const cachedWorkspaceId =
            typeof window !== "undefined"
              ? window.localStorage.getItem(ACTIVE_WORKSPACE_STORAGE_KEY)
              : null;
          const selectedWorkspaceId =
            cachedWorkspaceId && memberWorkspaceIds.includes(cachedWorkspaceId)
              ? cachedWorkspaceId
              : (memberWorkspaceIds[0] ?? null);
          if (!selectedWorkspaceId) {
            throw new Error("Workspace not found for this user.");
          }
          const selectedWorkspace =
            (workspaceData ?? []).find(
              (workspace) => workspace.id === selectedWorkspaceId,
            ) ?? null;
          if (!selectedWorkspace?.owner_user_id) {
            throw new Error("Workspace owner not found for this user.");
          }
          if (mounted) {
            setWorkspaceIds(memberWorkspaceIds);
            setWorkspaceId(selectedWorkspaceId);
            setOwnerUserId(selectedWorkspace.owner_user_id);
          }
          if (typeof window !== "undefined") {
            window.localStorage.setItem(
              ACTIVE_WORKSPACE_STORAGE_KEY,
              selectedWorkspaceId,
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
        if (mounted) {
          setWorkspaceId(clientData.workspace_id);
          setWorkspaceIds([clientData.workspace_id]);
          // Client users can read their own client row, but current workspaces
          // RLS only grants read access to workspace_members. The client portal
          // only requires workspace_id, so avoid hard-failing on owner lookup.
          setOwnerUserId(null);
        }
        if (typeof window !== "undefined") {
          window.localStorage.setItem(
            ACTIVE_WORKSPACE_STORAGE_KEY,
            clientData.workspace_id,
          );
        }
      } catch (err) {
        console.error("Workspace bootstrap failed", err);
        if (mounted) {
          setWorkspaceId(null);
          setWorkspaceIds([]);
          setOwnerUserId(null);
          if (typeof window !== "undefined") {
            window.localStorage.removeItem(ACTIVE_WORKSPACE_STORAGE_KEY);
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
  }, [user?.id, hasCached, reloadNonce]);

  return {
    workspaceId,
    workspaceIds,
    ownerUserId,
    loading,
    error,
    switchWorkspace,
    refreshWorkspace,
  };
}

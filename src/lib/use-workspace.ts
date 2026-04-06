import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "./supabase";
import { useBootstrapAuth, useSessionAuth } from "./auth";

const ACTIVE_WORKSPACE_STORAGE_KEY = "coachos_workspace_id";

type WorkspaceSnapshot = {
  workspaceId: string | null;
  workspaceIds: string[];
  ownerUserId: string | null;
};

const emptyWorkspaceSnapshot: WorkspaceSnapshot = {
  workspaceId: null,
  workspaceIds: [],
  ownerUserId: null,
};

export function useWorkspace() {
  const { user } = useSessionAuth();
  const {
    accountType,
    activeWorkspaceId: bootstrapWorkspaceId,
    bootstrapError,
    bootstrapResolved,
    bootstrapStale,
    hasStableBootstrap,
    hasWorkspaceMembership,
  } = useBootstrapAuth();
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [workspaceIds, setWorkspaceIds] = useState<string[]>([]);
  const [ownerUserId, setOwnerUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [hasCached, setHasCached] = useState(false);
  const [reloadNonce, setReloadNonce] = useState(0);
  const lastStableWorkspaceRef = useRef<WorkspaceSnapshot>(emptyWorkspaceSnapshot);
  const requestIdRef = useRef(0);

  const switchWorkspace = useCallback((nextWorkspaceId: string) => {
    if (!nextWorkspaceId) return;
    setWorkspaceId(nextWorkspaceId);
    setWorkspaceIds((current) =>
      current.includes(nextWorkspaceId) ? current : [nextWorkspaceId, ...current],
    );
    setHasCached(true);
    lastStableWorkspaceRef.current = {
      workspaceId: nextWorkspaceId,
      workspaceIds: lastStableWorkspaceRef.current.workspaceIds.includes(nextWorkspaceId)
        ? lastStableWorkspaceRef.current.workspaceIds
        : [nextWorkspaceId, ...lastStableWorkspaceRef.current.workspaceIds],
      ownerUserId: lastStableWorkspaceRef.current.ownerUserId,
    };
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

  const applyWorkspaceSnapshot = useCallback((snapshot: WorkspaceSnapshot) => {
    setWorkspaceId(snapshot.workspaceId);
    setWorkspaceIds(snapshot.workspaceIds);
    setOwnerUserId(snapshot.ownerUserId);
    if (snapshot.workspaceId) {
      lastStableWorkspaceRef.current = snapshot;
      if (typeof window !== "undefined") {
        window.localStorage.setItem(ACTIVE_WORKSPACE_STORAGE_KEY, snapshot.workspaceId);
      }
    }
  }, []);

  const applyStaleWorkspaceSnapshot = useCallback(
    (nextError: Error) => {
      const fallback = lastStableWorkspaceRef.current;
      if (fallback.workspaceId) {
        applyWorkspaceSnapshot(fallback);
      }
      setError(nextError);
      setLoading(false);
    },
    [applyWorkspaceSnapshot],
  );

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
    if (typeof window !== "undefined") {
      const cached = window.localStorage.getItem(ACTIVE_WORKSPACE_STORAGE_KEY);
      if (cached) {
        setWorkspaceId(cached);
        setHasCached(true);
        setLoading(false);
      }
    }

    if (
      bootstrapWorkspaceId &&
      (bootstrapResolved || (bootstrapStale && hasStableBootstrap)) &&
      (workspaceId !== bootstrapWorkspaceId ||
        (hasWorkspaceMembership &&
          accountType === "pt" &&
          !workspaceIds.includes(bootstrapWorkspaceId)))
    ) {
      const seededWorkspaceIds =
        hasWorkspaceMembership && accountType === "pt"
          ? workspaceIds.includes(bootstrapWorkspaceId)
            ? workspaceIds
            : [bootstrapWorkspaceId, ...workspaceIds]
          : [bootstrapWorkspaceId];
      const seededSnapshot = {
        workspaceId: bootstrapWorkspaceId,
        workspaceIds: seededWorkspaceIds,
        ownerUserId:
          accountType === "pt"
            ? lastStableWorkspaceRef.current.ownerUserId
            : null,
      };
      applyWorkspaceSnapshot(seededSnapshot);
      setHasCached(true);
      setLoading(false);
      setError(null);
    }
  }, [
    accountType,
    applyWorkspaceSnapshot,
    bootstrapResolved,
    bootstrapStale,
    bootstrapWorkspaceId,
    hasStableBootstrap,
    hasWorkspaceMembership,
    workspaceId,
    workspaceIds,
  ]);

  useEffect(() => {
    if (!bootstrapWorkspaceId || !bootstrapError) return;
    if (lastStableWorkspaceRef.current.workspaceId) {
      setError(bootstrapError);
      setLoading(false);
    }
  }, [bootstrapError, bootstrapWorkspaceId]);

  useEffect(() => {
    let mounted = true;
    const currentRequestId = ++requestIdRef.current;
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

      const preservedSnapshot = lastStableWorkspaceRef.current;
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
        if (!mounted || currentRequestId !== requestIdRef.current) return;
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
          if (!mounted || currentRequestId !== requestIdRef.current) return;

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
            applyWorkspaceSnapshot({
              workspaceId: selectedWorkspaceId,
              workspaceIds: memberWorkspaceIds,
              ownerUserId: selectedWorkspace.owner_user_id,
            });
            setError(null);
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
        if (!mounted || currentRequestId !== requestIdRef.current) return;
        if (!clientData?.workspace_id) {
          throw new Error("Workspace not found for this user.");
        }
        if (mounted) {
          applyWorkspaceSnapshot({
            workspaceId: clientData.workspace_id,
            workspaceIds: [clientData.workspace_id],
            ownerUserId: null,
          });
          setError(null);
        }
      } catch (err) {
        console.error("Workspace bootstrap failed", err);
        if (mounted && currentRequestId === requestIdRef.current) {
          const nextError =
            err instanceof Error
              ? err
              : new Error("Workspace bootstrap failed");
          const isTransient =
            nextError.message.toLowerCase().includes("timed out") ||
            bootstrapStale;

          if (isTransient && preservedSnapshot.workspaceId) {
            applyStaleWorkspaceSnapshot(nextError);
            return;
          }

          if (!preservedSnapshot.workspaceId) {
            setWorkspaceId(null);
            setWorkspaceIds([]);
            setOwnerUserId(null);
            if (typeof window !== "undefined") {
              window.localStorage.removeItem(ACTIVE_WORKSPACE_STORAGE_KEY);
            }
          }
          setError(nextError);
        }
      } finally {
        if (mounted && currentRequestId === requestIdRef.current) {
          setLoading(false);
        }
      }
    };

    void loadWorkspace();

    return () => {
      mounted = false;
    };
  }, [
    accountType,
    applyStaleWorkspaceSnapshot,
    applyWorkspaceSnapshot,
    bootstrapStale,
    hasCached,
    reloadNonce,
    user?.id,
  ]);

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

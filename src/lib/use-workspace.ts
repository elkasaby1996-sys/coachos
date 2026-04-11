import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "./supabase";
import { useBootstrapAuth, useSessionAuth } from "./auth";

const ACTIVE_WORKSPACE_STORAGE_KEY = "coachos_workspace_id";
const WORKSPACE_CHANGE_EVENT = "coachos:workspace-change";
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value: string | null | undefined): value is string {
  return Boolean(value && UUID_PATTERN.test(value));
}

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
    if (!isUuid(nextWorkspaceId)) return;
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
      window.dispatchEvent(
        new CustomEvent<{ workspaceId: string }>(WORKSPACE_CHANGE_EVENT, {
          detail: { workspaceId: nextWorkspaceId },
        }),
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
    let cachedWorkspaceId: string | null = null;
    if (typeof window !== "undefined") {
      const cached = window.localStorage.getItem(ACTIVE_WORKSPACE_STORAGE_KEY);
      if (isUuid(cached)) {
        cachedWorkspaceId = cached;
        setWorkspaceId(cached);
        setHasCached(true);
      } else if (cached) {
        window.localStorage.removeItem(ACTIVE_WORKSPACE_STORAGE_KEY);
      }
    }

    if (
      bootstrapWorkspaceId &&
      (bootstrapResolved || (bootstrapStale && hasStableBootstrap)) &&
      (!workspaceId ||
        (!cachedWorkspaceId && !hasCached) ||
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
    hasCached,
    hasWorkspaceMembership,
    workspaceId,
    workspaceIds,
  ]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const applyIncomingWorkspace = (nextWorkspaceId: string) => {
      if (!isUuid(nextWorkspaceId)) return;

      setWorkspaceId(nextWorkspaceId);
      setWorkspaceIds((current) =>
        current.includes(nextWorkspaceId)
          ? current
          : [nextWorkspaceId, ...current],
      );
      setHasCached(true);
      lastStableWorkspaceRef.current = {
        workspaceId: nextWorkspaceId,
        workspaceIds: lastStableWorkspaceRef.current.workspaceIds.includes(
          nextWorkspaceId,
        )
          ? lastStableWorkspaceRef.current.workspaceIds
          : [nextWorkspaceId, ...lastStableWorkspaceRef.current.workspaceIds],
        ownerUserId: lastStableWorkspaceRef.current.ownerUserId,
      };
    };

    const handleWorkspaceEvent = (event: Event) => {
      const customEvent = event as CustomEvent<{ workspaceId?: string }>;
      const nextWorkspaceId = customEvent.detail?.workspaceId;
      if (!nextWorkspaceId) return;
      applyIncomingWorkspace(nextWorkspaceId);
    };

    const handleStorageEvent = (event: StorageEvent) => {
      if (event.key !== ACTIVE_WORKSPACE_STORAGE_KEY) return;
      if (!event.newValue) return;
      applyIncomingWorkspace(event.newValue);
    };

    window.addEventListener(
      WORKSPACE_CHANGE_EVENT,
      handleWorkspaceEvent as EventListener,
    );
    window.addEventListener("storage", handleStorageEvent);

    return () => {
      window.removeEventListener(
        WORKSPACE_CHANGE_EVENT,
        handleWorkspaceEvent as EventListener,
      );
      window.removeEventListener("storage", handleStorageEvent);
    };
  }, []);

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

      if (accountType === "client" && !hasWorkspaceMembership) {
        setWorkspaceId(null);
        setWorkspaceIds([]);
        setOwnerUserId(null);
        setHasCached(false);
        setError(null);
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
        const [memberResult, ownedResult] = await Promise.all([
          withTimeout(
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
          ),
          withTimeout(
            supabase
              .from("workspaces")
              .select("id, owner_user_id, created_at")
              .eq("owner_user_id", user.id)
              .order("created_at", { ascending: true })
              .returns<
                Array<{
                  id: string;
                  owner_user_id: string | null;
                  created_at: string;
                }>
              >(),
            8000,
            "Owned workspace lookup timed out (8s).",
          ),
        ]);

        if (memberResult.error) throw memberResult.error;
        if (ownedResult.error) throw ownedResult.error;
        if (!mounted || currentRequestId !== requestIdRef.current) return;
        const memberWorkspaceIds = (memberResult.data ?? [])
          .map((member) => member.workspace_id)
          .filter((id): id is string => Boolean(id));
        const ownerWorkspaceIds = (ownedResult.data ?? [])
          .map((workspace) => workspace.id)
          .filter((id): id is string => Boolean(id));
        const combinedWorkspaceIds = Array.from(
          new Set([...memberWorkspaceIds, ...ownerWorkspaceIds]),
        );
        if (combinedWorkspaceIds.length > 0) {
          const { data: workspaceData, error: workspaceError } =
            await withTimeout(
              supabase
                .from("workspaces")
                .select("id, owner_user_id")
                .in("id", combinedWorkspaceIds)
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
            cachedWorkspaceId && combinedWorkspaceIds.includes(cachedWorkspaceId)
              ? cachedWorkspaceId
              : (combinedWorkspaceIds[0] ?? null);
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
              workspaceIds: combinedWorkspaceIds,
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
    hasWorkspaceMembership,
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

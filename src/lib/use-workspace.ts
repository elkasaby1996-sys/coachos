import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { supabase } from "./supabase";
import { useBootstrapAuth, useSessionAuth } from "./auth";
import { traceAsync, traceEnd, tracePoint, traceStart } from "./perf-trace";

const ACTIVE_WORKSPACE_STORAGE_KEY = "coachos_workspace_id";
const WORKSPACE_CHANGE_EVENT = "coachos:workspace-change";
const WORKSPACE_RECENT_SUCCESS_TTL_MS = 3_000;
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

type WorkspaceContextValue = {
  workspaceId: string | null;
  workspaceIds: string[];
  ownerUserId: string | null;
  loading: boolean;
  error: Error | null;
  switchWorkspace: (nextWorkspaceId: string) => void;
  refreshWorkspace: () => void;
};

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

const emptyWorkspaceSnapshot: WorkspaceSnapshot = {
  workspaceId: null,
  workspaceIds: [],
  ownerUserId: null,
};

function readCachedWorkspaceId() {
  if (typeof window === "undefined") return null;
  const cachedWorkspaceId = window.localStorage.getItem(
    ACTIVE_WORKSPACE_STORAGE_KEY,
  );
  if (isUuid(cachedWorkspaceId)) return cachedWorkspaceId;
  if (cachedWorkspaceId) {
    window.localStorage.removeItem(ACTIVE_WORKSPACE_STORAGE_KEY);
  }
  return null;
}

function prioritizeWorkspaceIds(
  selectedWorkspaceId: string,
  workspaceIds: string[],
) {
  const uniqueWorkspaceIds = Array.from(new Set(workspaceIds));
  return [
    selectedWorkspaceId,
    ...uniqueWorkspaceIds.filter(
      (workspaceId) => workspaceId !== selectedWorkspaceId,
    ),
  ];
}

function useWorkspaceState(): WorkspaceContextValue {
  const { authLoading, user } = useSessionAuth();
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
  const [storageHydrated, setStorageHydrated] = useState(
    typeof window === "undefined",
  );
  const [reloadNonce, setReloadNonce] = useState(0);
  const lastStableWorkspaceRef = useRef<WorkspaceSnapshot>(
    emptyWorkspaceSnapshot,
  );
  const workspaceIdRef = useRef<string | null>(null);
  const hasCachedRef = useRef(false);
  const requestIdRef = useRef(0);
  const lastLoadedWorkspaceKeyRef = useRef<string | null>(null);
  const lastLoadedWorkspaceAtRef = useRef(0);
  const inFlightWorkspaceLoadKeyRef = useRef<string | null>(null);

  const setWorkspaceIdValue = useCallback((nextWorkspaceId: string | null) => {
    workspaceIdRef.current = nextWorkspaceId;
    setWorkspaceId(nextWorkspaceId);
  }, []);

  const setHasCachedValue = useCallback((nextHasCached: boolean) => {
    hasCachedRef.current = nextHasCached;
    setHasCached(nextHasCached);
  }, []);

  const switchWorkspace = useCallback((nextWorkspaceId: string) => {
    if (!isUuid(nextWorkspaceId)) return;
    setWorkspaceIdValue(nextWorkspaceId);
    setWorkspaceIds((current) =>
      prioritizeWorkspaceIds(nextWorkspaceId, current),
    );
    setHasCachedValue(true);
    lastLoadedWorkspaceKeyRef.current = null;
    lastLoadedWorkspaceAtRef.current = 0;
    lastStableWorkspaceRef.current = {
      workspaceId: nextWorkspaceId,
      workspaceIds: prioritizeWorkspaceIds(
        nextWorkspaceId,
        lastStableWorkspaceRef.current.workspaceIds,
      ),
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
  }, [setHasCachedValue, setWorkspaceIdValue]);

  const refreshWorkspace = useCallback(() => {
    lastLoadedWorkspaceKeyRef.current = null;
    lastLoadedWorkspaceAtRef.current = 0;
    setReloadNonce((value) => value + 1);
  }, []);

  const applyWorkspaceSnapshot = useCallback((snapshot: WorkspaceSnapshot) => {
    const normalizedWorkspaceIds =
      snapshot.workspaceId && isUuid(snapshot.workspaceId)
        ? prioritizeWorkspaceIds(snapshot.workspaceId, snapshot.workspaceIds)
        : snapshot.workspaceIds;
    setWorkspaceIdValue(snapshot.workspaceId);
    setWorkspaceIds(normalizedWorkspaceIds);
    setOwnerUserId(snapshot.ownerUserId);
    if (snapshot.workspaceId) {
      lastStableWorkspaceRef.current = {
        workspaceId: snapshot.workspaceId,
        workspaceIds: normalizedWorkspaceIds,
        ownerUserId: snapshot.ownerUserId,
      };
      if (typeof window !== "undefined") {
        window.localStorage.setItem(
          ACTIVE_WORKSPACE_STORAGE_KEY,
          snapshot.workspaceId,
        );
      }
    }
  }, [setWorkspaceIdValue]);

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
    if (typeof window === "undefined") {
      setStorageHydrated(true);
      return;
    }

    const cachedWorkspaceId = readCachedWorkspaceId();
    if (cachedWorkspaceId) {
      setWorkspaceIdValue(cachedWorkspaceId);
      setWorkspaceIds((current) =>
        current.includes(cachedWorkspaceId)
          ? current
          : [cachedWorkspaceId, ...current],
      );
      setHasCachedValue(true);
      lastStableWorkspaceRef.current = {
        workspaceId: cachedWorkspaceId,
        workspaceIds: prioritizeWorkspaceIds(
          cachedWorkspaceId,
          lastStableWorkspaceRef.current.workspaceIds,
        ),
        ownerUserId: lastStableWorkspaceRef.current.ownerUserId,
      };
    }

    setStorageHydrated(true);
  }, [setHasCachedValue, setWorkspaceIdValue]);

  useEffect(() => {
    if (!storageHydrated) return;
    if (
      bootstrapWorkspaceId &&
      (bootstrapResolved || (bootstrapStale && hasStableBootstrap)) &&
      !workspaceId
    ) {
      const seededWorkspaceIds =
        hasWorkspaceMembership && accountType === "pt"
          ? prioritizeWorkspaceIds(bootstrapWorkspaceId, workspaceIds)
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
      setHasCachedValue(true);
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
    storageHydrated,
    hasWorkspaceMembership,
    setHasCachedValue,
    workspaceId,
    workspaceIds,
  ]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const applyIncomingWorkspace = (nextWorkspaceId: string) => {
      if (!isUuid(nextWorkspaceId)) return;

      setWorkspaceIdValue(nextWorkspaceId);
      setWorkspaceIds((current) =>
        prioritizeWorkspaceIds(nextWorkspaceId, current),
      );
      setHasCachedValue(true);
      lastStableWorkspaceRef.current = {
        workspaceId: nextWorkspaceId,
        workspaceIds: prioritizeWorkspaceIds(
          nextWorkspaceId,
          lastStableWorkspaceRef.current.workspaceIds,
        ),
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
  }, [setHasCachedValue, setWorkspaceIdValue]);

  useEffect(() => {
    if (!bootstrapWorkspaceId || !bootstrapError) return;
    if (lastStableWorkspaceRef.current.workspaceId) {
      setError(bootstrapError);
      setLoading(false);
    }
  }, [bootstrapError, bootstrapWorkspaceId]);

  useEffect(() => {
    let mounted = true;
    const currentRequestId = requestIdRef.current + 1;
    const loadWorkspace = async () => {
      const currentWorkspaceId = workspaceIdRef.current;
      const currentHasCached = hasCachedRef.current;
      const loadStartedAt = traceStart("useWorkspace.load", {
        requestId: currentRequestId,
        userId: user?.id ?? null,
        accountType,
        hasCached: currentHasCached,
        workspaceId: currentWorkspaceId,
      });
      if (!storageHydrated) {
        setLoading(true);
        traceEnd("useWorkspace.load", loadStartedAt, {
          requestId: currentRequestId,
          result: "storage-pending",
        });
        return;
      }

      if (authLoading) {
        setLoading(true);
        traceEnd("useWorkspace.load", loadStartedAt, {
          requestId: currentRequestId,
          result: "auth-pending",
        });
        return;
      }

      if (!user?.id) {
        setWorkspaceIdValue(null);
        setWorkspaceIds([]);
        setOwnerUserId(null);
        setHasCachedValue(false);
        lastLoadedWorkspaceKeyRef.current = null;
        lastLoadedWorkspaceAtRef.current = 0;
        inFlightWorkspaceLoadKeyRef.current = null;
        setLoading(false);
        if (typeof window !== "undefined") {
          window.localStorage.removeItem(ACTIVE_WORKSPACE_STORAGE_KEY);
        }
        traceEnd("useWorkspace.load", loadStartedAt, {
          requestId: currentRequestId,
          result: "no-user",
        });
        return;
      }

      if (!bootstrapResolved && !(bootstrapStale && hasStableBootstrap)) {
        setLoading(true);
        traceEnd("useWorkspace.load", loadStartedAt, {
          requestId: currentRequestId,
          result: "bootstrap-pending",
        });
        return;
      }

      if (accountType === "client" && !hasWorkspaceMembership) {
        setWorkspaceIdValue(null);
        setWorkspaceIds([]);
        setOwnerUserId(null);
        setHasCachedValue(false);
        lastLoadedWorkspaceKeyRef.current = null;
        lastLoadedWorkspaceAtRef.current = 0;
        inFlightWorkspaceLoadKeyRef.current = null;
        setError(null);
        setLoading(false);
        if (typeof window !== "undefined") {
          window.localStorage.removeItem(ACTIVE_WORKSPACE_STORAGE_KEY);
        }
        traceEnd("useWorkspace.load", loadStartedAt, {
          requestId: currentRequestId,
          result: "client-no-workspace-membership",
        });
        return;
      }

      const preservedSnapshot = lastStableWorkspaceRef.current;
      const workspaceLoadKey = [
        user.id,
        accountType,
        bootstrapWorkspaceId ?? "none",
        currentWorkspaceId ?? "none",
        reloadNonce,
      ].join(":");
      if (
        currentHasCached &&
        currentWorkspaceId &&
        lastLoadedWorkspaceKeyRef.current === workspaceLoadKey
      ) {
        const recent = Date.now() - lastLoadedWorkspaceAtRef.current;
        const result =
          recent < WORKSPACE_RECENT_SUCCESS_TTL_MS
            ? "recent-success"
            : "already-loaded";
        setLoading(false);
        traceEnd("useWorkspace.load", loadStartedAt, {
          requestId: currentRequestId,
          result,
          key: workspaceLoadKey,
          workspaceId: currentWorkspaceId,
        });
        return;
      }
      if (inFlightWorkspaceLoadKeyRef.current === workspaceLoadKey) {
        setLoading(false);
        traceEnd("useWorkspace.load", loadStartedAt, {
          requestId: currentRequestId,
          result: "in-flight",
          key: workspaceLoadKey,
          workspaceId: currentWorkspaceId,
        });
        return;
      }
      if (!currentHasCached) {
        setLoading(true);
      }
      setError(null);
      requestIdRef.current = currentRequestId;
      inFlightWorkspaceLoadKeyRef.current = workspaceLoadKey;

      try {
        const [memberResult, ownedResult] = await Promise.all([
          traceAsync("useWorkspace.workspace_members", () =>
            withTimeout(
            supabase
              .from("workspace_members")
              .select("workspace_id, created_at, status")
              .eq("user_id", user.id)
              .eq("status", "active")
              .order("created_at", { ascending: true })
              .returns<
                Array<{
                  workspace_id: string | null;
                  created_at: string;
                  status: string | null;
                }>
              >(),
              8000,
              "Workspace lookup timed out (8s).",
            ),
            { userId: user.id },
          ),
          traceAsync("useWorkspace.owned_workspaces", () =>
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
            { userId: user.id },
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
            await traceAsync(
              "useWorkspace.workspace_owner_lookup",
              () =>
                withTimeout(
              supabase
                .from("workspaces")
                .select("id, owner_user_id")
                .in("id", combinedWorkspaceIds)
                .returns<Array<{ id: string; owner_user_id: string | null }>>(),
                  8000,
                  "Workspace owner lookup timed out (8s).",
                ),
              { workspaceCount: combinedWorkspaceIds.length },
            );

          if (workspaceError) throw workspaceError;
          if (!mounted || currentRequestId !== requestIdRef.current) return;

          const cachedWorkspaceId = readCachedWorkspaceId();
          const preferredWorkspaceId = [
            currentWorkspaceId,
            cachedWorkspaceId,
            preservedSnapshot.workspaceId,
            bootstrapWorkspaceId,
          ].find((candidate): candidate is string =>
            Boolean(candidate && combinedWorkspaceIds.includes(candidate)),
          );
          const selectedWorkspaceId =
            preferredWorkspaceId ?? combinedWorkspaceIds[0] ?? null;
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
          const orderedWorkspaceIds = prioritizeWorkspaceIds(
            selectedWorkspaceId,
            combinedWorkspaceIds,
          );
          if (mounted) {
            applyWorkspaceSnapshot({
              workspaceId: selectedWorkspaceId,
              workspaceIds: orderedWorkspaceIds,
              ownerUserId: selectedWorkspace.owner_user_id,
            });
            lastLoadedWorkspaceKeyRef.current = workspaceLoadKey;
            lastLoadedWorkspaceAtRef.current = Date.now();
            setError(null);
          }
          traceEnd("useWorkspace.load", loadStartedAt, {
            requestId: currentRequestId,
            result: "workspace-selected",
            workspaceId: selectedWorkspaceId,
          });
          return;
        }

        const { data: clientData, error: clientError } = await traceAsync(
          "useWorkspace.client_workspace",
          () =>
            withTimeout(
              supabase
                .from("clients")
                .select("workspace_id")
                .eq("user_id", user.id)
                .maybeSingle(),
              8000,
              "Client workspace lookup timed out (8s).",
            ),
          { userId: user.id },
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
          lastLoadedWorkspaceKeyRef.current = workspaceLoadKey;
          lastLoadedWorkspaceAtRef.current = Date.now();
          setError(null);
        }
        traceEnd("useWorkspace.load", loadStartedAt, {
          requestId: currentRequestId,
          result: "client-workspace-selected",
          workspaceId: clientData.workspace_id,
        });
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
            traceEnd("useWorkspace.load", loadStartedAt, {
              requestId: currentRequestId,
              result: "stale-fallback",
              error: nextError.message,
            });
            return;
          }

          if (!preservedSnapshot.workspaceId) {
            setWorkspaceIdValue(null);
            setWorkspaceIds([]);
            setOwnerUserId(null);
            lastLoadedWorkspaceKeyRef.current = null;
            lastLoadedWorkspaceAtRef.current = 0;
            if (typeof window !== "undefined") {
              window.localStorage.removeItem(ACTIVE_WORKSPACE_STORAGE_KEY);
            }
          }
          setError(nextError);
          traceEnd("useWorkspace.load", loadStartedAt, {
            requestId: currentRequestId,
            result: "error",
            error: nextError.message,
          });
        }
      } finally {
        if (mounted && currentRequestId === requestIdRef.current) {
          setLoading(false);
        }
        tracePoint("useWorkspace.load:finally", {
          requestId: currentRequestId,
        });
        if (inFlightWorkspaceLoadKeyRef.current === workspaceLoadKey) {
          inFlightWorkspaceLoadKeyRef.current = null;
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
    authLoading,
    bootstrapResolved,
    bootstrapWorkspaceId,
    bootstrapStale,
    hasStableBootstrap,
    hasWorkspaceMembership,
    reloadNonce,
    setHasCachedValue,
    setWorkspaceIdValue,
    storageHydrated,
    user?.id,
  ]);

  return useMemo(
    () => ({
      workspaceId,
      workspaceIds,
      ownerUserId,
      loading,
      error,
      switchWorkspace,
      refreshWorkspace,
    }),
    [
      error,
      loading,
      ownerUserId,
      refreshWorkspace,
      switchWorkspace,
      workspaceId,
      workspaceIds,
    ],
  );
}

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const value = useWorkspaceState();
  return createElement(WorkspaceContext.Provider, { value }, children);
}

export function useWorkspace() {
  const workspaceContext = useContext(WorkspaceContext);
  if (!workspaceContext) {
    throw new Error("useWorkspace must be used within WorkspaceProvider");
  }
  return workspaceContext;
}

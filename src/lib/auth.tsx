import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase, supabaseConfigured } from "./supabase";

type AppRole = "pt" | "client" | "none";

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  loading: boolean;
  authError: Error | null;
  role: AppRole;
  refreshRole?: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);
const ROLE_LOOKUP_TIMEOUT_CODE = "ROLE_LOOKUP_TIMEOUT";
const ROLE_STORAGE_KEY = "coachos_cached_role";
const WORKSPACE_LOOKUP_TIMEOUT_MS = 2_500;
const CLIENT_LOOKUP_TIMEOUT_STEPS_MS = [1_500, 3_000] as const;
const SESSION_LOAD_TIMEOUT_MS = 30_000;

function getCachedRole(): AppRole {
  if (typeof window === "undefined") return "none";
  const value = window.localStorage.getItem(ROLE_STORAGE_KEY);
  return value === "pt" || value === "client" ? value : "none";
}

function withTimeout<T>(
  promise: PromiseLike<T>,
  ms: number,
  message: string,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(message)), ms);
    Promise.resolve(promise)
      .then((value) => {
        window.clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        window.clearTimeout(timer);
        reject(error);
      });
  });
}

async function ensureFreshSession(
  session: Session | null,
): Promise<Session | null> {
  if (!session) return null;
  const expiresAtMs = (session.expires_at ?? 0) * 1000;
  const now = Date.now();
  if (expiresAtMs === 0 || expiresAtMs - now > 30_000) {
    return session;
  }

  try {
    const { data, error } = await withTimeout(
      supabase.auth.refreshSession(),
      10000,
      "Session refresh timed out (10s).",
    );
    if (error || !data.session) {
      // Keep the current session when refresh transiently fails.
      // Forced sign-out here can bounce users to /login during active flows.
      console.warn("Session refresh failed; retaining current session.", error);
      return session;
    }
    return data.session;
  } catch (error) {
    console.warn(
      "Session refresh timed out/failed; retaining current session.",
    );
    return session;
  }
}

async function resolveRole(userId: string): Promise<{
  role: AppRole;
  workspaceMember: unknown;
  clientMember: unknown;
}> {
  let workspaceLookupTimedOut = false;
  let workspaceMember: { data: unknown; error: unknown } = {
    data: null,
    error: null,
  };

  try {
    workspaceMember = await withTimeout(
      supabase
        .from("workspace_members")
        .select("workspace_id, role")
        .eq("user_id", userId)
        .maybeSingle(),
      WORKSPACE_LOOKUP_TIMEOUT_MS,
      `Workspace membership lookup timed out (${Math.round(WORKSPACE_LOOKUP_TIMEOUT_MS / 1000)}s).`,
    );
  } catch (error) {
    if (error instanceof Error && error.message.includes("timed out")) {
      workspaceLookupTimedOut = true;
      workspaceMember = { data: null, error: null };
    } else {
      throw error;
    }
  }

  if (workspaceLookupTimedOut) {
    const timeoutError = new Error(
      "Role resolution failed due to workspace lookup timeout.",
    );
    timeoutError.name = ROLE_LOOKUP_TIMEOUT_CODE;
    throw timeoutError;
  }

  if (workspaceMember.error) throw workspaceMember.error;
  const workspaceRole =
    (workspaceMember.data as { role?: string } | null)?.role ?? null;
  if (workspaceRole && workspaceRole.startsWith("pt")) {
    return {
      role: "pt",
      workspaceMember: workspaceMember.data,
      clientMember: null,
    };
  }

  let clientMember: { data: unknown; error: unknown } = {
    data: null,
    error: null,
  };
  let clientLookupUnstable = false;
  const clientQuery = `clients.select("id, workspace_id").eq("user_id", "${userId}")`;

  for (const timeoutMs of CLIENT_LOOKUP_TIMEOUT_STEPS_MS) {
    try {
      clientMember = await withTimeout(
        supabase
          .from("clients")
          .select("id, workspace_id")
          .eq("user_id", userId)
          .maybeSingle(),
        timeoutMs,
        `Client lookup timed out (${Math.round(timeoutMs / 1000)}s).`,
      );
      clientLookupUnstable = false;
      break;
    } catch (error) {
      clientLookupUnstable = true;
      if (error instanceof Error && error.message.includes("timed out")) {
        console.warn("Client lookup timed out", {
          userId,
          query: clientQuery,
          timeoutMs,
        });
      } else {
        console.warn("Client lookup failed", {
          userId,
          query: clientQuery,
          error,
          timeoutMs,
        });
      }
      clientMember = { data: null, error: null };
    }
  }

  if (clientMember.error) {
    console.warn("Client lookup error", {
      userId,
      query: clientQuery,
      error: clientMember.error,
    });
    return {
      role: "none",
      workspaceMember: workspaceMember.data,
      clientMember: clientMember.data,
    };
  }
  if (clientMember.data) {
    return {
      role: "client",
      workspaceMember: workspaceMember.data,
      clientMember: clientMember.data,
    };
  }

  if (clientLookupUnstable) {
    console.warn(
      "Client lookup remained unstable; keeping role unresolved this pass",
      {
        userId,
        query: clientQuery,
      },
    );
    const timeoutError = new Error(
      "Role resolution failed due to lookup timeout.",
    );
    timeoutError.name = ROLE_LOOKUP_TIMEOUT_CODE;
    throw timeoutError;
  }

  console.warn("Client record not found or not accessible", {
    userId,
    query: clientQuery,
  });

  return {
    role: "none",
    workspaceMember: workspaceMember.data,
    clientMember: clientMember.data,
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<Error | null>(null);
  const [role, setRole] = useState<AppRole>(() => getCachedRole());
  const resolvingRef = useRef(false);
  const lastResolveKeyRef = useRef("");
  const roleRetryTimerRef = useRef<number | null>(null);

  const resolveRoleOnce = useCallback(
    async (userId: string, options?: { force?: boolean }) => {
      const key = `${userId ?? "none"}`;
      if (!options?.force) {
        if (resolvingRef.current || lastResolveKeyRef.current === key) return;
      }
      resolvingRef.current = true;
      let resolved = false;
      let skippedDemotion = false;
      try {
        const result = await resolveRole(userId);
        setRole((prev) => {
          if (result.role === "none" && prev !== "none" && !options?.force) {
            skippedDemotion = true;
            return prev;
          }
          return prev === result.role ? prev : result.role;
        });
        if (!skippedDemotion) {
          lastResolveKeyRef.current = key;
          resolved = true;
        }
      } catch (error) {
        if (error instanceof Error && error.name === ROLE_LOOKUP_TIMEOUT_CODE) {
          // Keep the current role/session and silently retry on next pass.
          // Showing a blocking auth error here interrupts otherwise valid sessions.
          console.warn(
            "Role resolution timed out; keeping current auth state.",
          );
          setAuthError(null);
          lastResolveKeyRef.current = "";
          if (roleRetryTimerRef.current === null) {
            roleRetryTimerRef.current = window.setTimeout(() => {
              roleRetryTimerRef.current = null;
              void resolveRoleOnce(userId, { force: true });
            }, 1_500);
          }
          return;
        }
        console.error("Failed to resolve role", error);
        setRole((prev) => (prev === "none" ? prev : prev));
      } finally {
        if (!resolved) {
          lastResolveKeyRef.current = "";
        }
        resolvingRef.current = false;
      }
    },
    [],
  );

  const refreshRole = useCallback(async () => {
    setLoading(true);
    try {
      setAuthError(null);
      const { data, error } = await withTimeout(
        supabase.auth.getSession(),
        SESSION_LOAD_TIMEOUT_MS,
        `Session load timed out (${Math.round(SESSION_LOAD_TIMEOUT_MS / 1000)}s).`,
      );
      if (error) {
        setAuthError(new Error(error.message));
        setSession(null);
        setRole("none");
        return;
      }
      const nextSession = await ensureFreshSession(data.session ?? null);
      setSession(nextSession);
      const userId = nextSession?.user?.id ?? null;
      if (userId) {
        await resolveRoleOnce(userId, { force: true });
      } else {
        setRole((prev) => (prev === "none" ? prev : "none"));
        lastResolveKeyRef.current = "";
      }
    } catch (error) {
      setAuthError(error instanceof Error ? error : new Error(String(error)));
      setSession(null);
      setRole("none");
    } finally {
      setLoading(false);
    }
  }, [resolveRoleOnce]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (role === "pt" || role === "client") {
      window.localStorage.setItem(ROLE_STORAGE_KEY, role);
      return;
    }
    window.localStorage.removeItem(ROLE_STORAGE_KEY);
  }, [role]);

  useEffect(() => {
    let alive = true;

    const init = async () => {
      setLoading(true);
      try {
        setAuthError(null);

        if (!supabaseConfigured) {
          throw new Error(
            "Supabase env missing. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.",
          );
        }

        const { data, error } = await withTimeout(
          supabase.auth.getSession(),
          SESSION_LOAD_TIMEOUT_MS,
          `Session load timed out (${Math.round(SESSION_LOAD_TIMEOUT_MS / 1000)}s).`,
        );

        if (!alive) return;

        if (error) {
          setAuthError(new Error(error.message));
          setSession(null);
          setRole("none");
          return;
        }

        const nextSession = await ensureFreshSession(data.session ?? null);
        setSession(nextSession);
        const userId = nextSession?.user?.id ?? null;
        if (userId) {
          if (alive) {
            await resolveRoleOnce(userId);
          }
        } else {
          setRole((prev) => (prev === "none" ? prev : "none"));
          lastResolveKeyRef.current = "";
        }
      } catch (error) {
        if (!alive) return;
        setAuthError(error instanceof Error ? error : new Error(String(error)));
        setSession(null);
        setRole("none");
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    };

    init();

    const { data: sub } = supabase.auth.onAuthStateChange(
      async (_event, newSession) => {
        if (!alive) return;
        setLoading(true);
        const nextSession = await ensureFreshSession(newSession ?? null);
        setSession(nextSession);
        try {
          const userId = nextSession?.user?.id ?? null;
          if (userId) {
            if (alive) {
              await resolveRoleOnce(userId);
            }
          } else {
            setRole((prev) => (prev === "none" ? prev : "none"));
            lastResolveKeyRef.current = "";
          }
        } catch (error) {
          console.error("Failed to resolve role", error);
          if (alive) setRole((prev) => (prev === "none" ? prev : "none"));
        } finally {
          if (alive) setLoading(false);
        }
      },
    );

    return () => {
      alive = false;
      if (roleRetryTimerRef.current !== null) {
        window.clearTimeout(roleRetryTimerRef.current);
        roleRetryTimerRef.current = null;
      }
      sub.subscription.unsubscribe();
    };
  }, [resolveRoleOnce]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user: session?.user ?? null,
      session,
      loading,
      authError,
      role,
      refreshRole,
    }),
    [session, loading, authError, role, refreshRole],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

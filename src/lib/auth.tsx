import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase, supabaseConfigured } from "./supabase";

type AppRole = "pt" | "client" | "none";

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  loading: boolean;
  authError: Error | null;
  role: AppRole;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(message)), ms);
    promise
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

async function resolveRole(userId: string): Promise<AppRole> {
  let workspaceMember: { data: unknown; error: unknown } | null = null;

  try {
    workspaceMember = await withTimeout(
      supabase
        .from("workspace_members")
        .select("workspace_id, role")
        .eq("user_id", userId)
        .maybeSingle(),
      5000,
      "Workspace membership lookup timed out (5s)."
    );
  } catch (error) {
    if (error instanceof Error && error.message.includes("timed out")) {
      workspaceMember = { data: null, error: null };
    } else {
      throw error;
    }
  }

  if (workspaceMember?.error) throw workspaceMember.error;
  const workspaceRole = (workspaceMember?.data as { role?: string } | null)?.role ?? null;
  if (workspaceRole && workspaceRole.startsWith("pt")) {
    console.log("ROLE ROUTE", { wmData: workspaceMember.data, clientData: null });
    return "pt";
  }

  let clientMember: { data: unknown; error: unknown } | null = null;
  const clientQuery = `clients.select("id, workspace_id").eq("user_id", "${userId}")`;

  try {
    clientMember = await withTimeout(
      supabase
        .from("clients")
        .select("id, workspace_id")
        .eq("user_id", userId)
        .maybeSingle(),
      5000,
      "Client lookup timed out (5s)."
    );
  } catch (error) {
    if (error instanceof Error && error.message.includes("timed out")) {
      console.warn("Client lookup timed out", { userId, query: clientQuery });
      clientMember = { data: null, error: null };
    } else {
      console.warn("Client lookup failed", { userId, query: clientQuery, error });
      clientMember = { data: null, error: null };
    }
  }

  if (clientMember?.error) {
    console.warn("Client lookup error", { userId, query: clientQuery, error: clientMember.error });
    return "none";
  }
  console.log("ROLE ROUTE", { wmData: workspaceMember.data, clientData: clientMember.data });
  if (clientMember?.data) return "client";

  console.warn("Client record not found or not accessible", { userId, query: clientQuery });

  return "none";
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<Error | null>(null);
  const [role, setRole] = useState<AppRole>("none");
  const didRouteRef = useRef(false);
  const lastRoutedUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    let alive = true;

    const init = async () => {
      setLoading(true);
      try {
        setAuthError(null);

        if (!supabaseConfigured) {
          throw new Error("Supabase env missing. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.");
        }

        const { data, error } = await withTimeout(
          supabase.auth.getSession(),
          15000,
          "Session load timed out (15s)."
        );

        if (!alive) return;

        if (error) {
          setAuthError(new Error(error.message));
          setSession(null);
          setRole("none");
          return;
        }

        setSession(data.session ?? null);
        const userId = data.session?.user?.id ?? null;
        if (userId && lastRoutedUserIdRef.current !== userId) {
          lastRoutedUserIdRef.current = userId;
          didRouteRef.current = false;
        }
        if (didRouteRef.current) return;
        if (userId) {
          const nextRole = await resolveRole(userId);
          if (alive) {
            setRole(nextRole);
            didRouteRef.current = true;
          }
        } else {
          setRole("none");
          didRouteRef.current = false;
          lastRoutedUserIdRef.current = null;
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
        setSession(newSession);
        try {
          const userId = newSession?.user?.id ?? null;
          if (userId && lastRoutedUserIdRef.current !== userId) {
            lastRoutedUserIdRef.current = userId;
            didRouteRef.current = false;
          }
          if (didRouteRef.current) return;
          if (userId) {
            const nextRole = await resolveRole(userId);
            if (alive) {
              setRole(nextRole);
              didRouteRef.current = true;
            }
          } else {
            setRole("none");
            didRouteRef.current = false;
            lastRoutedUserIdRef.current = null;
          }
        } catch (error) {
          console.error("Failed to resolve role", error);
          if (alive) setRole("none");
        } finally {
          if (alive) setLoading(false);
        }
      }
    );

    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user: session?.user ?? null,
      session,
      loading,
      authError,
      role,
    }),
    [session, loading, authError, role]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

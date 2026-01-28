import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
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
  const workspaceMember = await withTimeout(
    supabase
      .from("workspace_members")
      .select("workspace_id, role")
      .eq("user_id", userId)
      .maybeSingle(),
    5000,
    "Workspace membership lookup timed out (5s)."
  );

  if (workspaceMember.error) throw workspaceMember.error;
  if (workspaceMember.data?.role && workspaceMember.data.role.startsWith("pt")) {
    console.log("ROLE ROUTE", { wmData: workspaceMember.data, clientData: null });
    return "pt";
  }

  const clientMember = await withTimeout(
    supabase
      .from("clients")
      .select("id, workspace_id")
      .eq("user_id", userId)
      .maybeSingle(),
    5000,
    "Client lookup timed out (5s)."
  );

  if (clientMember.error) throw clientMember.error;
  console.log("ROLE ROUTE", { wmData: workspaceMember.data, clientData: clientMember.data });
  if (clientMember.data) return "client";

  return "none";
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<Error | null>(null);
  const [role, setRole] = useState<AppRole>("none");

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
        if (data.session?.user?.id) {
          const nextRole = await resolveRole(data.session.user.id);
          if (alive) setRole(nextRole);
        } else {
          setRole("none");
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
          if (newSession?.user?.id) {
            const nextRole = await resolveRole(newSession.user.id);
            if (alive) setRole(nextRole);
          } else {
            setRole("none");
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

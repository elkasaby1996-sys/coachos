import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "./supabase";

type AppRole = "pt" | "client" | "none";

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  loading: boolean;
  role: AppRole;
  refreshRole: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

async function resolveRole(userId: string): Promise<AppRole> {
  // 1) PT?
  const pt = await supabase
    .from("workspace_members")
    .select("workspace_id, role")
    .eq("user_id", userId)
    .maybeSingle();

  if (pt.data) return "pt";

  // 2) Client?
  const client = await supabase
    .from("clients")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();

  if (client.data) return "client";

  return "none";
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<AppRole>("none");
  const [loading, setLoading] = useState(true);

  const refreshRole = async () => {
    const s = session;
    if (!s?.user?.id) {
      setRole("none");
      return;
    }
    try {
      const r = await resolveRole(s.user.id);
      setRole(r);
    } catch (e) {
      console.error("Failed to resolve role", e);
      setRole("none");
    }
  };

  useEffect(() => {
    let mounted = true;

    const boot = async () => {
      setLoading(true);
      const { data } = await supabase.auth.getSession();
      if (!mounted) return;

      const nextSession = data.session ?? null;
      setSession(nextSession);

      if (nextSession?.user?.id) {
        try {
          const r = await resolveRole(nextSession.user.id);
          if (mounted) setRole(r);
        } catch (e) {
          console.error("Failed to resolve role on boot", e);
          if (mounted) setRole("none");
        }
      } else {
        setRole("none");
      }

      setLoading(false);
    };

    boot();

    const { data: authListener } = supabase.auth.onAuthStateChange(async (_event, nextSession) => {
      setSession(nextSession);
      setLoading(true);

      if (nextSession?.user?.id) {
        try {
          const r = await resolveRole(nextSession.user.id);
          if (mounted) setRole(r);
        } catch (e) {
          console.error("Failed to resolve role on auth change", e);
          if (mounted) setRole("none");
        }
      } else {
        setRole("none");
      }

      setLoading(false);
    });

    return () => {
      mounted = false;
      authListener.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user: session?.user ?? null,
      session,
      loading,
      role,
      refreshRole,
    }),
    [session, loading, role]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}

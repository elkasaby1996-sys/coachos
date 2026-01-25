import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";

type Role = "pt" | "client" | "none" | null;

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  role: Role;
  isLoading: boolean;
  roleError: string | null;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<Role>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [roleError, setRoleError] = useState<string | null>(null);

  const resolveRole = async (userId: string) => {
    setRoleError(null);

    const { data: member, error: memberError } = await supabase
      .from("workspace_members")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();

    if (memberError) {
      console.error("workspace_members lookup error", memberError);
      setRoleError(memberError.message);
    }

    if (member) {
      setRole("pt");
      return "pt" as const;
    }

    const { data: client, error: clientError } = await supabase
      .from("clients")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();

    if (clientError) {
      console.error("clients lookup error", clientError);
      setRoleError(clientError.message);
    }

    if (client) {
      setRole("client");
      return "client" as const;
    }

    setRole("none");
    return "none" as const;
  };

  const resolveAndRedirect = async (nextSession: Session | null) => {
    if (!nextSession?.user) {
      setRole(null);
      if (location.pathname !== "/login" && !location.pathname.startsWith("/join")) {
        navigate("/login", { replace: true });
      }
      return;
    }

    const resolvedRole = await resolveRole(nextSession.user.id);

    if (resolvedRole === "pt") {
      if (!location.pathname.startsWith("/pt")) {
        navigate("/pt/dashboard", { replace: true });
      }
      return;
    }

    if (resolvedRole === "client") {
      if (!location.pathname.startsWith("/app")) {
        navigate("/app/home", { replace: true });
      }
      return;
    }

    if (location.pathname !== "/no-workspace") {
      navigate("/no-workspace", { replace: true });
    }
  };

  useEffect(() => {
    let mounted = true;

    const bootstrap = async () => {
      setIsLoading(true);
      const { data } = await supabase.auth.getSession();
      if (!mounted) return;
      setSession(data.session ?? null);
      await resolveAndRedirect(data.session ?? null);
      setIsLoading(false);
    };

    bootstrap();

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      resolveAndRedirect(nextSession);
    });

    return () => {
      mounted = false;
      authListener.subscription.unsubscribe();
    };
  }, [location.pathname, navigate]);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      role,
      isLoading,
      roleError,
    }),
    [session, role, isLoading, roleError]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}

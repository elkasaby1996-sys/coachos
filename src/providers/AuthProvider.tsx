/* eslint-disable react-refresh/only-export-components */
import { useMemo } from "react";
import type { Session, User } from "@supabase/supabase-js";
import {
  AuthProvider as ModernAuthProvider,
  useBootstrapAuth,
  useSessionAuth,
} from "../lib/auth";

type Role = "pt" | "client" | "none" | null;

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  role: Role;
  isLoading: boolean;
  loading: boolean;
  roleError: string | null;
  refreshRole: () => Promise<void>;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  return <ModernAuthProvider>{children}</ModernAuthProvider>;
}

export function useAuth(): AuthContextValue {
  const { authLoading, session, user } = useSessionAuth();
  const {
    bootstrapError,
    bootstrapLoading,
    bootstrapResolved,
    bootstrapStale,
    refreshRole,
    role,
  } = useBootstrapAuth();

  return useMemo(
    () => ({
      session,
      user,
      role: bootstrapResolved || bootstrapStale ? role : null,
      isLoading: authLoading || bootstrapLoading,
      loading: authLoading || bootstrapLoading,
      roleError: bootstrapError?.message ?? null,
      refreshRole,
    }),
    [
      authLoading,
      bootstrapError,
      bootstrapLoading,
      bootstrapResolved,
      bootstrapStale,
      refreshRole,
      role,
      session,
      user,
    ],
  );
}

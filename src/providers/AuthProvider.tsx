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
    bootstrapResolved,
    refreshRole,
    role,
    bootstrapStale,
    bootstrapUserId,
  } = useBootstrapAuth();
  const hasSameUserCachedBootstrap = Boolean(
    session?.user.id && bootstrapStale && bootstrapUserId === session.user.id,
  );
  const awaitingBootstrap =
    Boolean(session) && !bootstrapResolved && !hasSameUserCachedBootstrap;

  return useMemo(
    () => ({
      session,
      user,
      role: bootstrapResolved || hasSameUserCachedBootstrap ? role : null,
      isLoading: authLoading || awaitingBootstrap,
      loading: authLoading || awaitingBootstrap,
      roleError: bootstrapError?.message ?? null,
      refreshRole,
    }),
    [
      awaitingBootstrap,
      authLoading,
      bootstrapError,
      bootstrapResolved,
      hasSameUserCachedBootstrap,
      refreshRole,
      role,
      session,
      user,
    ],
  );
}

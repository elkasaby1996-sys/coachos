/* eslint-disable react-refresh/only-export-components */
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
import {
  type AccountType,
  type ClientProfileRow,
  type PtProfileRow,
  getCanonicalPtProfile,
  getPendingInviteToken,
  isClientAccountComplete,
  isPtProfileComplete,
} from "./account-profiles";
import { supabase, supabaseConfigured } from "./supabase";

export type AppRole = "pt" | "client" | "none";

type AuthBootstrapState = {
  accountType: AccountType;
  role: AppRole;
  hasWorkspaceMembership: boolean;
  ptWorkspaceComplete: boolean;
  ptProfileComplete: boolean;
  clientAccountComplete: boolean;
  clientWorkspaceOnboardingHardGateRequired: boolean;
  pendingInviteToken: string | null;
  activeWorkspaceId: string | null;
  activeClientId: string | null;
  ptProfile: PtProfileRow | null;
  clientProfile: ClientProfileRow | null;
  bootstrapPath: string | null;
};

interface AuthContextValue extends AuthBootstrapState {
  user: User | null;
  session: Session | null;
  loading: boolean;
  authError: Error | null;
  refreshRole?: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);
const SESSION_LOAD_TIMEOUT_MS = 30_000;
const LOOKUP_TIMEOUT_MS = 3_000;
const BOOTSTRAP_CACHE_PREFIX = "coachos_auth_bootstrap_v1";
const PT_PROFILE_SELECT = [
  "id",
  "user_id",
  "workspace_id",
  "display_name",
  "full_name",
  "phone",
  "avatar_url",
  "coach_business_name",
  "headline",
  "bio",
  "location_country",
  "location_city",
  "languages",
  "specialties",
  "starting_price",
  "onboarding_completed_at",
  "created_at",
  "updated_at",
].join(", ");
const CLIENT_PROFILE_SELECT = [
  "id",
  "workspace_id",
  "user_id",
  "status",
  "display_name",
  "full_name",
  "phone",
  "email",
  "avatar_url",
  "photo_url",
  "date_of_birth",
  "dob",
  "sex",
  "gender",
  "height_value",
  "height_unit",
  "height_cm",
  "weight_value_current",
  "weight_unit",
  "current_weight",
  "unit_preference",
  "location",
  "location_country",
  "timezone",
  "goal",
  "injuries",
  "limitations",
  "equipment",
  "days_per_week",
  "gym_name",
  "training_type",
  "account_onboarding_completed_at",
  "created_at",
].join(", ");

type WorkspaceMembershipRow = {
  workspace_id: string | null;
  role: string | null;
};

type RedirectState = Pick<
  AuthBootstrapState,
  | "accountType"
  | "hasWorkspaceMembership"
  | "ptWorkspaceComplete"
  | "ptProfileComplete"
  | "clientAccountComplete"
  | "clientWorkspaceOnboardingHardGateRequired"
  | "pendingInviteToken"
>;

type CachedBootstrapState = Omit<AuthBootstrapState, "bootstrapPath">;

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
  if (expiresAtMs === 0 || expiresAtMs - Date.now() > 30_000) {
    return session;
  }

  try {
    const { data, error } = await withTimeout(
      supabase.auth.refreshSession(),
      10_000,
      "Session refresh timed out (10s).",
    );
    if (error || !data.session) return session;
    return data.session;
  } catch {
    return session;
  }
}

function isInvalidRefreshTokenError(error: unknown) {
  const message =
    error instanceof Error ? error.message : typeof error === "string" ? error : "";
  const normalized = message.toLowerCase();
  return (
    normalized.includes("invalid refresh token") ||
    normalized.includes("refresh token not found")
  );
}

async function clearBrokenLocalSession() {
  try {
    await supabase.auth.signOut({ scope: "local" });
  } catch {
    // Ignore cleanup failures; the important part is clearing app state.
  }
}

function getCurrentPathname() {
  if (typeof window === "undefined") return "/";
  return window.location.pathname;
}

function getBootstrapCacheKey(userId: string) {
  return `${BOOTSTRAP_CACHE_PREFIX}:${userId}`;
}

function readCachedBootstrapState(
  userId: string,
  pathname: string,
): AuthBootstrapState | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(getBootstrapCacheKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedBootstrapState | null;
    if (!parsed) return null;

    return {
      ...parsed,
      bootstrapPath: getBootstrapPath(parsed, pathname),
    };
  } catch {
    return null;
  }
}

function writeCachedBootstrapState(
  userId: string,
  state: Omit<AuthBootstrapState, "bootstrapPath">,
) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(
      getBootstrapCacheKey(userId),
      JSON.stringify(state),
    );
  } catch {
    // Ignore storage write issues.
  }
}

function clearCachedBootstrapState(userId: string | null | undefined) {
  if (typeof window === "undefined" || !userId) return;
  window.localStorage.removeItem(getBootstrapCacheKey(userId));
}

function getActiveWorkspaceIdFromStorage() {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem("coachos_workspace_id");
}

function getSignupIntentFallback(): AccountType {
  if (typeof window === "undefined") return "unknown";
  const intent = window.localStorage.getItem("coachos_signup_intent");
  if (intent === "pt" || intent === "client") return intent;
  return "unknown";
}

function logLookupWarning(label: string, error: unknown) {
  if (typeof console === "undefined") return;
  console.warn(`[auth] ${label} lookup failed`, error);
}

async function safeLookup<T>(
  label: string,
  promise: PromiseLike<{ data: T | null; error: unknown }>,
  fallback: T,
) {
  try {
    const { data, error } = await withTimeout(
      promise,
      LOOKUP_TIMEOUT_MS,
      `${label} lookup timed out (${Math.round(LOOKUP_TIMEOUT_MS / 1000)}s).`,
    );
    if (error) throw error;
    return (data ?? fallback) as T;
  } catch (error) {
    logLookupWarning(label, error);
    return fallback;
  }
}

function resolveAccountType(params: {
  ptProfile: PtProfileRow | null;
  clientRows: ClientProfileRow[];
  workspaceRows: WorkspaceMembershipRow[];
  pathname: string;
  signupIntent: AccountType;
}): AccountType {
  const hasPtProfile = Boolean(params.ptProfile);
  const hasClientRows = params.clientRows.length > 0;
  const hasPtWorkspace = params.workspaceRows.some((member) =>
    member.role?.startsWith("pt"),
  );
  const hasClientWorkspace = params.clientRows.some((row) => row.workspace_id);

  if (hasPtProfile && !hasClientRows) return "pt";
  if (!hasPtProfile && hasClientRows) return "client";
  if (hasPtWorkspace && !hasClientRows) return "pt";
  if (hasClientWorkspace && !hasPtProfile && !hasPtWorkspace) return "client";
  if (!hasPtProfile && !hasClientRows && params.signupIntent !== "unknown") {
    return params.signupIntent;
  }
  if (hasPtWorkspace) return "pt";
  if (hasClientWorkspace) return "client";
  if (!hasPtProfile && !hasClientRows) return "unknown";

  if (params.pathname.startsWith("/pt")) return "pt";
  if (
    params.pathname.startsWith("/app") ||
    params.pathname.startsWith("/client") ||
    params.pathname.startsWith("/invite/")
  ) {
    return "client";
  }
  if (hasPtWorkspace && !hasClientWorkspace) return "pt";
  if (hasClientWorkspace && !hasPtWorkspace) return "client";
  return hasPtProfile ? "pt" : "client";
}

function getActiveClientRow(params: {
  accountType: AccountType;
  clientRows: ClientProfileRow[];
  workspaceId: string | null;
}) {
  if (params.accountType !== "client") return null;
  const workspaceRows = params.clientRows.filter((row) => row.workspace_id);
  if (params.workspaceId) {
    const selected = workspaceRows.find(
      (row) => row.workspace_id === params.workspaceId,
    );
    if (selected) return selected;
  }
  return workspaceRows[0] ?? params.clientRows[0] ?? null;
}

export function getAuthenticatedRedirectPath(state: RedirectState) {
  if (state.accountType === "pt") {
    if (!state.ptWorkspaceComplete) return "/pt/onboarding/workspace";
    return "/pt-hub";
  }

  if (state.accountType === "client") {
    if (!state.clientAccountComplete) {
      const inviteQuery = state.pendingInviteToken
        ? `?invite=${encodeURIComponent(state.pendingInviteToken)}`
        : "";
      return `/client/onboarding/account${inviteQuery}`;
    }
    if (!state.hasWorkspaceMembership) return "/no-workspace";
    if (state.clientWorkspaceOnboardingHardGateRequired) {
      return "/app/onboarding";
    }
    return "/app/home";
  }

  if (state.ptWorkspaceComplete) {
    return "/pt-hub";
  }

  const signupIntent = getSignupIntentFallback();
  if (signupIntent === "pt") {
    return state.ptWorkspaceComplete ? "/pt-hub" : "/pt/onboarding/workspace";
  }
  if (signupIntent === "client") {
    if (!state.clientAccountComplete) {
      const inviteQuery = state.pendingInviteToken
        ? `?invite=${encodeURIComponent(state.pendingInviteToken)}`
        : "";
      return `/client/onboarding/account${inviteQuery}`;
    }
    if (state.hasWorkspaceMembership) {
      return state.clientWorkspaceOnboardingHardGateRequired
        ? "/app/onboarding"
        : "/app/home";
    }
    return "/no-workspace";
  }

  return "/no-workspace";
}

function getBootstrapPath(state: Omit<AuthBootstrapState, "bootstrapPath">, pathname: string) {
  if (pathname.startsWith("/invite/")) return null;

  return getAuthenticatedRedirectPath(state);
}

async function resolveBootstrapState(
  user: User,
  pathname: string,
): Promise<Omit<AuthBootstrapState, "bootstrapPath">> {
  const [ptProfileData, workspaceData, clientData] = await Promise.all([
    safeLookup(
      "PT profile",
      supabase
        .from("pt_profiles")
        .select(PT_PROFILE_SELECT)
        .eq("user_id", user.id)
        .returns<PtProfileRow[]>()
        .limit(25),
      [] as PtProfileRow[],
    ),
    safeLookup(
      "Workspace membership",
      supabase
        .from("workspace_members")
        .select("workspace_id, role")
        .eq("user_id", user.id)
        .returns<WorkspaceMembershipRow[]>()
        .limit(25),
      [] as WorkspaceMembershipRow[],
    ),
    safeLookup(
      "Client profile",
      supabase
        .from("clients")
        .select(CLIENT_PROFILE_SELECT)
        .eq("user_id", user.id)
        .returns<ClientProfileRow[]>()
        .limit(25),
      [] as ClientProfileRow[],
    ),
  ]);

  const ptProfile = getCanonicalPtProfile(ptProfileData as PtProfileRow[]);
  const workspaceRows = workspaceData as WorkspaceMembershipRow[];
  const clientRows = ((clientData ?? []) as ClientProfileRow[]).sort((a, b) => {
    if (!a.workspace_id && b.workspace_id) return -1;
    if (a.workspace_id && !b.workspace_id) return 1;
    return (a.created_at ?? "").localeCompare(b.created_at ?? "");
  });
  const storedWorkspaceId = getActiveWorkspaceIdFromStorage();
  const signupIntent = getSignupIntentFallback();
  const accountType = resolveAccountType({
    ptProfile,
    clientRows,
    workspaceRows,
    pathname,
    signupIntent,
  });
  const activeClient = getActiveClientRow({
    accountType,
    clientRows,
    workspaceId: storedWorkspaceId,
  });
  const inviteTokenFromPath = pathname.startsWith("/invite/")
    ? pathname.split("/invite/")[1] ?? null
    : null;
  const pendingInviteToken = inviteTokenFromPath ?? getPendingInviteToken();
  const ptWorkspaceComplete = workspaceRows.some((member) =>
    member.role?.startsWith("pt"),
  );
  const hasWorkspaceMembership =
    accountType === "pt"
      ? ptWorkspaceComplete
      : Boolean(activeClient?.workspace_id);
  const clientAccountComplete = isClientAccountComplete(activeClient);

  return {
    accountType,
    role:
      accountType === "pt"
        ? "pt"
        : accountType === "client"
          ? "client"
          : "none",
    hasWorkspaceMembership,
    ptWorkspaceComplete,
    ptProfileComplete: isPtProfileComplete(ptProfile),
    clientAccountComplete,
    clientWorkspaceOnboardingHardGateRequired: Boolean(
      activeClient?.workspace_id && !clientAccountComplete,
    ),
    pendingInviteToken,
    activeWorkspaceId:
      accountType === "pt"
        ? storedWorkspaceId ??
          workspaceRows.find((member) => member.workspace_id)?.workspace_id ??
          null
        : activeClient?.workspace_id ?? null,
    activeClientId: activeClient?.id ?? null,
    ptProfile,
    clientProfile: activeClient,
  };
}

const emptyBootstrapState: AuthBootstrapState = {
  accountType: "unknown",
  role: "none",
  hasWorkspaceMembership: false,
  ptWorkspaceComplete: false,
  ptProfileComplete: false,
  clientAccountComplete: false,
  clientWorkspaceOnboardingHardGateRequired: false,
  pendingInviteToken: null,
  activeWorkspaceId: null,
  activeClientId: null,
  ptProfile: null,
  clientProfile: null,
  bootstrapPath: null,
};

function hasMeaningfulBootstrapState(
  state: AuthBootstrapState | Omit<AuthBootstrapState, "bootstrapPath"> | null | undefined,
) {
  if (!state) return false;

  return Boolean(
    state.accountType !== "unknown" ||
      state.hasWorkspaceMembership ||
      state.ptWorkspaceComplete ||
      state.clientAccountComplete ||
      state.activeWorkspaceId ||
      state.activeClientId ||
      state.ptProfile ||
      state.clientProfile,
  );
}

function shouldPreservePreviousBootstrapState(params: {
  nextState: Omit<AuthBootstrapState, "bootstrapPath">;
  previousState: AuthBootstrapState | null;
}) {
  const { nextState, previousState } = params;
  if (!hasMeaningfulBootstrapState(previousState)) return false;

  const nextStateLooksEmpty = !hasMeaningfulBootstrapState(nextState);
  if (nextStateLooksEmpty) return true;

  if (
    previousState?.accountType === "pt" &&
    previousState.ptWorkspaceComplete &&
    nextState.accountType !== "pt" &&
    !nextState.ptWorkspaceComplete &&
    !nextState.ptProfile
  ) {
    return true;
  }

  if (
    previousState?.accountType === "client" &&
    previousState.hasWorkspaceMembership &&
    nextState.accountType === "unknown" &&
    !nextState.clientProfile &&
    !nextState.hasWorkspaceMembership
  ) {
    return true;
  }

  return false;
}

function stabilizeBootstrapState(params: {
  pathname: string;
  nextState: Omit<AuthBootstrapState, "bootstrapPath">;
  previousState?: AuthBootstrapState | null;
  cachedState?: AuthBootstrapState | null;
}) {
  const { cachedState = null, nextState, pathname, previousState = null } = params;
  const fallbackState = hasMeaningfulBootstrapState(previousState)
    ? previousState
    : hasMeaningfulBootstrapState(cachedState)
      ? cachedState
      : null;

  if (
    fallbackState &&
    shouldPreservePreviousBootstrapState({
      nextState,
      previousState: fallbackState,
    })
  ) {
    const stabilizedState: Omit<AuthBootstrapState, "bootstrapPath"> = {
      accountType: fallbackState.accountType,
      role: fallbackState.role,
      hasWorkspaceMembership: fallbackState.hasWorkspaceMembership,
      ptWorkspaceComplete: fallbackState.ptWorkspaceComplete,
      ptProfileComplete: fallbackState.ptProfileComplete,
      clientAccountComplete: fallbackState.clientAccountComplete,
      clientWorkspaceOnboardingHardGateRequired:
        fallbackState.clientWorkspaceOnboardingHardGateRequired,
      pendingInviteToken:
        nextState.pendingInviteToken ?? fallbackState.pendingInviteToken,
      activeWorkspaceId:
        nextState.activeWorkspaceId ?? fallbackState.activeWorkspaceId,
      activeClientId: nextState.activeClientId ?? fallbackState.activeClientId,
      ptProfile: nextState.ptProfile ?? fallbackState.ptProfile,
      clientProfile: nextState.clientProfile ?? fallbackState.clientProfile,
    };

    return {
      ...stabilizedState,
      bootstrapPath: getBootstrapPath(stabilizedState, pathname),
    };
  }

  return {
    ...nextState,
    bootstrapPath: getBootstrapPath(nextState, pathname),
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<Error | null>(null);
  const [bootstrapState, setBootstrapState] =
    useState<AuthBootstrapState>(emptyBootstrapState);
  const resolveIdRef = useRef(0);
  const hasResolvedInitialSessionRef = useRef(false);
  const sessionRef = useRef<Session | null>(null);
  const bootstrapStateRef = useRef<AuthBootstrapState>(emptyBootstrapState);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  useEffect(() => {
    bootstrapStateRef.current = bootstrapState;
  }, [bootstrapState]);

  useEffect(() => {
    const userId = session?.user?.id;
    if (!userId) return;

    writeCachedBootstrapState(userId, {
      accountType: bootstrapState.accountType,
      role: bootstrapState.role,
      hasWorkspaceMembership: bootstrapState.hasWorkspaceMembership,
      ptWorkspaceComplete: bootstrapState.ptWorkspaceComplete,
      ptProfileComplete: bootstrapState.ptProfileComplete,
      clientAccountComplete: bootstrapState.clientAccountComplete,
      clientWorkspaceOnboardingHardGateRequired:
        bootstrapState.clientWorkspaceOnboardingHardGateRequired,
      pendingInviteToken: bootstrapState.pendingInviteToken,
      activeWorkspaceId: bootstrapState.activeWorkspaceId,
      activeClientId: bootstrapState.activeClientId,
      ptProfile: bootstrapState.ptProfile,
      clientProfile: bootstrapState.clientProfile,
    });
  }, [bootstrapState, session?.user?.id]);

  const refreshRole = useCallback(async () => {
    try {
      setAuthError(null);
      const { data, error } = await withTimeout(
        supabase.auth.getSession(),
        SESSION_LOAD_TIMEOUT_MS,
        `Session load timed out (${Math.round(SESSION_LOAD_TIMEOUT_MS / 1000)}s).`,
      );
      if (error) throw error;

      const nextSession = await ensureFreshSession(data.session ?? null);
      sessionRef.current = nextSession;
      setSession(nextSession);

      if (!nextSession?.user) {
        clearCachedBootstrapState(sessionRef.current?.user?.id ?? null);
        setBootstrapState(emptyBootstrapState);
        return;
      }

      const pathname = getCurrentPathname();
      const cachedState = readCachedBootstrapState(nextSession.user.id, pathname);
      const nextStateBase = await resolveBootstrapState(nextSession.user, pathname);
      setBootstrapState(
        stabilizeBootstrapState({
          pathname,
          nextState: nextStateBase,
          previousState: bootstrapStateRef.current,
          cachedState,
        }),
      );
    } catch (error) {
      if (isInvalidRefreshTokenError(error)) {
        await clearBrokenLocalSession();
        sessionRef.current = null;
        setSession(null);
        setBootstrapState(emptyBootstrapState);
        return;
      }
      logLookupWarning("Auth refresh", error);
    }
  }, []);

  useEffect(() => {
    let alive = true;
    const currentResolveId = ++resolveIdRef.current;

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

        if (!alive || currentResolveId !== resolveIdRef.current) return;
        if (error) throw error;

        const nextSession = await ensureFreshSession(data.session ?? null);
        if (!alive || currentResolveId !== resolveIdRef.current) return;
        sessionRef.current = nextSession;
        setSession(nextSession);

        if (!nextSession?.user) {
          clearCachedBootstrapState(sessionRef.current?.user?.id ?? null);
          setBootstrapState(emptyBootstrapState);
          return;
        }

        const pathname = getCurrentPathname();
        const cachedState = readCachedBootstrapState(nextSession.user.id, pathname);
        if (cachedState) {
          setBootstrapState(cachedState);
          hasResolvedInitialSessionRef.current = true;
          setLoading(false);
        }
        const nextStateBase = await resolveBootstrapState(nextSession.user, pathname);
        if (!alive || currentResolveId !== resolveIdRef.current) return;
        setBootstrapState(
          stabilizeBootstrapState({
            pathname,
            nextState: nextStateBase,
            previousState: bootstrapStateRef.current,
            cachedState,
          }),
        );
      } catch (error) {
        if (!alive || currentResolveId !== resolveIdRef.current) return;
        if (isInvalidRefreshTokenError(error)) {
          await clearBrokenLocalSession();
        }
        clearCachedBootstrapState(sessionRef.current?.user?.id ?? null);
        sessionRef.current = null;
        setAuthError(error instanceof Error ? error : new Error(String(error)));
        setSession(null);
        setBootstrapState(emptyBootstrapState);
      } finally {
        if (!alive || currentResolveId !== resolveIdRef.current) return;
        hasResolvedInitialSessionRef.current = true;
        setLoading(false);
      }
    };

    init();

    const { data: sub } = supabase.auth.onAuthStateChange(
      async (event, nextSession) => {
        if (!alive) return;
        if (event === "TOKEN_REFRESHED") {
          sessionRef.current = nextSession ?? null;
          setSession(nextSession ?? null);
          return;
        }

        if (event === "SIGNED_OUT") {
          clearCachedBootstrapState(sessionRef.current?.user?.id ?? null);
          sessionRef.current = null;
          setSession(null);
          setBootstrapState(emptyBootstrapState);
          hasResolvedInitialSessionRef.current = true;
          setLoading(false);
          return;
        }

        const shouldBlockUi =
          !hasResolvedInitialSessionRef.current ||
          (event === "SIGNED_IN" && !sessionRef.current);
        if (shouldBlockUi) {
          setLoading(true);
        }
        try {
          setAuthError(null);
          const freshSession = await ensureFreshSession(nextSession ?? null);
          sessionRef.current = freshSession;
          setSession(freshSession);

          if (!freshSession?.user) {
            clearCachedBootstrapState(sessionRef.current?.user?.id ?? null);
            setBootstrapState(emptyBootstrapState);
            return;
          }

          const pathname = getCurrentPathname();
          const cachedState = readCachedBootstrapState(freshSession.user.id, pathname);
          const nextStateBase = await resolveBootstrapState(
            freshSession.user,
            pathname,
          );
          if (!alive) return;
          setBootstrapState(
            stabilizeBootstrapState({
              pathname,
              nextState: nextStateBase,
              previousState: bootstrapStateRef.current,
              cachedState,
            }),
          );
        } catch (error) {
          if (!alive) return;
          if (isInvalidRefreshTokenError(error)) {
            await clearBrokenLocalSession();
            sessionRef.current = null;
            setSession(null);
            setBootstrapState(emptyBootstrapState);
            return;
          }
          logLookupWarning(`Auth state change (${event})`, error);
          setBootstrapState(bootstrapStateRef.current);
        } finally {
          if (!alive) return;
          hasResolvedInitialSessionRef.current = true;
          if (shouldBlockUi) setLoading(false);
        }
      },
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
      refreshRole,
      ...bootstrapState,
    }),
    [authError, bootstrapState, loading, refreshRole, session],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

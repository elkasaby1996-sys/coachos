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
  clearSignupIntent,
  getCanonicalPtProfile,
  getSignupIntentFallback,
  getPendingInviteToken,
  isClientAccountComplete,
  isPtProfileComplete,
} from "./account-profiles";
import { supabase, supabaseConfigured } from "./supabase";

export type AppRole = "pt" | "client" | "none";

export type AuthBootstrapState = {
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

type AuthBootstrapCoreState = Omit<AuthBootstrapState, "bootstrapPath">;

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

type WorkspaceMembershipRow = {
  workspace_id: string | null;
  role: string | null;
};

type CachedBootstrapState = Omit<AuthBootstrapState, "bootstrapPath">;

export type LookupResult<T> =
  | { status: "ok"; data: T }
  | { status: "empty" }
  | { status: "timeout"; error: Error }
  | { status: "error"; error: unknown };

export type BootstrapResolution =
  | { status: "resolved"; state: AuthBootstrapCoreState }
  | { status: "unresolved"; error: Error };

interface SessionAuthContextValue {
  user: User | null;
  session: Session | null;
  isAuthenticated: boolean;
  authLoading: boolean;
  authError: Error | null;
}

interface BootstrapAuthContextValue extends AuthBootstrapState {
  bootstrapLoading: boolean;
  bootstrapResolved: boolean;
  bootstrapStale: boolean;
  hasStableBootstrap: boolean;
  bootstrapError: Error | null;
  refreshBootstrap: () => Promise<void>;
  refreshRole: () => Promise<void>;
  patchBootstrap: (
    updater:
      | Partial<AuthBootstrapCoreState>
      | ((prev: AuthBootstrapCoreState) => Partial<AuthBootstrapCoreState>),
  ) => void;
}

type CombinedAuthContextValue = SessionAuthContextValue &
  BootstrapAuthContextValue & {
    loading: boolean;
  };

const SessionAuthContext = createContext<SessionAuthContextValue | undefined>(
  undefined,
);
const BootstrapAuthContext = createContext<
  BootstrapAuthContextValue | undefined
>(undefined);

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

const emptyBootstrapCoreState: AuthBootstrapCoreState = {
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
};

const emptyBootstrapState: AuthBootstrapState = {
  ...emptyBootstrapCoreState,
  bootstrapPath: null,
};

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

function getActiveWorkspaceIdFromStorage() {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem("coachos_workspace_id");
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

function writeCachedBootstrapState(userId: string, state: AuthBootstrapCoreState) {
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

function logLookupWarning(label: string, error: unknown) {
  if (typeof console === "undefined") return;
  console.warn(`[auth] ${label} lookup failed`, error);
}

function hasMeaningfulBootstrapState(
  state: AuthBootstrapState | AuthBootstrapCoreState | null | undefined,
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

function sortClientRows(rows: ClientProfileRow[]) {
  return [...rows].sort((a, b) => {
    if (!a.workspace_id && b.workspace_id) return -1;
    if (a.workspace_id && !b.workspace_id) return 1;
    return (a.created_at ?? "").localeCompare(b.created_at ?? "");
  });
}

async function lookupRows<T>(
  label: string,
  query: PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<LookupResult<T[]>> {
  try {
    const { data, error } = await withTimeout(
      query,
      LOOKUP_TIMEOUT_MS,
      `${label} lookup timed out (${Math.round(LOOKUP_TIMEOUT_MS / 1000)}s).`,
    );

    if (error) {
      logLookupWarning(label, error);
      return { status: "error", error };
    }

    const rows = (data ?? []) as T[];
    return rows.length > 0 ? { status: "ok", data: rows } : { status: "empty" };
  } catch (error) {
    logLookupWarning(label, error);
    if (error instanceof Error && error.message.toLowerCase().includes("timed out")) {
      return { status: "timeout", error };
    }
    return { status: "error", error };
  }
}

function resolveAccountType(params: {
  ptProfile: PtProfileRow | null;
  clientRows: ClientProfileRow[];
  pathname: string;
  signupIntent: AccountType;
}): AccountType {
  const hasPtProfile = Boolean(params.ptProfile);
  const hasClientRows = params.clientRows.length > 0;
  const hasClientWorkspace = params.clientRows.some((row) => row.workspace_id);

  if (hasPtProfile && !hasClientRows) return "pt";
  if (!hasPtProfile && hasClientRows) return "client";
  if (!hasPtProfile && !hasClientRows && params.signupIntent !== "unknown") {
    return params.signupIntent;
  }

  if (params.pathname.startsWith("/pt")) return "pt";
  if (
    params.pathname.startsWith("/app") ||
    params.pathname.startsWith("/client") ||
    params.pathname.startsWith("/invite/")
  ) {
    return "client";
  }

  if (hasClientWorkspace && !hasPtProfile) return "client";
  if (hasPtProfile) return "pt";
  if (hasClientRows) return "client";
  return "unknown";
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

function buildPendingInviteToken(pathname: string) {
  const inviteTokenFromPath = pathname.startsWith("/invite/")
    ? pathname.split("/invite/")[1] ?? null
    : null;
  return inviteTokenFromPath ?? getPendingInviteToken();
}

function finalizeBootstrapState(
  state: AuthBootstrapCoreState,
  pathname: string,
): AuthBootstrapState {
  return {
    ...state,
    bootstrapPath: getBootstrapPath(state, pathname),
  };
}

function shouldClearSignupIntent(state: AuthBootstrapCoreState) {
  return (
    state.accountType !== "unknown" ||
    state.hasWorkspaceMembership ||
    state.ptWorkspaceComplete ||
    state.clientAccountComplete
  );
}

export function buildStaleBootstrapFallbackState(params: {
  fallback: AuthBootstrapState;
  pathname: string;
}): AuthBootstrapState {
  const { fallback, pathname } = params;

  return finalizeBootstrapState(
    {
      accountType: fallback.accountType,
      role: fallback.role,
      hasWorkspaceMembership: fallback.hasWorkspaceMembership,
      ptWorkspaceComplete: fallback.ptWorkspaceComplete,
      ptProfileComplete: fallback.ptProfileComplete,
      clientAccountComplete: fallback.clientAccountComplete,
      clientWorkspaceOnboardingHardGateRequired:
        fallback.clientWorkspaceOnboardingHardGateRequired,
      pendingInviteToken:
        buildPendingInviteToken(pathname) ?? fallback.pendingInviteToken,
      activeWorkspaceId: fallback.activeWorkspaceId,
      activeClientId: fallback.activeClientId,
      ptProfile: fallback.ptProfile,
      clientProfile: fallback.clientProfile,
    },
    pathname,
  );
}

function buildPtWorkspaceState(params: {
  pathname: string;
  pendingInviteToken: string | null;
  storedWorkspaceId: string | null;
  workspaceRows: WorkspaceMembershipRow[];
  previousStable: AuthBootstrapState | null;
}): AuthBootstrapCoreState {
  const firstWorkspaceId =
    params.workspaceRows.find((member) => member.workspace_id)?.workspace_id ?? null;
  const previousPtProfile =
    params.previousStable?.accountType === "pt" ? params.previousStable.ptProfile : null;

  return {
    accountType: "pt",
    role: "pt",
    hasWorkspaceMembership: true,
    ptWorkspaceComplete: true,
    ptProfileComplete: isPtProfileComplete(previousPtProfile),
    clientAccountComplete: false,
    clientWorkspaceOnboardingHardGateRequired: false,
    pendingInviteToken: params.pendingInviteToken,
    activeWorkspaceId: params.storedWorkspaceId ?? firstWorkspaceId,
    activeClientId: null,
    ptProfile: previousPtProfile,
    clientProfile: null,
  };
}

function buildProfileDerivedState(params: {
  pathname: string;
  pendingInviteToken: string | null;
  storedWorkspaceId: string | null;
  ptProfile: PtProfileRow | null;
  clientRows: ClientProfileRow[];
  signupIntent: AccountType;
}): AuthBootstrapCoreState {
  const accountType = resolveAccountType({
    ptProfile: params.ptProfile,
    clientRows: params.clientRows,
    pathname: params.pathname,
    signupIntent: params.signupIntent,
  });
  const activeClient = getActiveClientRow({
    accountType,
    clientRows: params.clientRows,
    workspaceId: params.storedWorkspaceId,
  });
  const clientAccountComplete = isClientAccountComplete(activeClient);

  return {
    accountType,
    role:
      accountType === "pt"
        ? "pt"
        : accountType === "client"
          ? "client"
          : "none",
    hasWorkspaceMembership:
      accountType === "client" ? Boolean(activeClient?.workspace_id) : false,
    ptWorkspaceComplete: false,
    ptProfileComplete: isPtProfileComplete(params.ptProfile),
    clientAccountComplete,
    clientWorkspaceOnboardingHardGateRequired: Boolean(
      activeClient?.workspace_id && !clientAccountComplete,
    ),
    pendingInviteToken: params.pendingInviteToken,
    activeWorkspaceId:
      accountType === "client" ? activeClient?.workspace_id ?? null : null,
    activeClientId: activeClient?.id ?? null,
    ptProfile: accountType === "pt" ? params.ptProfile : null,
    clientProfile: activeClient,
  };
}

export function resolveBootstrapFromLookupResults(params: {
  pathname: string;
  previousStable: AuthBootstrapState | null;
  storedWorkspaceId: string | null;
  signupIntent: AccountType;
  pendingInviteToken: string | null;
  membershipResult: LookupResult<WorkspaceMembershipRow[]>;
  ptProfileResult: LookupResult<PtProfileRow[]> | null;
  clientResult: LookupResult<ClientProfileRow[]> | null;
}): BootstrapResolution {
  const {
    clientResult,
    membershipResult,
    pathname,
    pendingInviteToken,
    previousStable,
    ptProfileResult,
    signupIntent,
    storedWorkspaceId,
  } = params;

  if (membershipResult.status === "ok") {
    const ptWorkspaceRows = membershipResult.data.filter((member) =>
      member.role?.startsWith("pt"),
    );
    if (ptWorkspaceRows.length > 0) {
      return {
        status: "resolved",
        state: buildPtWorkspaceState({
          pathname,
          pendingInviteToken,
          storedWorkspaceId,
          workspaceRows: ptWorkspaceRows,
          previousStable,
        }),
      };
    }
  }

  if (membershipResult.status === "timeout") {
    return { status: "unresolved", error: membershipResult.error };
  }

  if (membershipResult.status === "error") {
    return {
      status: "unresolved",
      error:
        membershipResult.error instanceof Error
          ? membershipResult.error
          : new Error("Workspace membership lookup failed."),
    };
  }

  const ptProfile =
    ptProfileResult?.status === "ok"
      ? getCanonicalPtProfile(ptProfileResult.data)
      : null;
  const clientRows =
    clientResult?.status === "ok" ? sortClientRows(clientResult.data) : [];

  const hasPositivePt = Boolean(ptProfile);
  const hasPositiveClient = clientRows.length > 0;
  const ptUnknown =
    ptProfileResult?.status === "timeout" || ptProfileResult?.status === "error";
  const clientUnknown =
    clientResult?.status === "timeout" || clientResult?.status === "error";

  if (hasPositivePt || hasPositiveClient) {
    return {
      status: "resolved",
      state: buildProfileDerivedState({
        pathname,
        pendingInviteToken,
        storedWorkspaceId,
        ptProfile,
        clientRows,
        signupIntent,
      }),
    };
  }

  if (ptUnknown || clientUnknown) {
    const error =
      ptProfileResult?.status === "timeout"
        ? ptProfileResult.error
        : clientResult?.status === "timeout"
          ? clientResult.error
          : ptProfileResult?.status === "error"
            ? ptProfileResult.error
            : clientResult?.status === "error"
              ? clientResult.error
              : new Error("Bootstrap lookups remained unresolved.");

    return {
      status: "unresolved",
      error: error instanceof Error ? error : new Error(String(error)),
    };
  }

  return {
    status: "resolved",
    state: buildProfileDerivedState({
      pathname,
      pendingInviteToken,
      storedWorkspaceId,
      ptProfile: null,
      clientRows: [],
      signupIntent,
    }),
  };
}

async function resolveBootstrapState(params: {
  user: User;
  pathname: string;
  previousStable: AuthBootstrapState | null;
}): Promise<BootstrapResolution> {
  const { pathname, previousStable, user } = params;
  const storedWorkspaceId = getActiveWorkspaceIdFromStorage();
  const signupIntent = getSignupIntentFallback();
  const pendingInviteToken = buildPendingInviteToken(pathname);

  const membershipResult = await lookupRows(
    "Workspace membership",
    supabase
      .from("workspace_members")
      .select("workspace_id, role")
      .eq("user_id", user.id)
      .returns<WorkspaceMembershipRow[]>()
      .limit(25),
  );

  const [ptProfileResult, clientResult] =
    membershipResult.status === "empty"
      ? await Promise.all([
    lookupRows(
      "PT profile",
      supabase
        .from("pt_profiles")
        .select(PT_PROFILE_SELECT)
        .eq("user_id", user.id)
        .returns<PtProfileRow[]>()
        .limit(25),
    ),
    lookupRows(
      "Client profile",
      supabase
        .from("clients")
        .select(CLIENT_PROFILE_SELECT)
        .eq("user_id", user.id)
        .returns<ClientProfileRow[]>()
        .limit(25),
    ),
  ])
      : [null, null];

  return resolveBootstrapFromLookupResults({
    pathname,
    previousStable,
    storedWorkspaceId,
    signupIntent,
    pendingInviteToken,
    membershipResult,
    ptProfileResult,
    clientResult,
  });
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

export function getBootstrapPath(
  state: AuthBootstrapCoreState,
  pathname: string,
) {
  if (pathname.startsWith("/invite/")) return null;
  return getAuthenticatedRedirectPath(state);
}

export function buildSessionAuthValue(params: {
  session: Session | null;
  authLoading: boolean;
  authError: Error | null;
}): SessionAuthContextValue {
  return {
    user: params.session?.user ?? null,
    session: params.session,
    isAuthenticated: Boolean(params.session),
    authLoading: params.authLoading,
    authError: params.authError,
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState<Error | null>(null);
  const [bootstrapState, setBootstrapState] =
    useState<AuthBootstrapState>(emptyBootstrapState);
  const [bootstrapLoading, setBootstrapLoading] = useState(false);
  const [bootstrapResolved, setBootstrapResolved] = useState(false);
  const [bootstrapStale, setBootstrapStale] = useState(false);
  const [bootstrapError, setBootstrapError] = useState<Error | null>(null);
  const bootstrapRequestIdRef = useRef(0);
  const sessionRef = useRef<Session | null>(null);
  const bootstrapStateRef = useRef<AuthBootstrapState>(emptyBootstrapState);
  const lastStableBootstrapRef = useRef<AuthBootstrapState | null>(null);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  useEffect(() => {
    bootstrapStateRef.current = bootstrapState;
  }, [bootstrapState]);

  const applyResolvedBootstrapState = useCallback(
    (nextState: AuthBootstrapCoreState, pathname: string, userId: string) => {
      const finalized = finalizeBootstrapState(nextState, pathname);
      lastStableBootstrapRef.current = finalized;
      writeCachedBootstrapState(userId, nextState);
      if (shouldClearSignupIntent(nextState)) {
        clearSignupIntent();
      }
      setBootstrapState(finalized);
      setBootstrapResolved(true);
      setBootstrapStale(false);
      setBootstrapLoading(false);
      setBootstrapError(null);
    },
    [],
  );

  const applyStaleBootstrapState = useCallback(
    (params: { fallback: AuthBootstrapState; pathname: string; error: Error }) => {
      const { error, fallback, pathname } = params;
      setBootstrapState(
        buildStaleBootstrapFallbackState({ fallback, pathname }),
      );
      setBootstrapResolved(false);
      setBootstrapStale(true);
      setBootstrapLoading(false);
      setBootstrapError(error);
    },
    [],
  );

  const resetBootstrapState = useCallback(() => {
    bootstrapRequestIdRef.current += 1;
    setBootstrapState(emptyBootstrapState);
    setBootstrapLoading(false);
    setBootstrapResolved(false);
    setBootstrapStale(false);
    setBootstrapError(null);
    lastStableBootstrapRef.current = null;
  }, []);

  const runBootstrap = useCallback(
    async (
      user: User,
      options?: {
        pathname?: string;
        seedFromCache?: boolean;
      },
    ) => {
      const pathname = options?.pathname ?? getCurrentPathname();
      const currentRequestId = ++bootstrapRequestIdRef.current;
      const cachedState = readCachedBootstrapState(user.id, pathname);
      if (options?.seedFromCache && cachedState && !hasMeaningfulBootstrapState(lastStableBootstrapRef.current)) {
        lastStableBootstrapRef.current = cachedState;
      }
      if (options?.seedFromCache && cachedState) {
        setBootstrapState(cachedState);
        setBootstrapStale(true);
        setBootstrapResolved(false);
      }
      setBootstrapLoading(true);
      setBootstrapError(null);

      const resolution = await resolveBootstrapState({
        user,
        pathname,
        previousStable: lastStableBootstrapRef.current,
      });

      if (currentRequestId !== bootstrapRequestIdRef.current) return;

      if (resolution.status === "resolved") {
        applyResolvedBootstrapState(resolution.state, pathname, user.id);
        return;
      }

      const fallbackState =
        lastStableBootstrapRef.current ??
        (hasMeaningfulBootstrapState(cachedState) ? cachedState : null);

      if (fallbackState) {
        applyStaleBootstrapState({
          fallback: fallbackState,
          pathname,
          error: resolution.error,
        });
        return;
      }

      setBootstrapLoading(false);
      setBootstrapResolved(false);
      setBootstrapStale(false);
      setBootstrapError(resolution.error);
    },
    [applyResolvedBootstrapState, applyStaleBootstrapState],
  );

  const refreshBootstrap = useCallback(async () => {
    const nextSession =
      sessionRef.current ??
      (await ensureFreshSession((await supabase.auth.getSession()).data.session ?? null));

    sessionRef.current = nextSession;
    setSession(nextSession);

    if (!nextSession?.user) {
      clearCachedBootstrapState(sessionRef.current?.user?.id ?? null);
      resetBootstrapState();
      return;
    }

    await runBootstrap(nextSession.user, { pathname: getCurrentPathname() });
  }, [resetBootstrapState, runBootstrap]);

  const patchBootstrap = useCallback(
    (
      updater:
        | Partial<AuthBootstrapCoreState>
        | ((prev: AuthBootstrapCoreState) => Partial<AuthBootstrapCoreState>),
    ) => {
      const pathname = getCurrentPathname();
      const previousCore: AuthBootstrapCoreState = {
        accountType: bootstrapStateRef.current.accountType,
        role: bootstrapStateRef.current.role,
        hasWorkspaceMembership: bootstrapStateRef.current.hasWorkspaceMembership,
        ptWorkspaceComplete: bootstrapStateRef.current.ptWorkspaceComplete,
        ptProfileComplete: bootstrapStateRef.current.ptProfileComplete,
        clientAccountComplete: bootstrapStateRef.current.clientAccountComplete,
        clientWorkspaceOnboardingHardGateRequired:
          bootstrapStateRef.current.clientWorkspaceOnboardingHardGateRequired,
        pendingInviteToken: bootstrapStateRef.current.pendingInviteToken,
        activeWorkspaceId: bootstrapStateRef.current.activeWorkspaceId,
        activeClientId: bootstrapStateRef.current.activeClientId,
        ptProfile: bootstrapStateRef.current.ptProfile,
        clientProfile: bootstrapStateRef.current.clientProfile,
      };
      const patch =
        typeof updater === "function" ? updater(previousCore) : updater;
      const nextCore = {
        ...previousCore,
        ...patch,
      };
      const finalized = finalizeBootstrapState(nextCore, pathname);
      lastStableBootstrapRef.current = finalized;
      if (sessionRef.current?.user?.id) {
        writeCachedBootstrapState(sessionRef.current.user.id, nextCore);
      }
      if (shouldClearSignupIntent(nextCore)) {
        clearSignupIntent();
      }
      setBootstrapState(finalized);
      setBootstrapResolved(true);
      setBootstrapStale(false);
      setBootstrapLoading(false);
      setBootstrapError(null);
    },
    [],
  );

  useEffect(() => {
    let alive = true;

    const init = async () => {
      setAuthLoading(true);
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
        if (error) throw error;

        const nextSession = await ensureFreshSession(data.session ?? null);
        if (!alive) return;
        sessionRef.current = nextSession;
        setSession(nextSession);

        if (!nextSession?.user) {
          clearCachedBootstrapState(null);
          resetBootstrapState();
          return;
        }

        void runBootstrap(nextSession.user, {
          pathname: getCurrentPathname(),
          seedFromCache: true,
        });
      } catch (error) {
        if (!alive) return;
        if (isInvalidRefreshTokenError(error)) {
          await clearBrokenLocalSession();
        }
        sessionRef.current = null;
        setSession(null);
        resetBootstrapState();
        setAuthError(error instanceof Error ? error : new Error(String(error)));
      } finally {
        if (!alive) return;
        setAuthLoading(false);
      }
    };

    void init();

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
          resetBootstrapState();
          return;
        }

        try {
          setAuthError(null);
          const freshSession = await ensureFreshSession(nextSession ?? null);
          if (!alive) return;
          sessionRef.current = freshSession;
          setSession(freshSession);

          if (!freshSession?.user) {
            clearCachedBootstrapState(sessionRef.current?.user?.id ?? null);
            resetBootstrapState();
            return;
          }

          void runBootstrap(freshSession.user, {
            pathname: getCurrentPathname(),
            seedFromCache: true,
          });
        } catch (error) {
          if (!alive) return;
          if (isInvalidRefreshTokenError(error)) {
            await clearBrokenLocalSession();
            sessionRef.current = null;
            setSession(null);
            resetBootstrapState();
            return;
          }
          setAuthError(error instanceof Error ? error : new Error(String(error)));
        }
      },
    );

    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, [resetBootstrapState, runBootstrap]);

  const sessionValue = useMemo<SessionAuthContextValue>(
    () =>
      buildSessionAuthValue({
        session,
        authLoading,
        authError,
      }),
    [authError, authLoading, session],
  );

  const bootstrapValue = useMemo<BootstrapAuthContextValue>(
    () => ({
      ...bootstrapState,
      bootstrapLoading,
      bootstrapResolved,
      bootstrapStale,
      hasStableBootstrap: hasMeaningfulBootstrapState(lastStableBootstrapRef.current),
      bootstrapError,
      refreshBootstrap,
      refreshRole: refreshBootstrap,
      patchBootstrap,
    }),
    [
      bootstrapError,
      bootstrapLoading,
      bootstrapResolved,
      bootstrapStale,
      bootstrapState,
      patchBootstrap,
      refreshBootstrap,
    ],
  );

  return (
    <SessionAuthContext.Provider value={sessionValue}>
      <BootstrapAuthContext.Provider value={bootstrapValue}>
        {children}
      </BootstrapAuthContext.Provider>
    </SessionAuthContext.Provider>
  );
}

export function useSessionAuth() {
  const ctx = useContext(SessionAuthContext);
  if (!ctx) throw new Error("useSessionAuth must be used within AuthProvider");
  return ctx;
}

export function useBootstrapAuth() {
  const ctx = useContext(BootstrapAuthContext);
  if (!ctx) throw new Error("useBootstrapAuth must be used within AuthProvider");
  return ctx;
}

export function useAuth(): CombinedAuthContextValue {
  const session = useSessionAuth();
  const bootstrap = useBootstrapAuth();

  return {
    ...session,
    ...bootstrap,
    loading: session.authLoading,
  };
}

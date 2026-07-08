import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  Navigate,
  Route,
  Routes,
  useLocation,
  useParams,
} from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  ClientAccountOnboardingPage,
  ClientBaselinePage,
  ClientCheckinPage,
  ClientCoachMarketplacePage,
  ClientHabitsPage,
  ClientHomePage,
  ClientLayout,
  ClientMedicalPage,
  ClientMessagesPage,
  ClientNutritionCreatePlanPage,
  ClientNutritionPage,
  ClientNutritionDayPage,
  ClientOnboardingPage,
  ClientSettingsPage,
  ClientWearablesPage,
  ClientProgressPage,
  ClientWorkoutDetailPage,
  ClientWorkoutRunPage,
  ClientWorkoutSummaryPage,
  ClientWorkoutsPage,
  ClientSignupPage,
  AuthCallbackPage,
  DemoPage,
  ForgotPasswordPage,
  HealthPage,
  InvitePage,
  LegacySettingsRedirectPage,
  LoginPage,
  MarketingHomePage,
  NoWorkspacePage,
  PricingPage,
  ProductPage,
  NotificationsPage,
  PrivacyPage,
  PublicCoachProfilePage,
  PtBaselineTemplatesPage,
  PtCalendarPage,
  PtCheckinsQueuePage,
  PtCheckinTemplatesPage,
  PtClientDetailPage,
  PtClientsPage,
  PtDashboardPage,
  PtExerciseLibraryPage,
  PtHubAnalyticsPage,
  PtHubClientsPage,
  PtHubLeadDetailPage,
  PtHubLeadsPage,
  PtHubLayout,
  PtHubNotificationsPage,
  PtHubOverviewPage,
  PtHubPaymentsPage,
  PtHubPackagesPage,
  PtHubProfilePage,
  PtHubProfilePreviewPage,
  PtHubSettingsAccountTab,
  PtHubSettingsBillingTab,
  PtHubSettingsIntegrationsTab,
  PtHubSettingsLayoutPage,
  PtHubSettingsNotificationsTab,
  PtHubSettingsPreferencesTab,
  PtHubSettingsSecurityTab,
  PtHubWorkspacesPage,
  PtLayout,
  PtMessagesPage,
  PtNutritionPage,
  PtNutritionTemplateBuilderPage,
  PtOpsStatusPage,
  PtProgramBuilderPage,
  PtProgramsPage,
  PtSignupPage,
  PtWorkoutTemplateBuilderPage,
  PtWorkoutTemplatePreviewPage,
  PtWorkoutTemplatesPage,
  PtWorkspaceOnboardingPage,
  ResetPasswordPage,
  SignupRolePage,
  SupportPage,
  TeamInviteAcceptancePage,
  TermsPage,
  WorkspaceSettingsAutomationsTab,
  WorkspaceSettingsClientExperienceTab,
  WorkspaceSettingsDangerTab,
  WorkspaceSettingsDefaultsTab,
  WorkspaceSettingsGeneralTab,
  WorkspaceSettingsIntegrationsTab,
  WorkspaceSettingsLayoutPage,
  WorkspaceSettingsTeamTab,
} from "./lazy-pages";

// ✅ assumes your AuthProvider exports this hook
import {
  getPublicRootRouteDecision,
  useBootstrapAuth,
  useSessionAuth,
} from "../lib/auth";
import { tracePoint } from "../lib/perf-trace";
import {
  getClientRouteGuardDecision,
  isClientRouteUuid,
} from "../lib/client-route-guard";
import { canUseBootstrapForProtectedRoute } from "../lib/protected-route-guard";
import { supabase } from "../lib/supabase";
import { BootstrapGate } from "../components/common/bootstrap-gate";
import { preloadPtHubAnimatedBackground } from "../components/common/app-shell-background-preload";
import { RouteAwareWireframeLoader } from "../components/common/wireframe-loader";
import { useNotificationRealtime } from "../features/notifications/hooks/use-notification-realtime";
import {
  LegacyClientRedirect,
  LegacyPublicProfileRedirect,
  LegacyWorkspaceEntryRedirect,
  LegacyWorkspaceSettingsRedirect,
  WorkspaceClientDetailRoute,
  WorkspaceSlugBoundary,
} from "./slug-route-resolvers";

type WindowWithIdleCallback = Window & {
  requestIdleCallback?: (
    callback: IdleRequestCallback,
    options?: IdleRequestOptions,
  ) => number;
  cancelIdleCallback?: (handle: number) => void;
};

function FullPageLoader() {
  return <RouteAwareWireframeLoader title="" message="" />;
}

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { authLoading, session } = useSessionAuth();
  const location = useLocation();
  const loginRedirectState = useMemo(
    () => ({ from: location.pathname }),
    [location.pathname],
  );

  return (
    <BootstrapGate>
      {authLoading ? (
        <FullPageLoader />
      ) : !session ? (
        <Navigate to="/login" replace state={loginRedirectState} />
      ) : (
        <>{children}</>
      )}
    </BootstrapGate>
  );
}

/**
 * role guard:
 * expects role values from useAuth() like:
 * - "pt"
 * - "client"
 * - "none"
 * If your app uses different strings, adjust below.
 */
function getClientAccountOnboardingPath(inviteToken: string | null) {
  if (!inviteToken) return "/client/onboarding/account";
  return `/client/onboarding/account?invite=${encodeURIComponent(inviteToken)}`;
}

function getProtectedRedirect(params: {
  pathname: string;
  allow: Array<"pt" | "client">;
  accountType: "pt" | "client" | "unknown";
  hasWorkspaceMembership: boolean;
  ptWorkspaceComplete: boolean;
  ptProfileComplete: boolean;
  clientAccountComplete: boolean;
  clientWorkspaceOnboardingHardGateRequired: boolean;
  pendingInviteToken: string | null;
}) {
  if (params.accountType === "pt") {
    if (!params.ptWorkspaceComplete) {
      return "/pt/onboarding/workspace";
    }
    if (!params.allow.includes("pt")) {
      return "/pt-hub";
    }
    return null;
  }

  if (params.accountType === "client") {
    if (!params.clientAccountComplete) {
      return getClientAccountOnboardingPath(params.pendingInviteToken);
    }
    if (!params.hasWorkspaceMembership) {
      if (
        params.allow.includes("client") &&
        (params.pathname.startsWith("/app/") ||
          params.pathname.startsWith("/app/messages") ||
          params.pathname.startsWith("/app/settings"))
      ) {
        return null;
      }
      return "/app/home";
    }
    if (
      params.clientWorkspaceOnboardingHardGateRequired &&
      !params.pathname.startsWith("/app/onboarding") &&
      !params.pathname.startsWith("/app/home")
    ) {
      return "/app/onboarding";
    }
    if (!params.allow.includes("client")) {
      return "/app/home";
    }
    return null;
  }

  return "/no-workspace";
}

function RequireRole({
  allow,
  children,
}: {
  allow: Array<"pt" | "client">;
  children: React.ReactNode;
}) {
  const {
    accountType,
    bootstrapResolved,
    bootstrapStale,
    bootstrapUserId,
    clientAccountComplete,
    clientWorkspaceOnboardingHardGateRequired,
    hasWorkspaceMembership,
    pendingInviteToken,
    ptProfileComplete,
    ptWorkspaceComplete,
  } = useBootstrapAuth();
  const { user } = useSessionAuth();
  const location = useLocation();
  const canUseBootstrap = canUseBootstrapForProtectedRoute({
    allow,
    accountType,
    bootstrapResolved,
    bootstrapStale,
    bootstrapUserId,
    currentUserId: user?.id,
  });
  tracePoint("RequireRole.decision", {
    pathname: location.pathname,
    allow: allow.join(","),
    accountType,
    bootstrapResolved,
    bootstrapStale,
    bootstrapUserId,
    currentUserId: user?.id ?? null,
    canUseBootstrap,
  });

  return (
    <BootstrapGate>
      {!canUseBootstrap ? (
        <FullPageLoader />
      ) : (
        (() => {
          const redirect = getProtectedRedirect({
            pathname: location.pathname,
            allow,
            accountType,
            hasWorkspaceMembership,
            ptWorkspaceComplete,
            ptProfileComplete,
            clientAccountComplete,
            clientWorkspaceOnboardingHardGateRequired,
            pendingInviteToken,
          });
          return redirect ? (
            <Navigate to={redirect} replace />
          ) : (
            <>{children}</>
          );
        })()
      )}
    </BootstrapGate>
  );
}

function LoginGate() {
  const { authLoading, session } = useSessionAuth();
  const { bootstrapPath, bootstrapResolved } = useBootstrapAuth();
  const location = useLocation();
  const redirectParam = new URLSearchParams(location.search).get("redirect");
  const redirectTarget =
    redirectParam &&
    (redirectParam.startsWith("/join/") ||
      redirectParam.startsWith("/invite/") ||
      redirectParam.startsWith("/team-invites/"))
      ? redirectParam
      : null;

  if (authLoading) return <FullPageLoader />;

  // If already logged in, don't allow staying on /login
  if (session) {
    if (redirectTarget) return <Navigate to={redirectTarget} replace />;
    if (!bootstrapResolved) return <FullPageLoader />;
    return <Navigate to={bootstrapPath ?? "/no-workspace"} replace />;
  }

  return <LoginPage />;
}

function PublicRootGate() {
  const { authLoading, isAuthenticated } = useSessionAuth();
  const { bootstrapPath, bootstrapResolved } = useBootstrapAuth();
  const decision = getPublicRootRouteDecision({
    authLoading,
    isAuthenticated,
    bootstrapResolved,
    bootstrapPath,
  });

  if (decision.type === "loading") return <FullPageLoader />;
  if (decision.type === "redirect") {
    return <Navigate to={decision.to} replace />;
  }

  return <MarketingHomePage />;
}

function PtClientDetailRoute() {
  const { clientId } = useParams<{ clientId: string }>();
  const accessQuery = useQuery({
    queryKey: ["route-client-access", clientId],
    enabled: isClientRouteUuid(clientId),
    queryFn: async () => {
      const { data, error } = await supabase.rpc("can_access_client", {
        p_client_id: clientId ?? "",
        p_permission: "clients.view",
      });
      if (error) throw error;
      return Boolean(data);
    },
    retry: false,
  });
  const guardDecision = getClientRouteGuardDecision({
    clientId,
    accessLoading: accessQuery.isLoading,
    accessAllowed: accessQuery.data,
    accessError: accessQuery.error,
  });

  if (guardDecision === "loading") return <FullPageLoader />;
  if (guardDecision === "redirect") {
    return <Navigate to="/pt/clients" replace />;
  }

  return <PtClientDetailPage clientIdOverride={clientId} />;
}

function LegacyJoinRedirect() {
  const { code } = useParams<{ code: string }>();
  return <Navigate to={`/invite/${code ?? ""}`} replace />;
}

function PtHubAssetPreloader() {
  const location = useLocation();
  const { isAuthenticated } = useSessionAuth();
  const { accountType } = useBootstrapAuth();

  useEffect(() => {
    if (!isAuthenticated) return;

    const shouldPreload =
      accountType === "pt" ||
      location.pathname.startsWith("/pt") ||
      location.pathname.startsWith("/pt-hub");

    if (!shouldPreload) return;

    const windowWithIdleCallback = window as WindowWithIdleCallback;
    let timeoutHandle: number | null = null;
    let idleHandle: number | null = null;
    const isPtHubRoute = location.pathname.startsWith("/pt-hub");
    const idleTimeout = isPtHubRoute ? 3600 : 900;
    const fallbackDelay = isPtHubRoute ? 3200 : 120;

    const preload = () => {
      void preloadPtHubAnimatedBackground();
    };

    if (typeof windowWithIdleCallback.requestIdleCallback === "function") {
      idleHandle = windowWithIdleCallback.requestIdleCallback(preload, {
        timeout: idleTimeout,
      });
    } else {
      timeoutHandle = window.setTimeout(preload, fallbackDelay);
    }

    return () => {
      if (
        idleHandle !== null &&
        typeof windowWithIdleCallback.cancelIdleCallback === "function"
      ) {
        windowWithIdleCallback.cancelIdleCallback(idleHandle);
      }
      if (timeoutHandle !== null) {
        window.clearTimeout(timeoutHandle);
      }
    };
  }, [accountType, isAuthenticated, location.pathname]);

  return null;
}

function AuthTestSignals() {
  const { authLoading, isAuthenticated } = useSessionAuth();
  const { bootstrapResolved } = useBootstrapAuth();

  return (
    <div aria-hidden="true" className="hidden">
      {!authLoading && isAuthenticated ? (
        <div data-testid="auth-session-ready" />
      ) : null}
      {!authLoading && isAuthenticated && bootstrapResolved ? (
        <div data-testid="bootstrap-resolved" />
      ) : null}
    </div>
  );
}

function GlobalNotificationRealtime() {
  const { isAuthenticated, user } = useSessionAuth();

  useNotificationRealtime({
    userId: isAuthenticated ? (user?.id ?? null) : null,
  });

  return null;
}

function getShellKey(pathname: string) {
  if (pathname.startsWith("/pt-hub")) return "pt-hub";
  if (
    pathname.startsWith("/pt") ||
    pathname.startsWith("/settings") ||
    pathname.startsWith("/workspace/")
  ) {
    return "pt-workspace";
  }
  if (pathname.startsWith("/app")) return "client-workspace";
  return "public";
}

function ensureMetaTag(name: string) {
  let tag = document.head.querySelector<HTMLMetaElement>(
    `meta[name="${name}"]`,
  );

  if (!tag) {
    tag = document.createElement("meta");
    tag.name = name;
    document.head.appendChild(tag);
  }

  return tag;
}

function ensureCanonicalLink() {
  let link = document.head.querySelector<HTMLLinkElement>(
    'link[rel="canonical"]',
  );

  if (!link) {
    link = document.createElement("link");
    link.rel = "canonical";
    document.head.appendChild(link);
  }

  return link;
}

function isPrivateRoute(pathname: string) {
  return (
    pathname.startsWith("/pt-hub") ||
    pathname.startsWith("/pt") ||
    pathname.startsWith("/app") ||
    pathname.startsWith("/settings") ||
    pathname.startsWith("/workspace/") ||
    pathname.startsWith("/login") ||
    pathname.startsWith("/invite") ||
    pathname.startsWith("/team-invites") ||
    pathname.startsWith("/join") ||
    pathname.startsWith("/no-workspace") ||
    pathname.startsWith("/client/onboarding")
  );
}

function DocumentMetadata() {
  const location = useLocation();

  useEffect(() => {
    const robots = ensureMetaTag("robots");
    const googlebot = ensureMetaTag("googlebot");
    const canonical = ensureCanonicalLink();
    const content = isPrivateRoute(location.pathname)
      ? "noindex, nofollow"
      : "index, follow";
    const canonicalUrl = `${window.location.origin}${location.pathname}`;

    robots.content = content;
    googlebot.content = content;
    canonical.href = canonicalUrl;
  }, [location.pathname]);

  return null;
}

function AppShellTransition({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const reduceMotion = useReducedMotion();
  const shellKey = getShellKey(location.pathname);
  const previousShellRef = useRef(shellKey);
  const previousShellKey = previousShellRef.current;

  useEffect(() => {
    previousShellRef.current = shellKey;
  }, [shellKey]);

  const shellMotion = useMemo(() => {
    const fromHubToWorkspace =
      previousShellKey === "pt-hub" && shellKey === "pt-workspace";
    const fromWorkspaceToHub =
      previousShellKey === "pt-workspace" && shellKey === "pt-hub";

    if (fromHubToWorkspace) {
      return {
        initial: { opacity: 0.82 },
        animate: { opacity: 1 },
        exit: { opacity: 0.9 },
      };
    }

    if (fromWorkspaceToHub) {
      return {
        initial: { opacity: 0.82 },
        animate: { opacity: 1 },
        exit: { opacity: 0.9 },
      };
    }

    return {
      initial: { opacity: 0.84 },
      animate: { opacity: 1 },
      exit: { opacity: 0.9 },
    };
  }, [previousShellKey, shellKey]);

  const shellOverlay = useMemo(() => {
    if (shellKey === "pt-hub") {
      return "radial-gradient(circle at 16% 18%, rgba(87, 129, 255, 0.1), transparent 34%), radial-gradient(circle at 80% 24%, rgba(116, 201, 164, 0.08), transparent 30%)";
    }

    if (shellKey === "pt-workspace") {
      return "radial-gradient(circle at 16% 18%, rgba(87, 129, 255, 0.1), transparent 34%), radial-gradient(circle at 80% 24%, rgba(116, 201, 164, 0.08), transparent 30%)";
    }

    if (shellKey === "client-workspace") {
      return "radial-gradient(circle at 18% 20%, rgba(251, 191, 36, 0.09), transparent 32%), radial-gradient(circle at 80% 20%, rgba(59, 130, 246, 0.08), transparent 28%)";
    }

    return "radial-gradient(circle at 20% 20%, rgba(255,255,255,0.08), transparent 30%)";
  }, [shellKey]);

  if (reduceMotion) {
    return <>{children}</>;
  }

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={shellKey}
        className="relative"
        initial={shellMotion.initial}
        animate={shellMotion.animate}
        exit={shellMotion.exit}
        transition={{
          duration: 0.34,
          ease: [0.22, 1, 0.36, 1],
        }}
      >
        <motion.div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-10"
          initial={{ opacity: 0.22 }}
          animate={{ opacity: 0 }}
          exit={{ opacity: 0.18 }}
          transition={{ duration: 0.36, ease: [0.22, 1, 0.36, 1] }}
          style={{ background: shellOverlay }}
        />
        {children}
      </motion.div>
    </AnimatePresence>
  );
}

export function App() {
  const location = useLocation();

  return (
    <Suspense fallback={<FullPageLoader />}>
      <PtHubAssetPreloader />
      <AuthTestSignals />
      <GlobalNotificationRealtime />
      <DocumentMetadata />
      <AppShellTransition>
        <Routes location={location}>
          {/* Public landing */}
          <Route path="/" element={<PublicRootGate />} />
          <Route path="/product" element={<ProductPage />} />
          <Route path="/pricing" element={<PricingPage />} />
          <Route path="/demo" element={<DemoPage />} />

          {/* Public */}
          <Route path="/login" element={<LoginGate />} />
          <Route path="/auth/callback" element={<AuthCallbackPage />} />
          <Route
            path="/auth/forgot-password"
            element={<ForgotPasswordPage />}
          />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/auth/reset-password" element={<ResetPasswordPage />} />
          <Route path="/signup" element={<SignupRolePage />} />
          <Route path="/signup/pt" element={<PtSignupPage />} />
          <Route path="/signup/client" element={<ClientSignupPage />} />
          <Route path="/invite/:token" element={<InvitePage />} />
          <Route
            path="/team-invites/:token"
            element={<TeamInviteAcceptancePage />}
          />
          <Route path="/join/:code" element={<LegacyJoinRedirect />} />
          <Route path="/p/:ptSlug" element={<PublicCoachProfilePage />} />
          <Route path="/p/:ptSlug/apply" element={<PublicCoachProfilePage />} />
          <Route path="/p/:ptSlug/book" element={<PublicCoachProfilePage />} />
          <Route
            path="/coach/:slug"
            element={<LegacyPublicProfileRedirect />}
          />
          <Route
            path="/profile/:id"
            element={<LegacyPublicProfileRedirect />}
          />
          <Route
            path="/public-profile/:id"
            element={<LegacyPublicProfileRedirect />}
          />
          <Route path="/privacy" element={<PrivacyPage />} />
          <Route path="/terms" element={<TermsPage />} />
          <Route path="/support" element={<SupportPage />} />
          <Route path="/health" element={<HealthPage />} />

          <Route
            path="/no-workspace"
            element={
              <RequireAuth>
                <NoWorkspacePage />
              </RequireAuth>
            }
          />
          <Route
            path="/pt/onboarding/workspace"
            element={
              <RequireAuth>
                <PtWorkspaceOnboardingPage />
              </RequireAuth>
            }
          />
          <Route
            path="/pt/onboarding/profile"
            element={
              <RequireAuth>
                <Navigate to="/pt-hub" replace />
              </RequireAuth>
            }
          />
          <Route
            path="/client/onboarding/account"
            element={
              <RequireAuth>
                <ClientAccountOnboardingPage />
              </RequireAuth>
            }
          />
          <Route
            path="/workspace/:workspaceId"
            element={
              <RequireAuth>
                <RequireRole allow={["pt"]}>
                  <LegacyWorkspaceEntryRedirect />
                </RequireRole>
              </RequireAuth>
            }
          />
          <Route
            path="/clients/:clientId"
            element={
              <RequireAuth>
                <RequireRole allow={["pt"]}>
                  <LegacyClientRedirect />
                </RequireRole>
              </RequireAuth>
            }
          />

          <Route
            path="/pt-hub"
            element={
              <RequireAuth>
                <RequireRole allow={["pt"]}>
                  <PtHubLayout />
                </RequireRole>
              </RequireAuth>
            }
          >
            <Route index element={<PtHubOverviewPage />} />
            <Route path="profile" element={<PtHubProfilePage />} />
            <Route
              path="profile/preview"
              element={<PtHubProfilePreviewPage />}
            />
            <Route path="packages" element={<PtHubPackagesPage />} />
            <Route path="leads" element={<PtHubLeadsPage />} />
            <Route path="leads/:leadId" element={<PtHubLeadDetailPage />} />
            <Route path="clients" element={<PtHubClientsPage />} />
            <Route path="workspaces" element={<PtHubWorkspacesPage />} />
            <Route path="payments" element={<PtHubPaymentsPage />} />
            <Route path="analytics" element={<PtHubAnalyticsPage />} />
            <Route path="notifications" element={<PtHubNotificationsPage />} />
            <Route path="settings" element={<PtHubSettingsLayoutPage />}>
              <Route index element={<Navigate to="account" replace />} />
              <Route path="account" element={<PtHubSettingsAccountTab />} />
              <Route
                path="public-profile"
                element={<Navigate to="/pt-hub/profile" replace />}
              />
              <Route
                path="notifications"
                element={<PtHubSettingsNotificationsTab />}
              />
              <Route
                path="preferences"
                element={<PtHubSettingsPreferencesTab />}
              />
              <Route path="security" element={<PtHubSettingsSecurityTab />} />
              <Route path="billing" element={<PtHubSettingsBillingTab />} />
              <Route
                path="integrations"
                element={<PtHubSettingsIntegrationsTab />}
              />
            </Route>
          </Route>

          {/* PT Side */}
          <Route
            path="/pt"
            element={
              <RequireAuth>
                <RequireRole allow={["pt"]}>
                  <PtLayout />
                </RequireRole>
              </RequireAuth>
            }
          >
            <Route path="dashboard" element={<PtDashboardPage />} />
            <Route path="clients" element={<PtClientsPage />} />
            <Route path="clients/:clientId" element={<PtClientDetailRoute />} />
            <Route path="programs" element={<PtProgramsPage />} />
            <Route path="programs/new" element={<PtProgramBuilderPage />} />
            <Route
              path="programs/:id/edit"
              element={<PtProgramBuilderPage />}
            />
            <Route
              path="templates/workouts"
              element={<PtWorkoutTemplatesPage />}
            />
            <Route
              path="templates/workouts/:id"
              element={<PtWorkoutTemplatePreviewPage />}
            />
            <Route
              path="templates/workouts/:id/edit"
              element={<PtWorkoutTemplateBuilderPage />}
            />
            <Route path="calendar" element={<PtCalendarPage />} />
            <Route path="checkins" element={<PtCheckinsQueuePage />} />
            <Route
              path="checkins/templates"
              element={<PtCheckinTemplatesPage />}
            />
            <Route path="messages" element={<PtMessagesPage />} />
            <Route path="notifications" element={<NotificationsPage />} />
            <Route path="ops/status" element={<PtOpsStatusPage />} />
            <Route
              path="settings"
              element={<Navigate to="/settings/workspace" replace />}
            />
            <Route
              path="settings/baseline"
              element={<PtBaselineTemplatesPage />}
            />
            <Route
              path="settings/exercises"
              element={<PtExerciseLibraryPage />}
            />
            <Route path="nutrition-programs" element={<PtNutritionPage />} />
            <Route
              path="nutrition-templates"
              element={<Navigate to="/pt/nutrition-programs" replace />}
            />
            <Route
              path="nutrition"
              element={<Navigate to="/pt/nutrition-programs" replace />}
            />
            <Route
              path="nutrition/programs/:id"
              element={<PtNutritionTemplateBuilderPage />}
            />
            <Route
              path="nutrition/templates/:id"
              element={<PtNutritionTemplateBuilderPage />}
            />
          </Route>

          <Route
            path="/workspace/:workspaceId/settings"
            element={
              <RequireAuth>
                <RequireRole allow={["pt"]}>
                  <LegacyWorkspaceSettingsRedirect />
                </RequireRole>
              </RequireAuth>
            }
          />
          <Route
            path="/workspace/:workspaceId/settings/:tab"
            element={
              <RequireAuth>
                <RequireRole allow={["pt"]}>
                  <LegacyWorkspaceSettingsRedirect />
                </RequireRole>
              </RequireAuth>
            }
          />
          <Route
            path="/w/:workspaceSlug"
            element={
              <RequireAuth>
                <RequireRole allow={["pt"]}>
                  <WorkspaceSlugBoundary />
                </RequireRole>
              </RequireAuth>
            }
          >
            <Route element={<PtLayout />}>
              <Route index element={<Navigate to="overview" replace />} />
              <Route path="overview" element={<PtDashboardPage />} />
              <Route path="leads" element={<PtHubLeadsPage />} />
              <Route path="clients" element={<PtClientsPage />} />
              <Route
                path="clients/:clientUrlKey"
                element={<WorkspaceClientDetailRoute />}
              />
              <Route path="check-ins" element={<PtCheckinsQueuePage />} />
              <Route path="analytics" element={<PtHubAnalyticsPage />} />
            </Route>
            <Route path="settings" element={<PtLayout />}>
              <Route element={<WorkspaceSettingsLayoutPage />}>
                <Route index element={<Navigate to="general" replace />} />
                <Route
                  path="general"
                  element={<WorkspaceSettingsGeneralTab />}
                />
                <Route
                  path="brand"
                  element={<Navigate to="../general" replace />}
                />
                <Route
                  path="client-experience"
                  element={<WorkspaceSettingsClientExperienceTab />}
                />
                <Route path="team" element={<WorkspaceSettingsTeamTab />} />
                <Route
                  path="defaults"
                  element={<WorkspaceSettingsDefaultsTab />}
                />
                <Route
                  path="automations"
                  element={<WorkspaceSettingsAutomationsTab />}
                />
                <Route
                  path="integrations"
                  element={<WorkspaceSettingsIntegrationsTab />}
                />
                <Route
                  path="danger-zone"
                  element={<WorkspaceSettingsDangerTab />}
                />
                <Route path="danger" element={<WorkspaceSettingsDangerTab />} />
              </Route>
            </Route>
          </Route>

          <Route
            path="/settings"
            element={
              <RequireAuth>
                <RequireRole allow={["pt"]}>
                  <PtLayout />
                </RequireRole>
              </RequireAuth>
            }
          >
            <Route index element={<LegacySettingsRedirectPage />} />
            <Route path=":section" element={<LegacySettingsRedirectPage />} />
            <Route path="*" element={<LegacySettingsRedirectPage />} />
          </Route>

          {/* Client Side */}
          <Route
            path="/app"
            element={
              <RequireAuth>
                <RequireRole allow={["client"]}>
                  <ClientLayout />
                </RequireRole>
              </RequireAuth>
            }
          >
            <Route path="onboarding" element={<ClientOnboardingPage />} />
            <Route path="home" element={<ClientHomePage />} />
            <Route path="workouts" element={<ClientWorkoutsPage />} />
            <Route
              path="workouts/today"
              element={<Navigate to="/app/workouts" replace />}
            />
            <Route
              path="workouts/:assignedWorkoutId"
              element={<ClientWorkoutDetailPage />}
            />
            <Route
              path="workout-run/:assignedWorkoutId"
              element={<ClientWorkoutRunPage />}
            />
            <Route
              path="workout-summary/:assignedWorkoutId"
              element={<ClientWorkoutSummaryPage />}
            />
            <Route path="checkins" element={<ClientCheckinPage />} />
            <Route path="checkin" element={<ClientCheckinPage />} />
            <Route path="messages" element={<ClientMessagesPage />} />
            <Route path="notifications" element={<NotificationsPage />} />
            <Route path="settings" element={<ClientSettingsPage />} />
            <Route
              path="profile"
              element={<Navigate to="/app/settings?tab=profile" replace />}
            />
            <Route path="habits" element={<ClientHabitsPage />} />
            <Route path="wearables" element={<ClientWearablesPage />} />
            <Route path="progress" element={<ClientProgressPage />} />
            <Route path="nutrition" element={<ClientNutritionPage />} />
            <Route
              path="nutrition/new"
              element={<ClientNutritionCreatePlanPage />}
            />
            <Route path="find-coach" element={<ClientCoachMarketplacePage />} />
            <Route path="medical" element={<ClientMedicalPage />} />
            <Route path="baseline" element={<ClientBaselinePage />} />
            <Route
              path="nutrition/:assigned_nutrition_day_id"
              element={<ClientNutritionDayPage />}
            />
          </Route>

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </AppShellTransition>
    </Suspense>
  );
}

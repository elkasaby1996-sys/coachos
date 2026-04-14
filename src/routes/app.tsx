import { Suspense, useEffect, useMemo, useRef } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  Navigate,
  Route,
  Routes,
  useLocation,
  useParams,
} from "react-router-dom";
import {
  ClientAccountOnboardingPage,
  ClientBaselinePage,
  ClientCheckinPage,
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
  ClientProgressPage,
  ClientWorkoutDetailPage,
  ClientWorkoutRunPage,
  ClientWorkoutSummaryPage,
  ClientWorkoutsPage,
  ClientSignupPage,
  HealthPage,
  InvitePage,
  LegacySettingsRedirectPage,
  LoginPage,
  NoWorkspacePage,
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
  PtHubOverviewPage,
  PtHubPaymentsPage,
  PtHubPackagesPage,
  PtHubProfilePage,
  PtHubProfilePreviewPage,
  PtHubSettingsAccountTab,
  PtHubSettingsBillingTab,
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
  SignupRolePage,
  SupportPage,
  TermsPage,
  WorkspaceSettingsAutomationsTab,
  WorkspaceSettingsBrandTab,
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
  getAuthenticatedRedirectPath,
  useBootstrapAuth,
  useSessionAuth,
} from "../lib/auth";
import { BootstrapGate } from "../components/common/bootstrap-gate";
import { preloadPtHubAnimatedBackground } from "../components/common/app-shell-background-preload";

type WindowWithIdleCallback = Window & {
  requestIdleCallback?: (
    callback: IdleRequestCallback,
    options?: IdleRequestOptions,
  ) => number;
  cancelIdleCallback?: (handle: number) => void;
};

function FullPageLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-sm text-muted-foreground">Loading...</div>
    </div>
  );
}

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { authLoading, session } = useSessionAuth();
  const location = useLocation();

  return (
    <BootstrapGate>
      {authLoading ? (
        <FullPageLoader />
      ) : !session ? (
        <Navigate to="/login" replace state={{ from: location.pathname }} />
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
        (params.pathname.startsWith("/app/home") ||
          params.pathname.startsWith("/app/messages") ||
          params.pathname.startsWith("/app/settings") ||
          params.pathname.startsWith("/app/profile"))
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
    clientAccountComplete,
    clientWorkspaceOnboardingHardGateRequired,
    hasStableBootstrap,
    hasWorkspaceMembership,
    pendingInviteToken,
    ptProfileComplete,
    ptWorkspaceComplete,
  } = useBootstrapAuth();
  const location = useLocation();

  return (
    <BootstrapGate>
      {!bootstrapResolved ? (
        hasStableBootstrap && bootstrapStale ? (
          <>{children}</>
        ) : (
          <FullPageLoader />
        )
      ) : (() => {
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
      })()}
    </BootstrapGate>
  );
}

function IndexRedirect() {
  const { authLoading, session } = useSessionAuth();
  const { bootstrapPath, bootstrapResolved } = useBootstrapAuth();

  if (authLoading) return <FullPageLoader />;

  if (!session) return <Navigate to="/login" replace />;

  if (!bootstrapResolved) return <FullPageLoader />;

  return <Navigate to={bootstrapPath ?? "/no-workspace"} replace />;
}

function LoginGate() {
  const { authLoading, session } = useSessionAuth();
  const { bootstrapPath, bootstrapResolved } = useBootstrapAuth();
  const location = useLocation();
  const redirectParam = new URLSearchParams(location.search).get("redirect");
  const redirectTarget =
    redirectParam &&
    (redirectParam.startsWith("/join/") || redirectParam.startsWith("/invite/"))
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

    const preload = () => {
      void preloadPtHubAnimatedBackground();
    };

    if (typeof windowWithIdleCallback.requestIdleCallback === "function") {
      idleHandle = windowWithIdleCallback.requestIdleCallback(preload, {
        timeout: 900,
      });
    } else {
      timeoutHandle = window.setTimeout(preload, 120);
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
      <DocumentMetadata />
      <AppShellTransition>
        <Routes location={location}>
        {/* Smart landing */}
        <Route path="/" element={<IndexRedirect />} />

        {/* Public */}
        <Route path="/login" element={<LoginGate />} />
        <Route path="/signup" element={<SignupRolePage />} />
        <Route path="/signup/pt" element={<PtSignupPage />} />
        <Route path="/signup/client" element={<ClientSignupPage />} />
        <Route path="/invite/:token" element={<InvitePage />} />
        <Route path="/join/:code" element={<LegacyJoinRedirect />} />
        <Route path="/coach/:slug" element={<PublicCoachProfilePage />} />
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
          <Route path="profile/preview" element={<PtHubProfilePreviewPage />} />
          <Route path="packages" element={<PtHubPackagesPage />} />
          <Route path="leads" element={<PtHubLeadsPage />} />
          <Route path="leads/:leadId" element={<PtHubLeadDetailPage />} />
          <Route path="clients" element={<PtHubClientsPage />} />
          <Route path="workspaces" element={<PtHubWorkspacesPage />} />
          <Route path="payments" element={<PtHubPaymentsPage />} />
          <Route path="analytics" element={<PtHubAnalyticsPage />} />
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
              element={<Navigate to="../account" replace />}
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
          <Route path="clients/:clientId" element={<PtClientDetailPage />} />
          <Route path="programs" element={<PtProgramsPage />} />
          <Route path="programs/new" element={<PtProgramBuilderPage />} />
          <Route path="programs/:id/edit" element={<PtProgramBuilderPage />} />
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
                <PtLayout />
              </RequireRole>
            </RequireAuth>
          }
        >
          <Route element={<WorkspaceSettingsLayoutPage />}>
            <Route index element={<Navigate to="general" replace />} />
            <Route path="general" element={<WorkspaceSettingsGeneralTab />} />
            <Route path="brand" element={<WorkspaceSettingsBrandTab />} />
            <Route
              path="client-experience"
              element={<WorkspaceSettingsClientExperienceTab />}
            />
            <Route path="team" element={<WorkspaceSettingsTeamTab />} />
            <Route path="defaults" element={<WorkspaceSettingsDefaultsTab />} />
            <Route
              path="automations"
              element={<WorkspaceSettingsAutomationsTab />}
            />
            <Route
              path="integrations"
              element={<WorkspaceSettingsIntegrationsTab />}
            />
            <Route path="danger" element={<WorkspaceSettingsDangerTab />} />
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
          <Route path="progress" element={<ClientProgressPage />} />
          <Route path="nutrition" element={<ClientNutritionPage />} />
          <Route
            path="nutrition/new"
            element={<ClientNutritionCreatePlanPage />}
          />
          <Route
            path="find-coach"
            element={<Navigate to="/app/home?module=find-coach" replace />}
          />
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

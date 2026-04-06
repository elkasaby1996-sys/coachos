import { Suspense, useEffect } from "react";
import {
  Navigate,
  Route,
  Routes,
  useLocation,
  useParams,
} from "react-router-dom";
import {
  AccountSettings,
  AppearanceSettings,
  BillingSettings,
  ClientAccountOnboardingPage,
  ClientBaselinePage,
  ClientCheckinPage,
  ClientHabitsPage,
  ClientHomePage,
  ClientLayout,
  ClientMedicalPage,
  ClientMessagesPage,
  ClientNutritionDayPage,
  ClientOnboardingPage,
  ClientProfilePage,
  ClientProgressPage,
  ClientWorkoutDetailPage,
  ClientWorkoutRunPage,
  ClientWorkoutSummaryPage,
  ClientWorkoutTodayPage,
  ClientSignupPage,
  DangerZoneSettings,
  DefaultsSettings,
  HealthPage,
  InvitePage,
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
  PtHubLeadsPage,
  PtHubLayout,
  PtHubOverviewPage,
  PtHubPaymentsPage,
  PtHubProfilePage,
  PtHubProfilePreviewPage,
  PtHubSettingsPage,
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
  PublicProfileSettings,
  SettingsLayout,
  SignupRolePage,
  SupportPage,
  TermsPage,
  WelcomePage,
  WorkspaceSettings,
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
      return "/no-workspace";
    }
    if (
      params.clientWorkspaceOnboardingHardGateRequired &&
      !params.pathname.startsWith("/app/onboarding")
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

  if (!session) return <WelcomePage />;

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

export function App() {
  return (
    <Suspense fallback={<FullPageLoader />}>
      <PtHubAssetPreloader />
      <Routes>
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
          <Route path="leads" element={<PtHubLeadsPage />} />
          <Route path="clients" element={<PtHubClientsPage />} />
          <Route path="workspaces" element={<PtHubWorkspacesPage />} />
          <Route path="payments" element={<PtHubPaymentsPage />} />
          <Route path="analytics" element={<PtHubAnalyticsPage />} />
          <Route path="settings" element={<PtHubSettingsPage />} />
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
          path="/settings"
          element={
            <RequireAuth>
              <RequireRole allow={["pt"]}>
                <PtLayout />
              </RequireRole>
            </RequireAuth>
          }
        >
          <Route
            index
            element={<Navigate to="/settings/workspace" replace />}
          />
          <Route element={<SettingsLayout />}>
            <Route path="workspace" element={<WorkspaceSettings />} />
            <Route path="public-profile" element={<PublicProfileSettings />} />
            <Route path="account" element={<AccountSettings />} />
            <Route path="billing" element={<BillingSettings />} />
            <Route path="appearance" element={<AppearanceSettings />} />
            <Route path="defaults" element={<DefaultsSettings />} />
            <Route path="danger" element={<DangerZoneSettings />} />
          </Route>
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
          <Route path="workouts/today" element={<ClientWorkoutTodayPage />} />
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
          <Route path="checkin" element={<ClientCheckinPage />} />
          <Route path="messages" element={<ClientMessagesPage />} />
          <Route path="notifications" element={<NotificationsPage />} />
          <Route path="profile" element={<ClientProfilePage />} />
          <Route path="habits" element={<ClientHabitsPage />} />
          <Route path="progress" element={<ClientProgressPage />} />
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
    </Suspense>
  );
}

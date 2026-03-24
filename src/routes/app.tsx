import { Suspense, useEffect, useState } from "react";
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
  ClientBaselinePage,
  ClientCheckinPage,
  ClientHabitsPage,
  ClientHomePage,
  ClientLayout,
  ClientMessagesPage,
  ClientNutritionDayPage,
  ClientOnboardingPage,
  ClientProfilePage,
  ClientProgressPage,
  ClientWorkoutDetailPage,
  ClientWorkoutRunPage,
  ClientWorkoutSummaryPage,
  ClientWorkoutTodayPage,
  DangerZoneSettings,
  DefaultsSettings,
  HealthPage,
  InvitePage,
  LoginPage,
  NoWorkspacePage,
  NotificationsPage,
  PrivacyPage,
  PtBaselineTemplatesPage,
  PtCalendarPage,
  PtCheckinsQueuePage,
  PtCheckinTemplatesPage,
  PtClientDetailPage,
  PtClientsPage,
  PtDashboardPage,
  PtExerciseLibraryPage,
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
import { useAuth } from "../lib/auth";
import { BootstrapGate } from "../components/common/bootstrap-gate";
import { supabase } from "../lib/supabase";
import { hasCompletedClientOnboarding } from "../lib/client-onboarding";

function FullPageLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-sm text-muted-foreground">Loading...</div>
    </div>
  );
}

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth();
  const location = useLocation();

  return (
    <BootstrapGate>
      {loading ? (
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
function RequireRole({
  allow,
  children,
}: {
  allow: Array<"pt" | "client">;
  children: React.ReactNode;
}) {
  const { role, loading } = useAuth();
  const wantsPt = allow.includes("pt");

  return (
    <BootstrapGate>
      {loading ? (
        <FullPageLoader />
      ) : !role || role === "none" ? (
        wantsPt ? (
          <Navigate to="/pt/onboarding/workspace" replace />
        ) : (
          <Navigate to="/no-workspace" replace />
        )
      ) : !(role === "pt" || role === "client") || !allow.includes(role) ? (
        role === "pt" ? (
          <Navigate to="/pt/dashboard" replace />
        ) : role === "client" ? (
          <Navigate to="/app/home" replace />
        ) : (
          <Navigate to="/no-workspace" replace />
        )
      ) : (
        <>{children}</>
      )}
    </BootstrapGate>
  );
}

function IndexRedirect() {
  const { session, role, loading } = useAuth();

  if (loading) return <FullPageLoader />;

  if (!session) return <WelcomePage />;

  if (role === "none") {
    if (window.localStorage.getItem("coachos_signup_intent") === "pt") {
      return <Navigate to="/pt/onboarding/workspace" replace />;
    }
    return <Navigate to="/no-workspace" replace />;
  }

  if (role === "pt") return <Navigate to="/pt/dashboard" replace />;
  if (role === "client") return <Navigate to="/app/home" replace />;

  return <Navigate to="/no-workspace" replace />;
}

function LoginGate() {
  const { session, role, loading } = useAuth();
  const location = useLocation();
  const redirectParam = new URLSearchParams(location.search).get("redirect");
  const redirectTarget =
    redirectParam &&
    (redirectParam.startsWith("/join/") || redirectParam.startsWith("/invite/"))
      ? redirectParam
      : null;

  if (loading) return <FullPageLoader />;

  // If already logged in, don't allow staying on /login
  if (session) {
    if (redirectTarget) return <Navigate to={redirectTarget} replace />;
    if (role === "pt") return <Navigate to="/pt/dashboard" replace />;
    if (role === "client") return <Navigate to="/app/home" replace />;
    if (window.localStorage.getItem("coachos_signup_intent") === "pt") {
      return <Navigate to="/pt/onboarding/workspace" replace />;
    }
    return <Navigate to="/no-workspace" replace />;
  }

  return <LoginPage />;
}

function LegacyJoinRedirect() {
  const { code } = useParams<{ code: string }>();
  return <Navigate to={`/invite/${code ?? ""}`} replace />;
}

function RequireClientOnboarding({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const { session, role, loading } = useAuth();
  const [onboardingLoading, setOnboardingLoading] = useState(true);
  const [isComplete, setIsComplete] = useState(false);

  useEffect(() => {
    let active = true;

    const checkStatus = async () => {
      if (loading || !session?.user?.id || role !== "client") {
        if (active) {
          setOnboardingLoading(false);
        }
        return;
      }

      setOnboardingLoading(true);
      const { data, error } = await supabase
        .from("clients")
        .select(
          "display_name, dob, location, timezone, gender, gym_name, days_per_week, goal, height_cm, current_weight",
        )
        .eq("user_id", session.user.id)
        .maybeSingle();

      if (!active) return;

      if (error) {
        console.warn("Failed to check onboarding status", error);
        setIsComplete(true);
        setOnboardingLoading(false);
        return;
      }

      setIsComplete(hasCompletedClientOnboarding(data));
      setOnboardingLoading(false);
    };

    checkStatus();

    return () => {
      active = false;
    };
  }, [loading, role, session?.user?.id, location.pathname]);

  if (loading || onboardingLoading) return <FullPageLoader />;

  const onOnboardingRoute = location.pathname.startsWith("/app/onboarding");

  if (!isComplete && !onOnboardingRoute) {
    return <Navigate to="/app/onboarding" replace />;
  }

  if (isComplete && onOnboardingRoute) {
    return <Navigate to="/app/home" replace />;
  }

  return <>{children}</>;
}

export function App() {
  return (
    <Suspense fallback={<FullPageLoader />}>
      <Routes>
        {/* Smart landing */}
        <Route path="/" element={<IndexRedirect />} />

        {/* Public */}
        <Route path="/login" element={<LoginGate />} />
        <Route path="/signup" element={<SignupRolePage />} />
        <Route path="/signup/pt" element={<PtSignupPage />} />
        <Route path="/invite/:token" element={<InvitePage />} />
        <Route path="/join/:code" element={<LegacyJoinRedirect />} />
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
                <RequireClientOnboarding>
                  <ClientLayout />
                </RequireClientOnboarding>
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

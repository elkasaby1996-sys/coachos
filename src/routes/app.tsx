import { useEffect, useState } from "react";
import {
  Navigate,
  Route,
  Routes,
  useLocation,
  useParams,
} from "react-router-dom";
import { PtLayout } from "../components/layouts/pt-layout";
import { ClientLayout } from "../components/layouts/client-layout";

import { LoginPage } from "../pages/public/login";
import { NoWorkspacePage } from "../pages/public/no-workspace";
import { InvitePage } from "../pages/public/invite";
import { PtSignupPage } from "../pages/public/pt-signup";
import { WelcomePage } from "../pages/public/welcome";
import { SignupRolePage } from "../pages/public/signup-role";
import { PrivacyPage } from "../pages/public/privacy";
import { TermsPage } from "../pages/public/terms";
import { SupportPage } from "../pages/public/support";
import { HealthPage } from "../pages/public/health";

import { PtDashboardPage } from "../pages/pt/dashboard";
import { PtClientsPage } from "../pages/pt/clients";
import { PtClientDetailPage } from "../pages/pt/client-detail";
import { PtProgramsPage } from "../pages/pt/programs";
import { PtProgramBuilderPage } from "../pages/pt/program-builder";
import { PtWorkoutTemplatesPage } from "../pages/pt/workout-templates";
import { PtWorkoutTemplateBuilderPage } from "../pages/pt/workout-template-builder";
import { PtWorkoutTemplatePreviewPage } from "../pages/pt/workout-template-preview";
import { PtCheckinsQueuePage } from "../pages/pt/checkins";
import { PtCheckinTemplatesPage } from "../pages/pt/checkin-templates";
import { PtCalendarPage } from "../pages/pt/calendar";
import { PtMessagesPage } from "../pages/pt/messages";
import { PtSettingsPage } from "../pages/pt/settings";
import { PtBaselineTemplatesPage } from "../pages/pt/settings-baseline";
import { PtExerciseLibraryPage } from "../pages/pt/settings-exercises";
import { PtNutritionPage } from "../pages/pt/nutrition";
import { PtNutritionTemplateBuilderPage } from "../pages/pt/nutrition-template-builder";
import { PtWorkspaceOnboardingPage } from "../pages/pt/onboarding-workspace";

import { ClientHomePage } from "../pages/client/home";
import { ClientWorkoutDetailPage } from "../pages/client/workout-detail";
import { ClientWorkoutTodayPage } from "../pages/client/workout-today";
import { ClientWorkoutRunPage } from "../pages/client/workout-run";
import { ClientWorkoutSummaryPage } from "../pages/client/workout-summary";
import { ClientCheckinPage } from "../pages/client/checkin";
import { ClientMessagesPage } from "../pages/client/messages";
import { ClientProfilePage } from "../pages/client/profile";
import { ClientHabitsPage } from "../pages/client/habits";
import { ClientBaselinePage } from "../pages/client/baseline";
import { ClientProgressPage } from "../pages/client/progress";
import { ClientNutritionDayPage } from "../pages/client/nutrition-day";
import { ClientOnboardingPage } from "../pages/client/onboarding";

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
      ) : !allow.includes(role as any) ? (
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
        <Route path="templates/workouts" element={<PtWorkoutTemplatesPage />} />
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
        <Route path="checkins/templates" element={<PtCheckinTemplatesPage />} />
        <Route path="messages" element={<PtMessagesPage />} />
        <Route path="settings" element={<PtSettingsPage />} />
        <Route path="settings/baseline" element={<PtBaselineTemplatesPage />} />
        <Route path="settings/exercises" element={<PtExerciseLibraryPage />} />
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
  );
}

import { Suspense, lazy, useEffect, useState } from "react";
import type { ComponentType } from "react";
import {
  Navigate,
  Route,
  Routes,
  useLocation,
  useParams,
} from "react-router-dom";
import { PtLayout } from "../components/layouts/pt-layout";
import { ClientLayout } from "../components/layouts/client-layout";

// ✅ assumes your AuthProvider exports this hook
import { useAuth } from "../lib/auth";
import { BootstrapGate } from "../components/common/bootstrap-gate";
import { supabase } from "../lib/supabase";
import { hasCompletedClientOnboarding } from "../lib/client-onboarding";

const lazyPage = <T extends Record<string, ComponentType<any>>>(
  loader: () => Promise<T>,
  exportName: keyof T,
) =>
  lazy(async () => ({
    default: (await loader())[exportName],
  }));

const LoginPage = lazyPage(() => import("../pages/public/login"), "LoginPage");
const NoWorkspacePage = lazyPage(
  () => import("../pages/public/no-workspace"),
  "NoWorkspacePage",
);
const InvitePage = lazyPage(
  () => import("../pages/public/invite"),
  "InvitePage",
);
const PtSignupPage = lazyPage(
  () => import("../pages/public/pt-signup"),
  "PtSignupPage",
);
const WelcomePage = lazyPage(
  () => import("../pages/public/welcome"),
  "WelcomePage",
);
const SignupRolePage = lazyPage(
  () => import("../pages/public/signup-role"),
  "SignupRolePage",
);
const PrivacyPage = lazyPage(
  () => import("../pages/public/privacy"),
  "PrivacyPage",
);
const TermsPage = lazyPage(() => import("../pages/public/terms"), "TermsPage");
const SupportPage = lazyPage(
  () => import("../pages/public/support"),
  "SupportPage",
);
const HealthPage = lazyPage(
  () => import("../pages/public/health"),
  "HealthPage",
);

const PtDashboardPage = lazyPage(
  () => import("../pages/pt/dashboard"),
  "PtDashboardPage",
);
const PtClientsPage = lazyPage(
  () => import("../pages/pt/clients"),
  "PtClientsPage",
);
const PtClientDetailPage = lazyPage(
  () => import("../pages/pt/client-detail"),
  "PtClientDetailPage",
);
const PtProgramsPage = lazyPage(
  () => import("../pages/pt/programs"),
  "PtProgramsPage",
);
const PtProgramBuilderPage = lazyPage(
  () => import("../pages/pt/program-builder"),
  "PtProgramBuilderPage",
);
const PtWorkoutTemplatesPage = lazyPage(
  () => import("../pages/pt/workout-templates"),
  "PtWorkoutTemplatesPage",
);
const PtWorkoutTemplateBuilderPage = lazyPage(
  () => import("../pages/pt/workout-template-builder"),
  "PtWorkoutTemplateBuilderPage",
);
const PtWorkoutTemplatePreviewPage = lazyPage(
  () => import("../pages/pt/workout-template-preview"),
  "PtWorkoutTemplatePreviewPage",
);
const PtCheckinsQueuePage = lazyPage(
  () => import("../pages/pt/checkins"),
  "PtCheckinsQueuePage",
);
const PtCheckinTemplatesPage = lazyPage(
  () => import("../pages/pt/checkin-templates"),
  "PtCheckinTemplatesPage",
);
const PtCalendarPage = lazyPage(
  () => import("../pages/pt/calendar"),
  "PtCalendarPage",
);
const PtMessagesPage = lazyPage(
  () => import("../pages/pt/messages"),
  "PtMessagesPage",
);
const PtSettingsPage = lazyPage(
  () => import("../pages/pt/settings"),
  "PtSettingsPage",
);
const PtBaselineTemplatesPage = lazyPage(
  () => import("../pages/pt/settings-baseline"),
  "PtBaselineTemplatesPage",
);
const PtExerciseLibraryPage = lazyPage(
  () => import("../pages/pt/settings-exercises"),
  "PtExerciseLibraryPage",
);
const PtNutritionPage = lazyPage(
  () => import("../pages/pt/nutrition"),
  "PtNutritionPage",
);
const PtNutritionTemplateBuilderPage = lazyPage(
  () => import("../pages/pt/nutrition-template-builder"),
  "PtNutritionTemplateBuilderPage",
);
const PtWorkspaceOnboardingPage = lazyPage(
  () => import("../pages/pt/onboarding-workspace"),
  "PtWorkspaceOnboardingPage",
);
const PtOpsStatusPage = lazyPage(
  () => import("../pages/pt/ops-status"),
  "PtOpsStatusPage",
);

const ClientHomePage = lazyPage(
  () => import("../pages/client/home"),
  "ClientHomePage",
);
const ClientWorkoutDetailPage = lazyPage(
  () => import("../pages/client/workout-detail"),
  "ClientWorkoutDetailPage",
);
const ClientWorkoutTodayPage = lazyPage(
  () => import("../pages/client/workout-today"),
  "ClientWorkoutTodayPage",
);
const ClientWorkoutRunPage = lazyPage(
  () => import("../pages/client/workout-run"),
  "ClientWorkoutRunPage",
);
const ClientWorkoutSummaryPage = lazyPage(
  () => import("../pages/client/workout-summary"),
  "ClientWorkoutSummaryPage",
);
const ClientCheckinPage = lazyPage(
  () => import("../pages/client/checkin"),
  "ClientCheckinPage",
);
const ClientMessagesPage = lazyPage(
  () => import("../pages/client/messages"),
  "ClientMessagesPage",
);
const ClientProfilePage = lazyPage(
  () => import("../pages/client/profile"),
  "ClientProfilePage",
);
const ClientHabitsPage = lazyPage(
  () => import("../pages/client/habits"),
  "ClientHabitsPage",
);
const ClientBaselinePage = lazyPage(
  () => import("../pages/client/baseline"),
  "ClientBaselinePage",
);
const ClientProgressPage = lazyPage(
  () => import("../pages/client/progress"),
  "ClientProgressPage",
);
const ClientNutritionDayPage = lazyPage(
  () => import("../pages/client/nutrition-day"),
  "ClientNutritionDayPage",
);
const ClientOnboardingPage = lazyPage(
  () => import("../pages/client/onboarding"),
  "ClientOnboardingPage",
);
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
          <Route path="settings" element={<PtSettingsPage />} />
          <Route
            path="settings/baseline"
            element={<PtBaselineTemplatesPage />}
          />
          <Route
            path="settings/exercises"
            element={<PtExerciseLibraryPage />}
          />
          <Route path="ops/status" element={<PtOpsStatusPage />} />
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
    </Suspense>
  );
}

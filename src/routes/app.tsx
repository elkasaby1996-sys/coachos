import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { PtLayout } from "../components/layouts/pt-layout";
import { ClientLayout } from "../components/layouts/client-layout";

import { LoginPage } from "../pages/public/login";
import { JoinPage } from "../pages/public/join";
import { NoWorkspacePage } from "../pages/public/no-workspace";

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
import { PtSettingsPage } from "../pages/pt/settings";
import { PtBaselineTemplatesPage } from "../pages/pt/settings-baseline";
import { PtExerciseLibraryPage } from "../pages/pt/settings-exercises";

import { ClientHomePage } from "../pages/client/home";
import { ClientWorkoutDetailPage } from "../pages/client/workout-detail";
import { ClientWorkoutTodayPage } from "../pages/client/workout-today";
import { ClientWorkoutRunPage } from "../pages/client/workout-run";
import { ClientWorkoutSummaryPage } from "../pages/client/workout-summary";
import { ClientProgressPage } from "../pages/client/progress";
import { ClientCheckinPage } from "../pages/client/checkin";
import { ClientMessagesPage } from "../pages/client/messages";
import { ClientProfilePage } from "../pages/client/profile";
import { ClientHabitsPage } from "../pages/client/habits";
import { ClientBaselinePage } from "../pages/client/baseline";

// ✅ assumes your AuthProvider exports this hook
import { useAuth } from "../lib/auth";
import { BootstrapGate } from "../components/common/bootstrap-gate";

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

  return (
    <BootstrapGate>
      {loading ? (
        <FullPageLoader />
      ) : !role || role === "none" ? (
        <Navigate to="/no-workspace" replace />
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

  if (!session) return <Navigate to="/login" replace />;

  if (role === "pt") return <Navigate to="/pt/dashboard" replace />;
  if (role === "client") return <Navigate to="/app/home" replace />;

  return <Navigate to="/no-workspace" replace />;
}

function LoginGate() {
  const { session, role, loading } = useAuth();
  const location = useLocation();
  const redirectParam = new URLSearchParams(location.search).get("redirect");
  const redirectTarget =
    redirectParam && redirectParam.startsWith("/join/") ? redirectParam : null;

  if (loading) return <FullPageLoader />;

  // If already logged in, don't allow staying on /login
  if (session) {
    if (redirectTarget) return <Navigate to={redirectTarget} replace />;
    if (role === "pt") return <Navigate to="/pt/dashboard" replace />;
    if (role === "client") return <Navigate to="/app/home" replace />;
    // Allow invite join flow to complete before enforcing workspace membership.
    return <Navigate to="/no-workspace" replace />;
  }

  return <LoginPage />;
}

export function App() {
  return (
    <Routes>
      {/* Smart landing */}
      <Route path="/" element={<IndexRedirect />} />

      {/* Public */}
      <Route path="/login" element={<LoginGate />} />
      <Route path="/join/:code" element={<JoinPage />} />

      <Route
        path="/no-workspace"
        element={
          <RequireAuth>
            <NoWorkspacePage />
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
        <Route path="templates/workouts/:id" element={<PtWorkoutTemplatePreviewPage />} />
        <Route path="templates/workouts/:id/edit" element={<PtWorkoutTemplateBuilderPage />} />
        <Route path="checkins" element={<PtCheckinsQueuePage />} />
        <Route path="checkins/templates" element={<PtCheckinTemplatesPage />} />
        <Route path="settings" element={<PtSettingsPage />} />
        <Route path="settings/baseline" element={<PtBaselineTemplatesPage />} />
        <Route path="settings/exercises" element={<PtExerciseLibraryPage />} />
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
        <Route path="home" element={<ClientHomePage />} />
        <Route path="workouts/today" element={<ClientWorkoutTodayPage />} />
        <Route path="workouts/:assignedWorkoutId" element={<ClientWorkoutDetailPage />} />
        <Route path="workout-run/:assignedWorkoutId" element={<ClientWorkoutRunPage />} />
        <Route path="workout-summary/:assignedWorkoutId" element={<ClientWorkoutSummaryPage />} />
        <Route path="progress" element={<ClientProgressPage />} />
        <Route path="checkin" element={<ClientCheckinPage />} />
        <Route path="messages" element={<ClientMessagesPage />} />
        <Route path="profile" element={<ClientProfilePage />} />
        <Route path="habits" element={<ClientHabitsPage />} />
        <Route path="baseline" element={<ClientBaselinePage />} />
      </Route>

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}

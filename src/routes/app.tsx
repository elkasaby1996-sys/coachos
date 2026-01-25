import { useEffect } from "react";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { PtLayout } from "../components/layouts/pt-layout";
import { ClientLayout } from "../components/layouts/client-layout";
import { LoginPage } from "../pages/Login";
import { JoinPage } from "../pages/public/join";
import { PtDashboardPage } from "../pages/pt/dashboard";
import { PtClientsPage } from "../pages/pt/clients";
import { PtClientDetailPage } from "../pages/pt/client-detail";
import { PtWorkoutTemplatesPage } from "../pages/pt/workout-templates";
import { PtWorkoutTemplateBuilderPage } from "../pages/pt/workout-template-builder";
import { PtCheckinTemplatesPage } from "../pages/pt/checkin-templates";
import { PtSettingsPage } from "../pages/pt/settings";
import { ClientHomePage } from "../pages/client/home";
import { ClientWorkoutDetailPage } from "../pages/client/workout-detail";
import { ClientProgressPage } from "../pages/client/progress";
import { ClientCheckinPage } from "../pages/client/checkin";
import { ClientMessagesPage } from "../pages/client/messages";
import { ClientProfilePage } from "../pages/client/profile";
import { NoWorkspacePage } from "../pages/public/no-workspace";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/auth";

function AuthListener() {
  const navigate = useNavigate();
  const location = useLocation();
  const { session } = useAuth();

  useEffect(() => {
    let mounted = true;

    const resolveRoleRedirect = async (userId: string) => {
      const { data: member, error: memberError } = await supabase
        .from("workspace_members")
        .select("id")
        .eq("user_id", userId)
        .maybeSingle();

      console.log("workspace_members lookup", { member, memberError });

      if (member) {
        navigate("/pt/dashboard", { replace: true });
        return;
      }

      const { data: client, error: clientError } = await supabase
        .from("clients")
        .select("id")
        .eq("user_id", userId)
        .maybeSingle();

      console.log("clients lookup", { client, clientError });

      if (client) {
        navigate("/app/home", { replace: true });
        return;
      }

      navigate("/login?message=No%20workspace%20found", { replace: true });
    };

    const handleSession = async () => {
      const { data } = await supabase.auth.getSession();
      if (!mounted) return;

      if (data.session?.user) {
        await resolveRoleRedirect(data.session.user.id);
        return;
      }

      if (location.pathname !== "/login" && !location.pathname.startsWith("/join")) {
        navigate("/login", { replace: true });
      }
    };

    handleSession();

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!nextSession?.user) {
        navigate("/login", { replace: true });
        return;
      }

      resolveRoleRedirect(nextSession.user.id);
    });

    return () => {
      mounted = false;
      authListener.subscription.unsubscribe();
    };
  }, [location.pathname, navigate]);

  useEffect(() => {
    if (!session?.user || location.pathname !== "/login") {
      return;
    }

    const redirectFromLogin = async () => {
      const { data: member } = await supabase
        .from("workspace_members")
        .select("id")
        .eq("user_id", session.user.id)
        .maybeSingle();

      if (member) {
        navigate("/pt/dashboard", { replace: true });
        return;
      }

      const { data: client } = await supabase
        .from("clients")
        .select("id")
        .eq("user_id", session.user.id)
        .maybeSingle();

      if (client) {
        navigate("/app/home", { replace: true });
        return;
      }

      navigate("/login?message=No%20workspace%20found", { replace: true });
    };

    redirectFromLogin();
  }, [session, location.pathname, navigate]);

  return null;
}

export function App() {
  return (
    <>
      <AuthListener />
      <Routes>
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/join/:code" element={<JoinPage />} />
        <Route path="/no-workspace" element={<NoWorkspacePage />} />

        <Route path="/pt" element={<PtLayout />}>
          <Route path="dashboard" element={<PtDashboardPage />} />
          <Route path="clients" element={<PtClientsPage />} />
          <Route path="clients/:clientId" element={<PtClientDetailPage />} />
          <Route path="templates/workouts" element={<PtWorkoutTemplatesPage />} />
          <Route path="templates/workouts/:id" element={<PtWorkoutTemplateBuilderPage />} />
          <Route path="checkins/templates" element={<PtCheckinTemplatesPage />} />
          <Route path="settings" element={<PtSettingsPage />} />
        </Route>

        <Route path="/app" element={<ClientLayout />}>
          <Route path="home" element={<ClientHomePage />} />
          <Route path="workouts/:assignedWorkoutId" element={<ClientWorkoutDetailPage />} />
          <Route path="progress" element={<ClientProgressPage />} />
          <Route path="checkin" element={<ClientCheckinPage />} />
          <Route path="messages" element={<ClientMessagesPage />} />
          <Route path="profile" element={<ClientProfilePage />} />
        </Route>

        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </>
  );
}

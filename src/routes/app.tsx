import { Navigate, Route, Routes } from "react-router-dom";
import { PtLayout } from "../components/layouts/pt-layout";
import { ClientLayout } from "../components/layouts/client-layout";
import { LoginPage } from "../pages/public/login";
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

export function App() {
  return (
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
  );
}

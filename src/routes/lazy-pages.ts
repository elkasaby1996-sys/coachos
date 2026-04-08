import { lazy } from "react";

export const PtLayout = lazy(() =>
  import("../components/layouts/pt-layout").then((m) => ({
    default: m.PtLayout,
  })),
);
export const PtHubLayout = lazy(() =>
  import("../components/layouts/pt-hub-layout").then((m) => ({
    default: m.PtHubLayout,
  })),
);
export const ClientLayout = lazy(() =>
  import("../components/layouts/client-layout").then((m) => ({
    default: m.ClientLayout,
  })),
);

export const LoginPage = lazy(() =>
  import("../pages/public/login").then((m) => ({ default: m.LoginPage })),
);
export const NoWorkspacePage = lazy(() =>
  import("../pages/public/no-workspace").then((m) => ({
    default: m.NoWorkspacePage,
  })),
);
export const InvitePage = lazy(() =>
  import("../pages/public/invite").then((m) => ({ default: m.InvitePage })),
);
export const PtSignupPage = lazy(() =>
  import("../pages/public/pt-signup").then((m) => ({
    default: m.PtSignupPage,
  })),
);
export const ClientSignupPage = lazy(() =>
  import("../pages/public/client-signup").then((m) => ({
    default: m.ClientSignupPage,
  })),
);
export const PublicCoachProfilePage = lazy(() =>
  import("../pages/public/coach-profile").then((m) => ({
    default: m.PublicCoachProfilePage,
  })),
);
export const SignupRolePage = lazy(() =>
  import("../pages/public/signup-role").then((m) => ({
    default: m.SignupRolePage,
  })),
);
export const PrivacyPage = lazy(() =>
  import("../pages/public/privacy").then((m) => ({ default: m.PrivacyPage })),
);
export const TermsPage = lazy(() =>
  import("../pages/public/terms").then((m) => ({ default: m.TermsPage })),
);
export const SupportPage = lazy(() =>
  import("../pages/public/support").then((m) => ({ default: m.SupportPage })),
);
export const HealthPage = lazy(() =>
  import("../pages/public/health").then((m) => ({ default: m.HealthPage })),
);

export const PtDashboardPage = lazy(() =>
  import("../pages/pt/dashboard").then((m) => ({ default: m.PtDashboardPage })),
);
export const PtClientsPage = lazy(() =>
  import("../pages/pt/clients").then((m) => ({ default: m.PtClientsPage })),
);
export const PtClientDetailPage = lazy(() =>
  import("../pages/pt/client-detail").then((m) => ({
    default: m.PtClientDetailPage,
  })),
);
export const PtProgramsPage = lazy(() =>
  import("../pages/pt/programs").then((m) => ({ default: m.PtProgramsPage })),
);
export const PtProgramBuilderPage = lazy(() =>
  import("../pages/pt/program-builder").then((m) => ({
    default: m.PtProgramBuilderPage,
  })),
);
export const PtWorkoutTemplatesPage = lazy(() =>
  import("../pages/pt/workout-templates").then((m) => ({
    default: m.PtWorkoutTemplatesPage,
  })),
);
export const PtWorkoutTemplateBuilderPage = lazy(() =>
  import("../pages/pt/workout-template-builder").then((m) => ({
    default: m.PtWorkoutTemplateBuilderPage,
  })),
);
export const PtWorkoutTemplatePreviewPage = lazy(() =>
  import("../pages/pt/workout-template-preview").then((m) => ({
    default: m.PtWorkoutTemplatePreviewPage,
  })),
);
export const PtCheckinsQueuePage = lazy(() =>
  import("../pages/pt/checkins").then((m) => ({
    default: m.PtCheckinsQueuePage,
  })),
);
export const PtCheckinTemplatesPage = lazy(() =>
  import("../pages/pt/checkin-templates").then((m) => ({
    default: m.PtCheckinTemplatesPage,
  })),
);
export const PtCalendarPage = lazy(() =>
  import("../pages/pt/calendar").then((m) => ({ default: m.PtCalendarPage })),
);
export const PtMessagesPage = lazy(() =>
  import("../pages/pt/messages").then((m) => ({ default: m.PtMessagesPage })),
);
export const PtBaselineTemplatesPage = lazy(() =>
  import("../pages/pt/settings-baseline").then((m) => ({
    default: m.PtBaselineTemplatesPage,
  })),
);
export const PtExerciseLibraryPage = lazy(() =>
  import("../pages/pt/settings-exercises").then((m) => ({
    default: m.PtExerciseLibraryPage,
  })),
);
export const PtNutritionPage = lazy(() =>
  import("../pages/pt/nutrition").then((m) => ({ default: m.PtNutritionPage })),
);
export const PtNutritionTemplateBuilderPage = lazy(() =>
  import("../pages/pt/nutrition-template-builder").then((m) => ({
    default: m.PtNutritionTemplateBuilderPage,
  })),
);
export const PtWorkspaceOnboardingPage = lazy(() =>
  import("../pages/pt/onboarding-workspace").then((m) => ({
    default: m.PtWorkspaceOnboardingPage,
  })),
);
export const PtOpsStatusPage = lazy(() =>
  import("../pages/pt/ops-status").then((m) => ({
    default: m.PtOpsStatusPage,
  })),
);
export const PtHubOverviewPage = lazy(() =>
  import("../pages/pt-hub/overview").then((m) => ({
    default: m.PtHubOverviewPage,
  })),
);
export const PtHubProfilePage = lazy(() =>
  import("../pages/pt-hub/profile").then((m) => ({
    default: m.PtHubProfilePage,
  })),
);
export const PtHubProfilePreviewPage = lazy(() =>
  import("../pages/pt-hub/profile-preview").then((m) => ({
    default: m.PtHubProfilePreviewPage,
  })),
);
export const PtHubWorkspacesPage = lazy(() =>
  import("../pages/pt-hub/workspaces").then((m) => ({
    default: m.PtHubWorkspacesPage,
  })),
);
export const PtHubLeadsPage = lazy(() =>
  import("../pages/pt-hub/leads").then((m) => ({
    default: m.PtHubLeadsPage,
  })),
);
export const PtHubLeadDetailPage = lazy(() =>
  import("../pages/pt-hub/lead-detail").then((m) => ({
    default: m.PtHubLeadDetailPage,
  })),
);
export const PtHubClientsPage = lazy(() =>
  import("../pages/pt-hub/clients").then((m) => ({
    default: m.PtHubClientsPage,
  })),
);
export const PtHubPaymentsPage = lazy(() =>
  import("../pages/pt-hub/payments").then((m) => ({
    default: m.PtHubPaymentsPage,
  })),
);
export const PtHubAnalyticsPage = lazy(() =>
  import("../pages/pt-hub/analytics").then((m) => ({
    default: m.PtHubAnalyticsPage,
  })),
);
export const PtHubSettingsPage = lazy(() =>
  import("../pages/pt-hub/settings").then((m) => ({
    default: m.PtHubSettingsPage,
  })),
);

export const SettingsLayout = lazy(() =>
  import("../pages/settings/SettingsLayout").then((m) => ({
    default: m.SettingsLayout,
  })),
);
export const WorkspaceSettings = lazy(() =>
  import("../pages/settings/sections/WorkspaceSettings").then((m) => ({
    default: m.WorkspaceSettings,
  })),
);
export const PublicProfileSettings = lazy(() =>
  import("../pages/settings/sections/PublicProfileSettings").then((m) => ({
    default: m.PublicProfileSettings,
  })),
);
export const AccountSettings = lazy(() =>
  import("../pages/settings/sections/AccountSettings").then((m) => ({
    default: m.AccountSettings,
  })),
);
export const BillingSettings = lazy(() =>
  import("../pages/settings/sections/BillingSettings").then((m) => ({
    default: m.BillingSettings,
  })),
);
export const AppearanceSettings = lazy(() =>
  import("../pages/settings/sections/AppearanceSettings").then((m) => ({
    default: m.AppearanceSettings,
  })),
);
export const DefaultsSettings = lazy(() =>
  import("../pages/settings/sections/DefaultsSettings").then((m) => ({
    default: m.DefaultsSettings,
  })),
);
export const DangerZoneSettings = lazy(() =>
  import("../pages/settings/sections/DangerZoneSettings").then((m) => ({
    default: m.DangerZoneSettings,
  })),
);

export const NotificationsPage = lazy(() =>
  import("../features/notifications/pages/notifications-page").then((m) => ({
    default: m.NotificationsPage,
  })),
);

export const ClientHomePage = lazy(() =>
  import("../pages/client/home").then((m) => ({ default: m.ClientHomePage })),
);
export const ClientAccountOnboardingPage = lazy(() =>
  import("../pages/client/client-account-onboarding").then((m) => ({
    default: m.ClientAccountOnboardingPage,
  })),
);
export const ClientWorkoutDetailPage = lazy(() =>
  import("../pages/client/workout-detail").then((m) => ({
    default: m.ClientWorkoutDetailPage,
  })),
);
export const ClientWorkoutTodayPage = lazy(() =>
  import("../pages/client/workout-today").then((m) => ({
    default: m.ClientWorkoutTodayPage,
  })),
);
export const ClientWorkoutRunPage = lazy(() =>
  import("../pages/client/workout-run").then((m) => ({
    default: m.ClientWorkoutRunPage,
  })),
);
export const ClientWorkoutSummaryPage = lazy(() =>
  import("../pages/client/workout-summary").then((m) => ({
    default: m.ClientWorkoutSummaryPage,
  })),
);
export const ClientCheckinPage = lazy(() =>
  import("../pages/client/checkin").then((m) => ({
    default: m.ClientCheckinPage,
  })),
);
export const ClientMessagesPage = lazy(() =>
  import("../pages/client/messages").then((m) => ({
    default: m.ClientMessagesPage,
  })),
);
export const ClientProfilePage = lazy(() =>
  import("../pages/client/profile").then((m) => ({
    default: m.ClientProfilePage,
  })),
);
export const ClientHabitsPage = lazy(() =>
  import("../pages/client/habits").then((m) => ({
    default: m.ClientHabitsPage,
  })),
);
export const ClientBaselinePage = lazy(() =>
  import("../pages/client/baseline").then((m) => ({
    default: m.ClientBaselinePage,
  })),
);
export const ClientProgressPage = lazy(() =>
  import("../pages/client/progress").then((m) => ({
    default: m.ClientProgressPage,
  })),
);
export const ClientMedicalPage = lazy(() =>
  import("../pages/client/medical").then((m) => ({
    default: m.ClientMedicalPage,
  })),
);
export const ClientNutritionDayPage = lazy(() =>
  import("../pages/client/nutrition-day").then((m) => ({
    default: m.ClientNutritionDayPage,
  })),
);
export const ClientOnboardingPage = lazy(() =>
  import("../pages/client/onboarding").then((m) => ({
    default: m.ClientOnboardingPage,
  })),
);

import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  CalendarDays,
  CircleDot,
  Home,
  LineChart,
  LogOut,
  MessageCircle,
  PanelTop,
  UserCircle,
} from "lucide-react";
import { useMemo, useState } from "react";
import { NotificationBell } from "../../features/notifications/components/notification-bell";
import { cn } from "../../lib/utils";
import { ThemeToggle } from "../common/theme-toggle";
import { PageContainer } from "../common/page-container";
import { Button } from "../ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { StatusBanner } from "../client/portal";
import { useWorkspace } from "../../lib/use-workspace";
import { useAuth } from "../../lib/auth";
import { supabase } from "../../lib/supabase";
import { LoadingScreen } from "../common/bootstrap-gate";
import { useClientOnboarding } from "../../features/client-onboarding/hooks/use-client-onboarding";
import { ClientOnboardingSoftGate } from "../../features/client-onboarding/components/client-onboarding-soft-gate";

const navItems = [
  { label: "Home", to: "/app/home", icon: Home },
  { label: "Habits", to: "/app/habits", icon: CalendarDays },
  { label: "Progress", to: "/app/progress", icon: LineChart },
  { label: "Messages", to: "/app/messages", icon: MessageCircle },
  { label: "Settings", to: "/app/settings", icon: UserCircle },
];

const getRouteLabel = (pathname: string) => {
  if (pathname.startsWith("/app/home")) return "Home";
  if (pathname.startsWith("/app/habits")) return "Habits";
  if (pathname.startsWith("/app/progress")) return "Progress";
  if (pathname.startsWith("/app/messages")) return "Messages";
  if (pathname.startsWith("/app/notifications")) return "Notifications";
  if (pathname.startsWith("/app/profile")) return "Profile";
  if (pathname.startsWith("/app/settings")) return "Settings";
  if (pathname.startsWith("/app/checkin")) return "Monthly check-in";
  if (pathname.startsWith("/app/baseline")) return "Baseline";
  if (pathname.startsWith("/app/workout-today")) return "Workout today";
  if (pathname.startsWith("/app/workout-run")) return "Workout session";
  if (pathname.startsWith("/app/workouts/")) return "Workout details";
  if (pathname.startsWith("/app/onboarding")) return "Onboarding";
  return "Client workspace";
};

const shouldShowOnboardingBanner = (pathname: string) => {
  return (
    pathname.startsWith("/app/home") ||
    pathname.startsWith("/app/profile") ||
    pathname.startsWith("/app/settings")
  );
};

export function ClientLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { workspaceId, loading, error } = useWorkspace();
  const { authError } = useAuth();
  const onboardingQuery = useClientOnboarding();
  const onboardingSummary = onboardingQuery.data ?? null;
  const basicsGateRequired = Boolean(
    onboardingSummary &&
    onboardingSummary.canEdit &&
    !onboardingSummary.progress.basics.complete,
  );
  const isOnboardingRoute = location.pathname.startsWith("/app/onboarding");
  const routeLabel = useMemo(
    () => getRouteLabel(location.pathname),
    [location.pathname],
  );
  const [isOnboardingBannerDismissed, setIsOnboardingBannerDismissed] =
    useState(() => {
      if (typeof window === "undefined") return false;
      return window.sessionStorage.getItem(
        "coachos-client-onboarding-banner-dismissed",
      ) === "1";
    });
  const [isSigningOut, setIsSigningOut] = useState(false);
  const errorMessage =
    error?.message ??
    authError?.message ??
    (workspaceId ? null : "Workspace not found.");
  const shouldRenderOnboardingBanner =
    Boolean(
      onboardingSummary &&
        onboardingSummary.onboarding.status !== "completed" &&
        !isOnboardingRoute &&
        shouldShowOnboardingBanner(location.pathname) &&
        !isOnboardingBannerDismissed,
    );
  const topStatusText = onboardingSummary
    ? onboardingSummary.onboarding.status === "completed"
      ? "Workspace setup complete"
      : onboardingSummary.awaitingReview
        ? "Onboarding with coach"
        : `${onboardingSummary.completionPercent}% onboarding complete`
    : "Private coaching workspace";

  if (loading) {
    return <LoadingScreen message="Loading..." />;
  }

  if (errorMessage) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Workspace error</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>{errorMessage}</p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => window.location.reload()}>
                Retry
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={async () => {
                  await supabase.auth.signOut();
                  window.location.reload();
                }}
              >
                Sign out
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const handleSignOut = async () => {
    if (isSigningOut) return;
    setIsSigningOut(true);
    try {
      await supabase.auth.signOut();
      navigate("/login", { replace: true });
    } finally {
      setIsSigningOut(false);
    }
  };

  return (
    <div className="min-h-screen bg-background [background:var(--portal-page-bg)]">
      <div className="flex min-h-screen w-full">
        <aside className="hidden w-64 flex-col border-r border-border/70 bg-card/80 px-4 py-6 backdrop-blur-xl md:flex">
          <div className="mb-8 flex items-center justify-between">
            <span className="text-lg font-semibold tracking-tight">
              CoachOS
            </span>
          </div>
          <nav className="flex flex-1 flex-col gap-2">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-muted",
                    isActive && "bg-muted text-foreground",
                  )
                }
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </NavLink>
            ))}
          </nav>
          <Button
            variant="secondary"
            size="sm"
            className="mt-4 w-full justify-start gap-2"
            onClick={handleSignOut}
            disabled={isSigningOut}
          >
            <LogOut className="h-4 w-4" />
            {isSigningOut ? "Logging out..." : "Log out"}
          </Button>
        </aside>
        <div className="flex flex-1 min-w-0 flex-col">
          <header className="border-b border-border/60 bg-background/60 py-3.5 backdrop-blur-xl">
            <PageContainer
              size="portal"
              className="flex items-center justify-between gap-3"
            >
              <div className="min-w-0 space-y-1">
                <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <PanelTop className="h-4 w-4 text-primary" />
                  <span>CoachOS client workspace</span>
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                  <span>{routeLabel}</span>
                  <span className="hidden text-border sm:inline">•</span>
                  <span className="inline-flex items-center gap-1.5">
                    <CircleDot className="h-3.5 w-3.5 text-primary" />
                    {topStatusText}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <NotificationBell viewAllHref="/app/notifications" />
                <ThemeToggle />
              </div>
            </PageContainer>
          </header>
          <main className="min-w-0 flex-1 py-8">
            <PageContainer size="portal">
              {shouldRenderOnboardingBanner && onboardingSummary ? (
                <div className="mb-6">
                  <ClientOnboardingSoftGate
                    summary={onboardingSummary}
                    compact
                    onDismiss={() => {
                      setIsOnboardingBannerDismissed(true);
                      if (typeof window !== "undefined") {
                        window.sessionStorage.setItem(
                          "coachos-client-onboarding-banner-dismissed",
                          "1",
                        );
                      }
                    }}
                  />
                </div>
              ) : null}
              {basicsGateRequired && !isOnboardingRoute ? (
                <div className="mx-auto max-w-3xl">
                  <StatusBanner
                    variant="warning"
                    title="Complete your basics first"
                    description="Before we open the workspace, we need your basic personal details so your coach knows who they are working with."
                    actions={
                      <>
                        <Button
                          onClick={() =>
                            navigate("/app/onboarding?step=basics", {
                              replace: true,
                            })
                          }
                        >
                          Continue basics
                        </Button>
                        <Button
                          variant="secondary"
                          onClick={handleSignOut}
                          disabled={isSigningOut}
                        >
                          {isSigningOut ? "Logging out..." : "Log out"}
                        </Button>
                      </>
                    }
                  />
                </div>
              ) : (
                <Outlet />
              )}
            </PageContainer>
          </main>
          <nav className="fixed bottom-0 left-0 right-0 border-t border-border/60 bg-card/92 py-2 backdrop-blur-xl md:hidden">
            <PageContainer
              size="portal"
              className="flex items-center justify-between"
            >
              {navItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    cn(
                      "flex flex-col items-center gap-1 text-xs text-muted-foreground",
                      isActive && "text-foreground",
                    )
                  }
                >
                  <item.icon className="h-5 w-5" />
                  {item.label}
                </NavLink>
              ))}
              <button
                type="button"
                className="flex flex-col items-center gap-1 text-xs text-muted-foreground"
                onClick={handleSignOut}
                disabled={isSigningOut}
              >
                <LogOut className="h-5 w-5" />
                {isSigningOut ? "..." : "Logout"}
              </button>
            </PageContainer>
          </nav>
        </div>
      </div>
    </div>
  );
}

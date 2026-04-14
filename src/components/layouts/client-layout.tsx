import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  ClipboardCheck,
  CalendarDays,
  ChevronDown,
  CircleDot,
  Compass,
  Dumbbell,
  Home,
  LogOut,
  MessageCircle,
  Moon,
  Settings,
  UtensilsCrossed,
  UserCircle,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { NotificationBell } from "../../features/notifications/components/notification-bell";
import { cn } from "../../lib/utils";
import { AppShellBackgroundLayer } from "../common/app-shell-background";
import { AppFooter } from "../common/app-footer";
import { RouteTransition } from "../common/route-transition";
import { ThemeModeSwitch } from "../common/theme-mode-switch";
import { useTheme } from "../common/theme-provider";
import { PageContainer } from "../common/page-container";
import { Button } from "../ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { StatusBanner } from "../client/portal";
import { useWorkspace } from "../../lib/use-workspace";
import { useBootstrapAuth } from "../../lib/auth";
import { supabase } from "../../lib/supabase";
import { LoadingScreen } from "../common/bootstrap-gate";
import { useClientOnboarding } from "../../features/client-onboarding/hooks/use-client-onboarding";
import { ClientOnboardingSoftGate } from "../../features/client-onboarding/components/client-onboarding-soft-gate";
import {
  getModuleToneClasses,
  getModuleToneForPath,
  getModuleToneStyle,
  type ModuleTone,
} from "../../lib/module-tone";
import { WorkspaceHeaderModeProvider } from "../pt/workspace-header-mode";

const navItems = [
  {
    label: "Home",
    to: "/app/home",
    icon: Home,
    module: "overview" as ModuleTone,
  },
  {
    label: "Workouts",
    to: "/app/workouts",
    icon: Dumbbell,
    module: "checkins" as ModuleTone,
  },
  {
    label: "Nutrition",
    to: "/app/nutrition",
    icon: UtensilsCrossed,
    module: "checkins" as ModuleTone,
  },
  {
    label: "Habits",
    to: "/app/habits",
    icon: CalendarDays,
    module: "checkins" as ModuleTone,
  },
  {
    label: "Check-ins",
    to: "/app/checkins",
    icon: ClipboardCheck,
    module: "checkins" as ModuleTone,
  },
  {
    label: "Messages",
    to: "/app/messages",
    icon: MessageCircle,
    module: "coaching" as ModuleTone,
  },
  {
    label: "Find a Coach",
    to: "/app/find-coach",
    icon: Compass,
    module: "leads" as ModuleTone,
  },
  {
    label: "Settings",
    to: "/app/settings",
    icon: Settings,
    module: "settings" as ModuleTone,
  },
];

const getRouteLabel = (pathname: string) => {
  if (pathname.startsWith("/app/home")) return "Home";
  if (pathname.startsWith("/app/workouts")) return "Workouts";
  if (pathname.startsWith("/app/workout")) return "Workouts";
  if (pathname.startsWith("/app/nutrition")) return "Nutrition";
  if (pathname.startsWith("/app/habits")) return "Habits";
  if (pathname.startsWith("/app/messages")) return "Messages";
  if (pathname.startsWith("/app/find-coach")) return "Find a Coach";
  if (pathname.startsWith("/app/notifications")) return "Notifications";
  if (pathname.startsWith("/app/settings")) return "Settings";
  if (pathname.startsWith("/app/profile")) return "Profile";
  if (pathname.startsWith("/app/checkins")) return "Check-ins";
  if (pathname.startsWith("/app/checkin")) return "Check-ins";
  if (pathname.startsWith("/app/baseline")) return "Baseline";
  if (pathname.startsWith("/app/workout-today")) return "Workout today";
  if (pathname.startsWith("/app/workout-run")) return "Workout session";
  if (pathname.startsWith("/app/workouts/")) return "Workout details";
  if (pathname.startsWith("/app/onboarding")) return "Onboarding";
  return "RepsyncME";
};

const shouldShowOnboardingBanner = (pathname: string) => {
  return (
    pathname.startsWith("/app/home") ||
    pathname.startsWith("/app/settings") ||
    pathname.startsWith("/app/profile")
  );
};

function getHeaderProfilePillClassName(isLightMode: boolean) {
  return cn(
    "group hidden h-[54px] min-w-[204px] items-center gap-2.5 rounded-[18px] border px-3 py-2 text-left backdrop-blur-3xl transition-all duration-200 hover:-translate-y-[1px] sm:w-[214px] md:flex",
    isLightMode
      ? "border-[oklch(var(--border-default)/0.7)] bg-[linear-gradient(180deg,oklch(var(--bg-surface-elevated)/0.8),oklch(var(--bg-surface)/0.68))] shadow-[0_22px_48px_-34px_oklch(0.28_0.02_190/0.16),inset_0_1px_0_oklch(1_0_0/0.34)] hover:border-primary/18 hover:bg-[linear-gradient(180deg,oklch(var(--bg-surface-elevated)/0.88),oklch(var(--bg-surface)/0.74))]"
      : "border-white/10 bg-[linear-gradient(180deg,rgba(18,24,22,0.8),rgba(10,14,13,0.72))] shadow-[0_22px_46px_-34px_rgba(0,0,0,0.82),inset_0_1px_0_rgba(255,255,255,0.06)] hover:border-primary/18 hover:bg-[linear-gradient(180deg,rgba(22,29,26,0.88),rgba(12,17,15,0.78))]",
  );
}

function getHeaderProfilePillIconClassName(isLightMode: boolean) {
  return cn(
    "flex h-8 w-8 shrink-0 items-center justify-center text-foreground transition-colors duration-200",
    isLightMode
      ? "text-primary group-hover:text-[oklch(var(--text-primary))]"
      : "text-primary group-hover:text-foreground",
  );
}

function getHeaderProfilePillChevronClassName(isLightMode: boolean) {
  return cn(
    "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition-all duration-200",
    isLightMode
      ? "border-[oklch(var(--border-default)/0.62)] bg-[oklch(var(--bg-surface-elevated)/0.62)] text-primary group-hover:border-primary/16 group-hover:text-[oklch(var(--text-primary))]"
      : "border-white/8 bg-white/[0.04] text-muted-foreground group-hover:border-primary/18 group-hover:text-primary",
  );
}

export function ClientLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { loading, error } = useWorkspace();
  const { bootstrapError: authError, hasWorkspaceMembership, clientProfile } =
    useBootstrapAuth();
  const { resolvedTheme, toggleTheme } = useTheme();
  const onboardingQuery = useClientOnboarding();
  const onboardingSummary = onboardingQuery.data ?? null;
  const preWorkspaceMode = !hasWorkspaceMembership;
  const basicsGateRequired = !preWorkspaceMode && Boolean(
    onboardingSummary &&
    onboardingSummary.canEdit &&
    !onboardingSummary.progress.basics.complete,
  );
  const isOnboardingRoute = location.pathname.startsWith("/app/onboarding");
  const currentModule = getModuleToneForPath(location.pathname);
  const currentModuleClasses = getModuleToneClasses(currentModule);
  const routeLabel = useMemo(
    () => getRouteLabel(location.pathname),
    [location.pathname],
  );
  const [isOnboardingBannerDismissed, setIsOnboardingBannerDismissed] =
    useState(() => {
      if (typeof window === "undefined") return false;
      return (
        window.sessionStorage.getItem(
          "coachos-client-onboarding-banner-dismissed",
        ) === "1"
      );
    });
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [footerHeight, setFooterHeight] = useState(0);
  const footerHostRef = useRef<HTMLDivElement | null>(null);
  const errorMessage = error?.message ?? authError?.message ?? null;
  const shouldRenderOnboardingBanner = Boolean(
    onboardingSummary &&
    onboardingSummary.onboarding.status !== "completed" &&
    !isOnboardingRoute &&
    shouldShowOnboardingBanner(location.pathname) &&
    !isOnboardingBannerDismissed,
  );
  const topStatusText = onboardingSummary
    ? preWorkspaceMode
      ? "Lead dashboard active"
      : onboardingSummary.onboarding.status === "completed"
      ? "Workspace setup complete"
      : onboardingSummary.awaitingReview
        ? "Onboarding with coach"
        : `${onboardingSummary.completionPercent}% onboarding complete`
    : preWorkspaceMode
      ? "Lead dashboard active"
      : "Private coaching workspace";
  const shouldShowTopStatusText = Boolean(
    onboardingSummary
      ? onboardingSummary.onboarding.status !== "completed"
      : false,
  );
  const profileDisplayName =
    clientProfile?.full_name?.trim() ||
    clientProfile?.display_name?.trim() ||
    "Client profile";
  const profileInitial = (profileDisplayName.charAt(0) || "C").toUpperCase();
  const isLightMode = resolvedTheme === "light";
  const reduceMotion = useReducedMotion();
  const visibleNavItems = useMemo(
    () =>
      preWorkspaceMode
        ? navItems.filter((item) => item.to === "/app/home")
        : navItems,
    [preWorkspaceMode],
  );

  useEffect(() => {
    if (!loading && preWorkspaceMode && location.pathname !== "/app/home") {
      navigate("/app/home", { replace: true });
    }
  }, [loading, location.pathname, navigate, preWorkspaceMode]);

  if (loading) {
    return <LoadingScreen message="Loading..." />;
  }

  if (errorMessage && !preWorkspaceMode) {
    return (
      <div
        className="theme-shell-canvas relative isolate min-h-screen overflow-hidden [background:var(--portal-page-bg)]"
        style={getModuleToneStyle(currentModule)}
      >
        <AppShellBackgroundLayer />
        <div className="relative z-10 flex min-h-screen items-center justify-center px-4">
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle>Client app error</CardTitle>
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
    <div
      className="theme-shell-canvas relative isolate min-h-screen overflow-hidden [background:var(--portal-page-bg)]"
      style={getModuleToneStyle(currentModule)}
    >
      <AppShellBackgroundLayer />
      <div className="relative z-10 flex min-h-screen w-full">
        <aside
          className="hidden w-28 p-1 md:fixed md:left-0 md:top-0 md:z-30 md:flex md:w-[248px] md:p-2"
          style={{ bottom: footerHeight > 0 ? `${footerHeight}px` : undefined }}
        >
          <div className="surface-panel-strong flex h-full min-h-0 flex-col overflow-hidden rounded-[34px] border-border/70 px-3 py-5 backdrop-blur-xl md:px-4">
            <div className="mb-6 flex items-center justify-between">
              <div className="hidden md:block">
                <span className="text-lg font-semibold tracking-tight text-foreground">
                  RepsyncME
                </span>
              </div>
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-[18px] border border-border/70 bg-[linear-gradient(180deg,oklch(var(--bg-surface-elevated)/0.74),oklch(var(--bg-surface)/0.52))] text-sm font-semibold text-foreground shadow-[inset_0_1px_0_oklch(1_0_0/0.05)] md:hidden">
                RM
              </span>
            </div>
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-[18px] border border-border/70 bg-[linear-gradient(180deg,oklch(var(--bg-surface-elevated)/0.74),oklch(var(--bg-surface)/0.52))] text-sm font-semibold text-foreground shadow-[inset_0_1px_0_oklch(1_0_0/0.05)] xl:hidden">
              C
            </span>
          </div>
          <nav className="flex flex-1 flex-col gap-2">
            {visibleNavItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                aria-label={item.label}
                title={item.label}
                className={({ isActive }) =>
                  cn(
                    "group relative overflow-hidden flex items-center justify-center gap-2 rounded-[20px] border border-transparent px-3 py-3 text-sm font-medium text-muted-foreground transition hover:border-border/60 hover:bg-card/42 hover:text-foreground xl:justify-start",
                    isActive && "text-foreground",
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    {isActive ? (
                      <motion.span
                        layoutId={
                          reduceMotion ? undefined : "client-nav-active-pill"
                        }
                        className={cn(
                          "relative z-10 flex h-9 w-9 items-center justify-center transition-colors",
                          isActive
                            ? "section-accent-nav-icon-active"
                            : "text-muted-foreground group-hover:text-foreground",
                          getModuleToneClasses(item.module).navIcon,
                        )}
                      >
                        <item.icon className="h-4 w-4" />
                      </span>
                      <motion.span
                        className="relative z-10 hidden md:inline"
                        animate={
                          reduceMotion
                            ? undefined
                            : {
                                x: isActive ? 4 : 0,
                                opacity: isActive ? 1 : 0.82,
                              }
                        }
                        transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                      >
                        {item.label}
                      </motion.span>
                    </>
                  )}
                </NavLink>
              ))}
            </nav>
          </div>
        </aside>
        <div className="flex min-w-0 flex-1 flex-col md:ml-[248px]">
          <header className="pt-4 sm:pt-5 lg:pt-6">
            <PageContainer
              size="client-shell"
              align="left"
              className="flex flex-wrap items-center justify-between gap-3"
            >
              <div
                className={cn(
                  "surface-panel-strong relative w-full overflow-hidden rounded-[34px] border-border/70 px-4 py-4 sm:px-5 lg:px-6",
                  isLightMode
                    ? "shadow-[0_28px_76px_-56px_oklch(0.28_0.02_190/0.14)]"
                    : "shadow-[0_32px_90px_-58px_rgba(0,0,0,0.98)]",
                )}
              >
                <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,oklch(var(--accent)/0.16),transparent_34%),radial-gradient(circle_at_bottom_left,oklch(var(--chart-3)/0.12),transparent_30%),linear-gradient(135deg,transparent,oklch(var(--chart-2)/0.06))]" />
                <div
                  className={cn(
                    "pointer-events-none absolute inset-x-6 top-0 h-px",
                    isLightMode
                      ? "bg-[linear-gradient(90deg,transparent,oklch(var(--border-strong)/0.32),transparent)]"
                      : "bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.24),transparent)]",
                  )}
                />
                <div className="relative space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0 space-y-2">
                      <p
                        className={cn(
                          "inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.24em]",
                          currentModuleClasses.text,
                        )}
                      >
                        <span
                          aria-hidden
                          className={cn(
                            "h-1.5 w-1.5 rounded-full",
                            currentModuleClasses.dot,
                          )}
                        />
                        RepsyncME
                      </p>
                      <p
                        className={cn(
                          "truncate text-[2rem] font-semibold uppercase tracking-[0.06em] text-foreground sm:text-[2.25rem]",
                          currentModuleClasses.title,
                        )}
                      >
                        {routeLabel}
                      </p>
                      {shouldShowTopStatusText ? (
                        <p className="max-w-2xl text-sm leading-5 text-muted-foreground">
                          <span className="inline-flex items-center gap-2">
                            <CircleDot
                              className={cn("h-3.5 w-3.5", currentModuleClasses.title)}
                            />
                            {topStatusText}
                          </span>
                        </p>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-2 self-start sm:self-auto">
                      <NotificationBell viewAllHref="/app/notifications" />
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            type="button"
                            className={getHeaderProfilePillClassName(isLightMode)}
                            aria-label="Profile menu"
                          >
                            <div className={getHeaderProfilePillIconClassName(isLightMode)}>
                              {profileInitial}
                            </div>
                            <div className="min-w-0 flex-1 space-y-0.5 text-left">
                              <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-primary/80">
                                Profile
                              </p>
                              <p className="max-w-[138px] truncate text-[0.92rem] font-medium text-foreground">
                                {profileDisplayName}
                              </p>
                            </div>
                            <span className={getHeaderProfilePillChevronClassName(isLightMode)}>
                              <ChevronDown className="h-3.5 w-3.5 [stroke-width:1.8]" />
                            </span>
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent
                          variant="menu"
                          align="end"
                          sideOffset={10}
                          className="w-56"
                        >
                          <DropdownMenuLabel>Profile</DropdownMenuLabel>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => navigate("/app/settings?tab=profile")}
                          >
                            <span className="app-dropdown-icon-badge">
                              <UserCircle className="h-4 w-4 [stroke-width:1.7]" />
                            </span>
                            Profile
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => navigate("/app/settings?tab=preferences")}
                          >
                            <span className="app-dropdown-icon-badge">
                              <Settings className="h-4 w-4 [stroke-width:1.7]" />
                            </span>
                            Preferences
                          </DropdownMenuItem>
                          <div className="app-dropdown-utility-row">
                            <div className="flex min-w-0 items-center gap-3">
                              <span className="app-dropdown-icon-badge">
                                <Moon className="h-4 w-4 [stroke-width:1.7]" />
                              </span>
                              <span className="text-sm font-medium text-foreground">
                                Theme
                              </span>
                            </div>
                            <span className="shrink-0">
                              <ThemeModeSwitch
                                mode={resolvedTheme}
                                onToggle={toggleTheme}
                              />
                            </span>
                          </div>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            disabled={isSigningOut}
                            onClick={() => {
                              void handleSignOut();
                            }}
                          >
                            <span className="app-dropdown-icon-badge">
                              <LogOut className="h-4 w-4 [stroke-width:1.7]" />
                            </span>
                            {isSigningOut ? "Signing out..." : "Sign out"}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                      <Button
                        variant="secondary"
                        size="icon"
                        className="rounded-full border border-border/70 bg-card/72 md:hidden"
                        onClick={handleSignOut}
                        disabled={isSigningOut}
                        aria-label="Log out"
                        title="Log out"
                      >
                        <LogOut className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </PageContainer>
          </header>
          <main className="min-w-0 flex-1 py-4 sm:py-5 lg:py-6">
            <PageContainer size="client-shell" align="left">
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
                <WorkspaceHeaderModeProvider value="shell">
                  <RouteTransition>
                    <Outlet />
                  </RouteTransition>
                </WorkspaceHeaderModeProvider>
              )}
            </PageContainer>
          </main>
          <div ref={footerHostRef}>
            <AppFooter className="z-40 md:relative md:-ml-[248px] md:w-[calc(100%+248px)]" />
          </div>
          <nav className="fixed bottom-0 left-0 right-0 border-t border-border/60 [background-color:var(--sticky-bar-bg)] py-2 backdrop-blur-xl md:hidden">
            <PageContainer size="portal" className="grid grid-cols-6 gap-1">
              {visibleNavItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  aria-label={item.label}
                  className={({ isActive }) =>
                    cn(
                      "flex min-h-[3.5rem] flex-col items-center justify-center gap-1 rounded-[20px] border border-transparent px-1 text-center text-[11px] font-medium text-muted-foreground transition",
                      isActive &&
                        "border-border/70 bg-card/82 text-foreground shadow-[0_16px_36px_-30px_oklch(0_0_0/0.72)]",
                    )
                  }
                >
                  {({ isActive }) => (
                    <>
                      <item.icon
                        className={cn(
                          "h-5 w-5",
                          isActive ? "text-primary" : "text-current",
                        )}
                      />
                      {item.label}
                    </>
                  )}
                </NavLink>
              ))}
            </PageContainer>
          </nav>
        </div>
      </div>
    </div>
  );
}

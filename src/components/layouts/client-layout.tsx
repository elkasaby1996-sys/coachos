import { ClientCoachingNotice } from "../../features/commercial-access/client-coaching-notice";
import "../../styles/client-portal.css";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  ChevronDown,
  LogOut,
  Moon,
  Settings,
  UserCircle,
} from "../../lib/icons";
import {
  Home as HouseIcon,
  Dumbbell as BarbellIcon,
  Utensils as ForkKnifeIcon,
  ListChecks as ListChecksIcon,
  Watch as WatchIcon,
  ClipboardList as ClipboardTextIcon,
  MessageCircle as ChatCircleDotsIcon,
  Compass as CompassIcon,
  Settings as GearSixIcon,
  MoreHorizontal as DotsThreeIcon,
  type AppIcon as PhosphorIcon,
} from "../../lib/icons";
import { useState } from "react";
import { ProfileAvatar } from "../common/profile-avatar";
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
import { ClientMessageFab } from "../client/client-message-fab";
import { useWorkspace } from "../../lib/use-workspace";
import { useBootstrapAuth } from "../../lib/auth";
import { supabase } from "../../lib/supabase";
import { LoadingScreen } from "../common/bootstrap-gate";
import { useClientOnboarding } from "../../features/client-onboarding/hooks/use-client-onboarding";
import { ClientOnboardingSoftGate } from "../../features/client-onboarding/components/client-onboarding-soft-gate";
import {
  getModuleToneForPath,
  getModuleToneStyle,
  type ModuleTone,
} from "../../lib/module-tone";
import { WorkspaceHeaderModeProvider } from "../pt/workspace-header-mode";
import { useWorkspaceBranding } from "../../features/workspace-branding/use-workspace-branding";
import { getWorkspaceBrandingStyle } from "../../features/workspace-branding/branding";
import {
  WorkspaceLogo,
  WorkspaceWelcome,
} from "../../features/workspace-branding/components";

const navItems = [
  {
    label: "Home",
    to: "/app/home",
    icon: HouseIcon,
    module: "overview" as ModuleTone,
  },
  {
    label: "Workouts",
    to: "/app/workouts",
    icon: BarbellIcon,
    module: "checkins" as ModuleTone,
  },
  {
    label: "Nutrition",
    to: "/app/nutrition",
    icon: ForkKnifeIcon,
    module: "checkins" as ModuleTone,
  },
  {
    label: "Habits",
    to: "/app/habits",
    icon: ListChecksIcon,
    module: "checkins" as ModuleTone,
  },
  {
    label: "Wearables",
    to: "/app/wearables",
    icon: WatchIcon,
    module: "analytics" as ModuleTone,
  },
  {
    label: "Check-ins",
    to: "/app/checkins",
    icon: ClipboardTextIcon,
    module: "checkins" as ModuleTone,
  },
  {
    label: "Messages",
    to: "/app/messages",
    icon: ChatCircleDotsIcon,
    module: "coaching" as ModuleTone,
  },
  {
    label: "Coach Marketplace",
    to: "/app/find-coach",
    icon: CompassIcon,
    module: "leads" as ModuleTone,
  },
  {
    label: "Settings",
    to: "/app/settings",
    icon: GearSixIcon,
    module: "settings" as ModuleTone,
  },
];

function ClientNavIcon({
  icon: Icon,
  active = false,
}: {
  icon: PhosphorIcon;
  active?: boolean;
}) {
  return (
    <span className="client-nav-icon" aria-hidden="true">
      <Icon weight={active ? "duotone" : "regular"} />
    </span>
  );
}

const shouldShowOnboardingBanner = (pathname: string) => {
  return (
    pathname.startsWith("/app/home") ||
    pathname.startsWith("/app/settings") ||
    pathname.startsWith("/app/profile")
  );
};

function getHeaderProfilePillClassName(isLightMode: boolean) {
  return cn(
    "group hidden h-[54px] min-w-[232px] items-center gap-2.5 rounded-[18px] border px-3 py-2 text-left backdrop-blur-3xl transition-all duration-200 hover:-translate-y-[1px] sm:w-[252px] md:flex",
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
  const {
    activeClientId,
    bootstrapError: authError,
    hasWorkspaceMembership,
    clientProfile,
  } = useBootstrapAuth();
  const { resolvedTheme, toggleTheme } = useTheme();
  const brandingQuery = useWorkspaceBranding(clientProfile?.workspace_id);
  const onboardingQuery = useClientOnboarding();
  const onboardingSummary = onboardingQuery.data ?? null;
  const preWorkspaceMode = !hasWorkspaceMembership;
  const basicsGateRequired =
    !preWorkspaceMode &&
    Boolean(
      onboardingSummary &&
      onboardingSummary.canEdit &&
      !onboardingSummary.progress.basics.complete,
    );
  const isOnboardingRoute = location.pathname.startsWith("/app/onboarding");
  const currentModule = getModuleToneForPath(location.pathname);
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
  const errorMessage = error?.message ?? authError?.message ?? null;
  const shouldRenderOnboardingBanner = Boolean(
    onboardingSummary &&
    onboardingSummary.onboarding.status !== "completed" &&
    !isOnboardingRoute &&
    shouldShowOnboardingBanner(location.pathname) &&
    !isOnboardingBannerDismissed,
  );
  const shouldShowClientMessageFab = location.pathname !== "/app/messages";
  const profileDisplayName =
    clientProfile?.full_name?.trim() ||
    clientProfile?.display_name?.trim() ||
    "Client profile";
  const isLightMode = resolvedTheme === "light";
  const visibleNavItems = navItems;
  const isWorkoutDetail = /^\/app\/workout-(run|summary)\//.test(
    location.pathname,
  );

  const isMoreActive = visibleNavItems.some(
    (item) =>
      !["Home", "Workouts", "Nutrition", "Messages"].includes(item.label) &&
      location.pathname.startsWith(item.to),
  );

  if (loading) {
    return <LoadingScreen message="Loading..." />;
  }

  if (errorMessage && !preWorkspaceMode) {
    return (
      <div
        className="client-portal theme-shell-canvas relative isolate min-h-screen overflow-hidden [background:var(--portal-page-bg)]"
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
      className="client-portal theme-shell-canvas relative isolate min-h-screen overflow-hidden [background:var(--portal-page-bg)]"
      style={{
        ...getModuleToneStyle(currentModule),
        ...getWorkspaceBrandingStyle(
          brandingQuery.data?.accent_color,
          !isLightMode,
        ),
      }}
    >
      <AppShellBackgroundLayer />
      <div className="relative z-10 flex min-h-screen w-full">
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="pt-4 sm:pt-5 lg:pt-6">
            <PageContainer
              size="client-shell"
              align="left"
              className="flex flex-wrap items-center justify-between gap-3"
            >
              <div className="client-portal-header">
                <div className="relative space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <NavLink
                      to="/app/home"
                      className="client-portal-brand"
                      data-workspace-brand={Boolean(brandingQuery.data?.name)}
                      aria-label={
                        brandingQuery.data?.name
                          ? `${brandingQuery.data.name} home`
                          : "RepSync home"
                      }
                    >
                      {brandingQuery.data?.logo_url ? (
                        <WorkspaceLogo
                          name={brandingQuery.data.name || "Workspace"}
                          url={brandingQuery.data.logo_url}
                        />
                      ) : null}
                      <span className="min-w-0 truncate">
                        {brandingQuery.data?.name || "REPSYNC"}
                      </span>
                    </NavLink>
                    <div className="flex items-center gap-2 self-start sm:self-auto">
                      <NotificationBell viewAllHref="/app/notifications" />
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            type="button"
                            className={getHeaderProfilePillClassName(
                              isLightMode,
                            )}
                            aria-label="Profile menu"
                          >
                            <div
                              className={getHeaderProfilePillIconClassName(
                                isLightMode,
                              )}
                            >
                              <ProfileAvatar
                                name={profileDisplayName}
                                src={
                                  clientProfile?.avatar_url?.trim() ||
                                  clientProfile?.photo_url
                                }
                                className="h-full w-full rounded-[inherit]"
                              />
                            </div>
                            <div className="min-w-0 flex-1 space-y-0.5 text-left">
                              <div className="flex min-w-0 items-center gap-2">
                                <p className="min-w-0 flex-1 truncate text-[0.92rem] font-medium text-foreground">
                                  {profileDisplayName}
                                </p>
                              </div>
                            </div>
                            <span
                              className={getHeaderProfilePillChevronClassName(
                                isLightMode,
                              )}
                            >
                              <ChevronDown className="h-3.5 w-3.5 [stroke-width:1.8]" />
                            </span>
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent
                          variant="menu"
                          align="end"
                          sideOffset={10}
                          className="client-portal-menu client-profile-menu w-56"
                        >
                          <DropdownMenuLabel>Profile</DropdownMenuLabel>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() =>
                              navigate("/app/settings?tab=profile")
                            }
                          >
                            <span className="app-dropdown-icon-badge">
                              <UserCircle className="h-4 w-4 text-[var(--module-profile-text)] [stroke-width:1.7]" />
                            </span>
                            Profile
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() =>
                              navigate("/app/settings?tab=preferences")
                            }
                          >
                            <span className="app-dropdown-icon-badge">
                              <Settings className="h-4 w-4 text-[var(--module-settings-text)] [stroke-width:1.7]" />
                            </span>
                            Preferences
                          </DropdownMenuItem>
                          <div className="app-dropdown-utility-row">
                            <div className="flex min-w-0 items-center gap-3">
                              <span className="app-dropdown-icon-badge">
                                <Moon className="h-4 w-4 text-[var(--module-settings-text)] [stroke-width:1.7]" />
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
                              <LogOut className="h-4 w-4 text-[var(--state-danger-text)] [stroke-width:1.7]" />
                            </span>
                            {isSigningOut ? "Signing out..." : "Sign out"}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                  <nav
                    className="client-portal-nav"
                    aria-label="Primary navigation"
                  >
                    {visibleNavItems.map((item) => (
                      <NavLink
                        key={item.to}
                        to={item.to}
                        title={item.label}
                        className="client-portal-nav-link"
                        data-active={
                          item.label === "Workouts" && isWorkoutDetail
                        }
                      >
                        {({ isActive }) => (
                          <>
                            <ClientNavIcon
                              icon={item.icon}
                              active={
                                isActive ||
                                (item.label === "Workouts" && isWorkoutDetail)
                              }
                            />
                            <span>{item.label}</span>
                          </>
                        )}
                      </NavLink>
                    ))}
                  </nav>
                </div>
              </div>
            </PageContainer>
          </header>
          <main className="client-portal-main min-w-0 flex-1 py-4 sm:py-5 lg:py-6">
            <PageContainer size="client-shell" align="left">
              {location.pathname === "/app/home" || isOnboardingRoute ? (
                <WorkspaceWelcome branding={brandingQuery.data} />
              ) : null}
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
                    description="Add your basic details so your coach can identify your account."
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
                  <RouteTransition className="client-portal-content">
                    <ClientCoachingNotice
                      clientId={activeClientId ?? clientProfile?.id ?? null}
                    />
                    <Outlet />
                  </RouteTransition>
                </WorkspaceHeaderModeProvider>
              )}
            </PageContainer>
          </main>
          <div>
            <AppFooter className="z-40 md:relative" />
          </div>
          <nav
            className="client-portal-mobile-nav"
            aria-label="Mobile navigation"
          >
            {visibleNavItems
              .filter((item) =>
                ["Home", "Workouts", "Nutrition", "Messages"].includes(
                  item.label,
                ),
              )
              .map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className="client-portal-mobile-link"
                  data-active={item.label === "Workouts" && isWorkoutDetail}
                >
                  {({ isActive }) => (
                    <>
                      <ClientNavIcon
                        icon={item.icon}
                        active={
                          isActive ||
                          (item.label === "Workouts" && isWorkoutDetail)
                        }
                      />
                      <span>{item.label}</span>
                    </>
                  )}
                </NavLink>
              ))}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="client-portal-mobile-link"
                  aria-label="More pages"
                  data-active={isMoreActive}
                >
                  <ClientNavIcon icon={DotsThreeIcon} active={isMoreActive} />
                  <span>More</span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                side="top"
                sideOffset={12}
                className="client-portal-menu client-more-menu w-56"
              >
                {visibleNavItems
                  .filter(
                    (item) =>
                      !["Home", "Workouts", "Nutrition", "Messages"].includes(
                        item.label,
                      ),
                  )
                  .map((item) => (
                    <DropdownMenuItem key={item.to} asChild>
                      <NavLink to={item.to}>
                        {({ isActive }) => (
                          <>
                            <ClientNavIcon icon={item.icon} active={isActive} />
                            {item.label}
                          </>
                        )}
                      </NavLink>
                    </DropdownMenuItem>
                  ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </nav>
        </div>
      </div>
      <ClientMessageFab visible={shouldShowClientMessageFab} />
    </div>
  );
}

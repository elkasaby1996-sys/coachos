import { useEffect, useMemo, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import {
  Building,
  Check,
  ChevronDown,
  Globe,
  LogOut,
  Menu,
  MessageSquarePlus,
  Moon,
  PanelsTopLeft,
  Package,
  SlidersHorizontal,
  Sun,
  UserRound,
  UsersRound,
  Wallet,
  X,
} from "lucide-react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { Button } from "../ui/button";
import { PageContainer } from "../common/page-container";
import { ThemeModeSwitch } from "../common/theme-mode-switch";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { cn } from "../../lib/utils";
import { useBootstrapAuth, useSessionAuth } from "../../lib/auth";
import { useWorkspace } from "../../lib/use-workspace";
import {
  usePtHubSettings,
  usePtHubProfile,
  usePtHubWorkspaces,
} from "../../features/pt-hub/lib/pt-hub";
import { AppShellBackgroundLayer } from "../common/app-shell-background";
import { AppFooter } from "../common/app-footer";
import { RouteTransition } from "../common/route-transition";
import { WorkspaceSwitcherMenu } from "../common/workspace-switcher-menu";
import { supabase } from "../../lib/supabase";
import {
  getPreferredPersonDisplayName,
  getUserDisplayName,
} from "../../lib/account-profiles";
import {
  getSemanticToneClasses,
  getSemanticToneForStatus,
} from "../../lib/semantic-status";
import {
  getModuleToneClasses,
  getModuleToneStyle,
  type ModuleTone,
} from "../../lib/module-tone";
import { useI18n } from "../../lib/i18n";
import { WorkspaceHeaderModeProvider } from "../pt/workspace-header-mode";
import "../../styles/pt-hub-shell.css";

const hubNavGroups = [
  {
    label: "Home",
    labelKey: "ptHub.nav.home",
    items: [
      {
        label: "Overview",
        labelKey: "ptHub.nav.overview",
        to: "/pt-hub",
        icon: PanelsTopLeft,
        end: true,
        module: "overview" as const,
      },
      {
        label: "Coach Profile",
        labelKey: "ptHub.nav.coachProfile",
        to: "/pt-hub/profile",
        icon: UserRound,
        module: "profile" as const,
      },
      {
        label: "Packages",
        labelKey: "ptHub.nav.packages",
        to: "/pt-hub/packages",
        icon: Package,
        module: "profile" as const,
      },
      {
        label: "Profile Preview",
        labelKey: "ptHub.nav.profilePreview",
        to: "/pt-hub/profile/preview",
        icon: Globe,
        module: "profile" as const,
      },
    ],
  },
  {
    label: "Clients",
    labelKey: "ptHub.nav.clients",
    items: [
      {
        label: "Leads",
        labelKey: "ptHub.nav.leads",
        to: "/pt-hub/leads",
        icon: MessageSquarePlus,
        module: "leads" as const,
      },
      {
        label: "Clients",
        labelKey: "ptHub.nav.clients",
        to: "/pt-hub/clients",
        icon: UsersRound,
        module: "clients" as const,
      },
      {
        label: "Coaching Spaces",
        labelKey: "ptHub.nav.coachingSpaces",
        to: "/pt-hub/workspaces",
        icon: Building,
        module: "coaching" as const,
      },
      {
        label: "Payments",
        labelKey: "ptHub.nav.payments",
        to: "/pt-hub/payments",
        icon: Wallet,
        module: "billing" as const,
      },
      {
        label: "Analytics",
        labelKey: "ptHub.nav.analytics",
        to: "/pt-hub/analytics",
        icon: PanelsTopLeft,
        module: "analytics" as const,
      },
    ],
  },
  {
    label: "Account",
    labelKey: "ptHub.nav.account",
    items: [
      {
        label: "Settings",
        labelKey: "ptHub.nav.settings",
        to: "/pt-hub/settings",
        icon: SlidersHorizontal,
        module: "settings" as const,
      },
    ],
  },
] as const;

const routeMeta: Record<
  string,
  {
    title: string;
    titleKey: string;
    description: string;
    descriptionKey: string;
    module: ModuleTone;
  }
> = {
  "/pt-hub": {
    title: "Overview",
    titleKey: "ptHub.routes.overview.title",
    description: "Run your coaching business from one dashboard.",
    descriptionKey: "ptHub.routes.overview.description",
    module: "overview",
  },
  "/pt-hub/profile": {
    title: "Coach Profile",
    titleKey: "ptHub.routes.profile.title",
    description: "Update the public trainer page clients will see.",
    descriptionKey: "ptHub.routes.profile.description",
    module: "profile",
  },
  "/pt-hub/packages": {
    title: "Packages",
    titleKey: "ptHub.routes.packages.title",
    description:
      "Manage package visibility and ordering for public lead intake.",
    descriptionKey: "ptHub.routes.packages.description",
    module: "profile",
  },
  "/pt-hub/profile/preview": {
    title: "Profile Preview",
    titleKey: "ptHub.routes.profilePreview.title",
    description: "Preview your public trainer page before sharing it.",
    descriptionKey: "ptHub.routes.profilePreview.description",
    module: "profile",
  },
  "/pt-hub/leads": {
    title: "Leads",
    titleKey: "ptHub.routes.leads.title",
    description: "Review new inquiries and follow up faster.",
    descriptionKey: "ptHub.routes.leads.description",
    module: "leads",
  },
  "/pt-hub/clients": {
    title: "Clients",
    titleKey: "ptHub.routes.clients.title",
    description: "See every client across your coaching spaces.",
    descriptionKey: "ptHub.routes.clients.description",
    module: "clients",
  },
  "/pt-hub/workspaces": {
    title: "Coaching Spaces",
    titleKey: "ptHub.routes.workspaces.title",
    description: "Open, create, and manage your coaching spaces.",
    descriptionKey: "ptHub.routes.workspaces.description",
    module: "coaching",
  },
  "/pt-hub/payments": {
    title: "Payments",
    titleKey: "ptHub.routes.payments.title",
    description: "Check billing, invoices, and revenue at a glance.",
    descriptionKey: "ptHub.routes.payments.description",
    module: "billing",
  },
  "/pt-hub/analytics": {
    title: "Analytics",
    titleKey: "ptHub.routes.analytics.title",
    description: "Track inquiries, conversions, and client growth.",
    descriptionKey: "ptHub.routes.analytics.description",
    module: "analytics",
  },
  "/pt-hub/settings": {
    title: "PT Hub Settings",
    titleKey: "ptHub.routes.settings.title",
    description:
      "Manage account identity, security, billing, and notifications.",
    descriptionKey: "ptHub.routes.settings.description",
    module: "settings",
  },
};

const defaultRouteMeta = routeMeta["/pt-hub"]!;
const PT_HUB_THEME_STORAGE_KEY = "coachos-pt-hub-theme-mode";

type PtHubThemeMode = "dark" | "light";

function getPtHubRouteMeta(pathname: string) {
  return (
    Object.entries(routeMeta)
      .sort((a, b) => b[0].length - a[0].length)
      .find(
        ([routePath]) =>
          pathname === routePath || pathname.startsWith(`${routePath}/`),
      )?.[1] ?? defaultRouteMeta
  );
}

function getPtHubRouteTransitionKey(pathname: string) {
  if (/^\/pt-hub\/settings\/[^/]+(?:\/.*)?$/.test(pathname)) {
    return "/pt-hub/settings";
  }
  return pathname;
}

function getPtHubHeaderPillClassName(isLightMode: boolean) {
  return cn(
    "group hidden h-[58px] w-[236px] items-center gap-3 rounded-[20px] border px-3 py-2 text-left backdrop-blur-3xl transition-all duration-200 hover:-translate-y-[1px] sm:flex",
    isLightMode
      ? "border-border/70 bg-[linear-gradient(180deg,oklch(var(--bg-surface-elevated)/0.88),oklch(var(--bg-surface)/0.76))] shadow-[var(--surface-shadow)] hover:border-primary/18 hover:bg-[linear-gradient(180deg,oklch(var(--bg-surface-elevated)/0.94),oklch(var(--bg-surface)/0.82))] hover:shadow-[0_24px_54px_-36px_oklch(var(--accent)/0.16)]"
      : "border-border/70 bg-[linear-gradient(180deg,oklch(var(--bg-surface-elevated)/0.86),oklch(var(--bg-surface)/0.72))] shadow-[var(--surface-shadow)] hover:border-primary/18 hover:bg-[linear-gradient(180deg,oklch(var(--bg-surface-elevated)/0.92),oklch(var(--bg-surface)/0.78))] hover:shadow-[0_24px_52px_-36px_oklch(var(--accent)/0.18)]",
  );
}

function getPtHubHeaderPillIconClassName(isLightMode: boolean) {
  return cn(
    "flex h-9 w-9 shrink-0 items-center justify-center text-foreground transition-colors duration-200",
    isLightMode
      ? "text-primary group-hover:text-foreground"
      : "text-primary group-hover:text-foreground",
  );
}

function getPtHubHeaderPillChevronClassName(isLightMode: boolean) {
  return cn(
    "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border transition-all duration-200",
    isLightMode
      ? "border-border/70 bg-[oklch(var(--bg-surface-elevated)/0.72)] text-primary group-hover:border-primary/18 group-hover:text-foreground"
      : "border-border/60 bg-[oklch(var(--bg-surface-elevated)/0.3)] text-muted-foreground group-hover:border-primary/18 group-hover:text-primary",
  );
}

function getPtHubStatusPillClassName(isLightMode: boolean) {
  return cn(
    "hidden h-[58px] min-w-[176px] items-center gap-3 rounded-[20px] border px-3 py-2 text-left backdrop-blur-3xl sm:flex",
    isLightMode
      ? "border-border/70 bg-[linear-gradient(180deg,oklch(var(--bg-surface-elevated)/0.88),oklch(var(--bg-surface)/0.76))] shadow-[var(--surface-shadow)]"
      : "border-border/70 bg-[linear-gradient(180deg,oklch(var(--bg-surface-elevated)/0.86),oklch(var(--bg-surface)/0.72))] shadow-[var(--surface-shadow)]",
  );
}

function getPtHubStatusPillIconClassName(params: {
  isLightMode: boolean;
  published: boolean;
}) {
  const toneStyles = getSemanticToneClasses(
    getSemanticToneForStatus(params.published ? "Published" : "Unpublished"),
  );

  return cn(
    "flex h-9 w-9 shrink-0 items-center justify-center rounded-[14px] border transition-colors duration-200",
    toneStyles.surface,
  );
}

function getPtHubStatusPillToneClassName(params: {
  isLightMode: boolean;
  published: boolean;
}) {
  const toneStyles = getSemanticToneClasses(
    getSemanticToneForStatus(params.published ? "Published" : "Unpublished"),
  );

  return cn("text-[0.92rem] font-medium", toneStyles.text);
}

function sidebarLinkClasses(isActive: boolean, isLightMode: boolean) {
  return cn(
    "group relative flex items-start gap-3 rounded-[22px] border px-3.5 py-3 text-sm font-medium transition-all duration-200 cursor-pointer",
    isActive
      ? isLightMode
        ? "translate-x-1 border-transparent bg-transparent text-slate-900"
        : "translate-x-1 border-transparent bg-transparent text-foreground"
      : isLightMode
        ? "border-transparent bg-transparent text-slate-800 hover:border-border/80 hover:bg-white/24 hover:text-slate-950"
        : "border-transparent bg-transparent text-muted-foreground hover:border-border/70 hover:bg-background/55 hover:text-foreground",
  );
}

export function PtHubLayout() {
  const { t } = useI18n();
  const location = useLocation();
  const navigate = useNavigate();
  const { ptProfile } = useBootstrapAuth();
  const { user } = useSessionAuth();
  const { workspaceId, switchWorkspace } = useWorkspace();
  const workspacesQuery = usePtHubWorkspaces();
  const settingsQuery = usePtHubSettings();
  const profileQuery = usePtHubProfile();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [headerCondensed, setHeaderCondensed] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [themeMode, setThemeMode] = useState<PtHubThemeMode>("dark");
  const mainScrollRef = useRef<HTMLElement | null>(null);
  const routeTransitionKey = getPtHubRouteTransitionKey(location.pathname);

  const meta = getPtHubRouteMeta(location.pathname);
  const metaTitle = t(meta.titleKey, meta.title);
  const metaDescription = t(meta.descriptionKey, meta.description);
  const currentModuleClasses = getModuleToneClasses(meta.module);
  const workspaces = useMemo(
    () => workspacesQuery.data ?? [],
    [workspacesQuery.data],
  );
  const workspaceSwitcherItems = workspaces.map((workspace) => ({
    id: workspace.id,
    name: workspace.name,
    meta: `${workspace.clientCount ?? 0} active clients`,
  }));
  const inPtHubWorkspace = location.pathname.startsWith("/pt-hub");
  const publishedProfile = Boolean(profileQuery.data?.isPublished);
  const fallbackWorkspace =
    workspaceId && workspaces.some((workspace) => workspace.id === workspaceId)
      ? null
      : (workspaces[0] ?? null);
  const currentWorkspace =
    workspaces.find((workspace) => workspace.id === workspaceId) ??
    fallbackWorkspace;
  const workspacePillLabel = inPtHubWorkspace
    ? t("common.repsyncPtHub", "Repsync PT Hub")
    : (currentWorkspace?.name ??
      (workspacesQuery.isLoading
        ? t("common.loadingWorkspace", "Loading workspace...")
        : workspaceId
          ? t("common.currentWorkspace", "Current workspace")
          : t("common.noWorkspaceSelected", "No workspace selected")));
  const settingsFullName = settingsQuery.data?.fullName.trim();
  const coachDisplayName =
    getPreferredPersonDisplayName(
      settingsFullName,
      ptProfile?.full_name,
      ptProfile?.display_name,
      getUserDisplayName(user),
      user?.email?.split("@")[0],
    ) || t("common.account", "Account");
  const userInitial = (
    coachDisplayName.charAt(0) ||
    user?.email?.charAt(0) ||
    user?.phone?.charAt(0) ||
    "P"
  ).toUpperCase();
  const isLightMode = themeMode === "light";

  useEffect(() => {
    if (typeof window === "undefined") return;

    const storedTheme = window.localStorage.getItem(PT_HUB_THEME_STORAGE_KEY);
    if (storedTheme === "dark" || storedTheme === "light") {
      setThemeMode(storedTheme);
      return;
    }

    const prefersDark = window.matchMedia(
      "(prefers-color-scheme: dark)",
    ).matches;
    setThemeMode(prefersDark ? "dark" : "light");
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(PT_HUB_THEME_STORAGE_KEY, themeMode);
  }, [themeMode]);

  useEffect(() => {
    if (typeof document === "undefined") return;

    document.body.classList.toggle("pt-hub-portal-light", isLightMode);
    return () => {
      document.body.classList.remove("pt-hub-portal-light");
    };
  }, [isLightMode]);

  useEffect(() => {
    const firstWorkspace = workspaces[0];
    if (!firstWorkspace) return;
    if (
      workspaceId &&
      workspaces.some((workspace) => workspace.id === workspaceId)
    ) {
      return;
    }
    switchWorkspace(firstWorkspace.id);
  }, [workspaceId, workspaces, switchWorkspace]);

  useEffect(() => {
    const mainElement = mainScrollRef.current;
    if (!mainElement) return;

    const handleScroll = () => {
      setHeaderCondensed(mainElement.scrollTop > 24);
    };

    handleScroll();
    mainElement.addEventListener("scroll", handleScroll, { passive: true });
    return () => mainElement.removeEventListener("scroll", handleScroll);
  }, [routeTransitionKey]);

  const signOut = async () => {
    setIsSigningOut(true);
    await supabase.auth.signOut();
    navigate("/login", { replace: true });
  };

  return (
    <div
      className={cn(
        "pt-hub-theme theme-shell-canvas relative isolate flex min-h-screen flex-col overflow-hidden lg:h-screen",
        themeMode === "light" ? "pt-hub-theme-light" : "pt-hub-theme-dark",
      )}
      style={getModuleToneStyle(meta.module)}
    >
      <AppShellBackgroundLayer animated mode={themeMode} />

      <div
        className={cn(
          "theme-overlay fixed inset-0 z-40 backdrop-blur-sm transition lg:hidden",
          mobileOpen ? "opacity-100" : "pointer-events-none opacity-0",
        )}
        onClick={() => setMobileOpen(false)}
        aria-hidden={!mobileOpen}
      />
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-[320px] max-w-[calc(100vw-1rem)] p-3 transition lg:hidden",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="surface-panel-strong flex h-full flex-col overflow-hidden rounded-[32px] border-border/70">
          <div className="flex items-center justify-between border-b border-border/60 px-5 py-4">
            <div>
              <p className="text-xl font-semibold uppercase tracking-[0.06em] text-foreground">
                {t("common.repsyncPtHub", "Repsync PT Hub")}
              </p>
              <p className="text-sm text-muted-foreground">
                {t("common.trainerWorkspace", "Trainer workspace")}
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setMobileOpen(false)}
              aria-label={t("common.closeNavigation", "Close navigation")}
            >
              <X className="h-5 w-5" />
            </Button>
          </div>
          <SidebarContent
            className="min-h-0"
            onLogout={signOut}
            isSigningOut={isSigningOut}
            themeMode={themeMode}
            onNavigate={() => setMobileOpen(false)}
          />
        </div>
      </aside>

      <PageContainer
        size="pt-shell"
        align="left"
        className="relative z-10 flex-1 py-4 sm:py-5 lg:min-h-0 lg:overflow-hidden lg:py-4"
      >
        <div className="lg:h-full lg:pl-[328px]">
          <aside className="hidden lg:fixed lg:bottom-[72px] lg:left-0 lg:top-0 lg:z-30 lg:block lg:w-[320px] lg:p-3">
            <div className="h-full min-h-0">
              <div
                className={cn(
                  "surface-panel-strong h-full min-h-0 overflow-hidden rounded-[34px] border-border/70",
                  isLightMode
                    ? "shadow-[var(--surface-strong-shadow)]"
                    : "shadow-[var(--surface-strong-shadow)]",
                )}
              >
                <SidebarContent
                  onLogout={signOut}
                  isSigningOut={isSigningOut}
                  themeMode={themeMode}
                />
              </div>
            </div>
          </aside>

          <div className="min-w-0 space-y-5 lg:flex lg:h-full lg:min-h-0 lg:flex-col">
            <header
              className={cn(
                "surface-panel-strong relative overflow-hidden rounded-[34px] border-border/70 px-4 transition-[padding,transform,box-shadow] duration-200 sm:px-5 lg:sticky lg:top-0 lg:z-20 lg:px-6",
                headerCondensed ? "py-3" : "py-4",
                isLightMode
                  ? "shadow-[var(--surface-strong-shadow)]"
                  : "shadow-[var(--surface-strong-shadow)]",
              )}
            >
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,oklch(var(--accent)/0.18),transparent_34%),radial-gradient(circle_at_bottom_left,oklch(var(--chart-3)/0.1),transparent_30%),linear-gradient(135deg,transparent,oklch(var(--accent)/0.04))]" />
              <div
                className={cn(
                  "pointer-events-none absolute inset-x-6 top-0 h-px",
                  isLightMode
                    ? "bg-[linear-gradient(90deg,transparent,oklch(var(--border-strong)/0.22),transparent)]"
                    : "bg-[linear-gradient(90deg,transparent,oklch(var(--border-strong)/0.34),transparent)]",
                )}
              />
              <div
                className={cn(
                  "relative flex flex-wrap items-start justify-between transition-[gap] duration-200",
                  headerCondensed ? "gap-3" : "gap-4",
                )}
              >
                <div className="flex min-w-0 items-start gap-3">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="mt-1 lg:hidden"
                    onClick={() => setMobileOpen(true)}
                  >
                    <Menu className="h-5 w-5 [stroke-width:1.7]" />
                    <span className="sr-only">
                      {t("ptHub.openNavigation", "Open PT Hub navigation")}
                    </span>
                  </Button>
                  <div
                    className={cn(
                      "min-w-0 transition-[gap] duration-200",
                      headerCondensed ? "space-y-2" : "space-y-3",
                    )}
                  >
                    <div
                      className={cn(
                        "transition-[gap] duration-200",
                        headerCondensed ? "space-y-1" : "space-y-2",
                      )}
                    >
                      <p
                        className={cn(
                          "font-semibold uppercase tracking-[0.06em] text-foreground transition-[font-size,line-height] duration-200",
                          headerCondensed
                            ? "text-[1.7rem] leading-none sm:text-[2rem]"
                            : "text-[2.15rem] sm:text-[2.45rem]",
                          currentModuleClasses.title,
                        )}
                      >
                        {metaTitle}
                      </p>
                      <p
                        className={cn(
                          "max-w-3xl text-muted-foreground transition-[font-size,line-height,opacity] duration-200",
                          headerCondensed
                            ? "text-[12px] leading-4 opacity-80"
                            : "text-[0.95rem] leading-6",
                        )}
                      >
                        {metaDescription}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-end gap-2">
                  <div className={getPtHubStatusPillClassName(isLightMode)}>
                    <div
                      className={getPtHubStatusPillIconClassName({
                        isLightMode,
                        published: publishedProfile,
                      })}
                    >
                      <Globe className="h-4 w-4 [stroke-width:1.7]" />
                    </div>
                    <div className="min-w-0 flex-1 space-y-0.5">
                      <p className="pt-hub-kicker">
                        {t("common.profileStatus", "Profile status")}
                      </p>
                      <div className="flex items-center gap-2">
                        <span
                          aria-hidden
                          className={cn(
                            "h-2 w-2 rounded-full",
                            getSemanticToneClasses(
                              getSemanticToneForStatus(
                                publishedProfile ? "Published" : "Unpublished",
                              ),
                            ).marker,
                          )}
                        />
                        <p
                          className={getPtHubStatusPillToneClassName({
                            isLightMode,
                            published: publishedProfile,
                          })}
                        >
                          {publishedProfile
                            ? t("common.published", "Published")
                            : t("common.unpublished", "Unpublished")}
                        </p>
                      </div>
                    </div>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        disabled={workspaces.length === 0}
                        className={cn(
                          getPtHubHeaderPillClassName(isLightMode),
                          workspaces.length === 0 &&
                            "cursor-not-allowed opacity-50",
                        )}
                      >
                        <div
                          className={getPtHubHeaderPillIconClassName(
                            isLightMode,
                          )}
                        >
                          <Building className="h-4 w-4 [stroke-width:1.7]" />
                        </div>
                        <div className="min-w-0 flex-1 text-left">
                          <p className="max-w-[138px] truncate text-[0.92rem] font-medium text-foreground">
                            {workspacePillLabel}
                          </p>
                        </div>
                        <span
                          className={getPtHubHeaderPillChevronClassName(
                            isLightMode,
                          )}
                        >
                          <ChevronDown className="h-3.5 w-3.5 [stroke-width:1.8]" />
                        </span>
                      </button>
                    </DropdownMenuTrigger>
                    <WorkspaceSwitcherMenu
                      label={t("common.activeWorkspace", "Active workspace")}
                      hubLabel={t("common.repsyncPtHub", "Repsync PT Hub")}
                      hubMeta={t(
                        "ptHub.workspaceSwitcher.hubMeta",
                        "Business and admin workspace",
                      )}
                      hubActive={inPtHubWorkspace}
                      onSelectHub={() => navigate("/pt-hub")}
                      workspaces={workspaceSwitcherItems}
                      currentWorkspaceId={!inPtHubWorkspace ? workspaceId : null}
                      onSelectWorkspace={(selectedWorkspaceId) => {
                        switchWorkspace(selectedWorkspaceId);
                        navigate("/pt/dashboard");
                      }}
                      loading={workspacesQuery.isLoading}
                      loadingLabel={t(
                        "common.loadingWorkspaces",
                        "Loading workspaces...",
                      )}
                      emptyLabel={t(
                        "common.noWorkspacesFound",
                        "No workspaces found",
                      )}
                    />
                  </DropdownMenu>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        className={getPtHubHeaderPillClassName(isLightMode)}
                      >
                        <div
                          className={getPtHubHeaderPillIconClassName(
                            isLightMode,
                          )}
                        >
                          {userInitial}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="max-w-[138px] truncate text-[0.92rem] font-medium text-foreground">
                            {coachDisplayName}
                          </p>
                        </div>
                        <span
                          className={getPtHubHeaderPillChevronClassName(
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
                      className="w-64"
                    >
                      <DropdownMenuLabel>
                        <span className="pt-hub-kicker block">
                          {t("common.account", "Account")}
                        </span>
                        <span className="mt-1 block truncate text-sm font-medium text-foreground">
                          {coachDisplayName}
                        </span>
                      </DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      <div className="app-dropdown-utility-row">
                        <div className="flex min-w-0 items-center gap-2.5">
                          <span className="app-dropdown-icon-badge">
                            <Moon className="h-4 w-4 text-[var(--module-settings-text)] [stroke-width:1.7]" />
                          </span>
                          <span className="truncate font-medium text-foreground">
                            {t("common.theme", "Theme")}
                          </span>
                        </div>
                        <ThemeModeSwitch
                          mode={themeMode}
                          onToggle={() =>
                            setThemeMode((current) =>
                              current === "dark" ? "light" : "dark",
                            )
                          }
                        />
                      </div>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="mt-1"
                        onClick={() => navigate("/pt-hub/settings")}
                      >
                        <span className="app-dropdown-icon-badge">
                          <SlidersHorizontal className="h-4 w-4 text-[var(--module-settings-text)] [stroke-width:1.7]" />
                        </span>
                        <span className="font-medium text-foreground">
                          {t("common.settings", "Settings")}
                        </span>
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        disabled={isSigningOut}
                        onClick={() => {
                          void signOut();
                        }}
                      >
                        <span className="app-dropdown-icon-badge">
                          <LogOut className="h-4 w-4 text-[var(--state-danger-text)] [stroke-width:1.7]" />
                        </span>
                        <span className="font-medium text-foreground">
                          {isSigningOut
                            ? t("common.signingOut", "Signing out...")
                            : t("common.signOut", "Sign out")}
                        </span>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            </header>

            <main
              ref={mainScrollRef}
              className="min-w-0 lg:min-h-0 lg:flex-1 lg:overflow-x-hidden lg:overflow-y-auto lg:pr-1"
            >
              <div className="pt-content-zoom">
                <WorkspaceHeaderModeProvider value="shell">
                  <RouteTransition routeKey={routeTransitionKey}>
                    <Outlet />
                  </RouteTransition>
                </WorkspaceHeaderModeProvider>
              </div>
            </main>
          </div>
        </div>
      </PageContainer>
      <AppFooter enableRegionLanguageSwitcher />
    </div>
  );
}

function SidebarContent({
  className,
  onLogout,
  isSigningOut,
  themeMode,
  onNavigate,
}: {
  className?: string;
  onLogout: () => Promise<void>;
  isSigningOut: boolean;
  themeMode: PtHubThemeMode;
  onNavigate?: () => void;
}) {
  const { t } = useI18n();
  const isLightMode = themeMode === "light";
  const reduceMotion = useReducedMotion();

  return (
    <div className={cn("flex h-full min-h-0 flex-col px-5 py-5", className)}>
      <div className="space-y-4 border-b border-border/60 pb-5">
        <div className="min-w-0">
          <p
            className={cn(
              "text-[1.15rem] font-semibold uppercase tracking-[0.05em]",
              isLightMode ? "text-slate-950" : "text-foreground",
            )}
          >
            {t("common.repsyncHub", "Repsync Hub")}
          </p>
        </div>
      </div>

      <nav className="mt-5 min-h-0 flex-1 overflow-y-auto pb-8 pr-1">
        {hubNavGroups.map((group) => (
          <div key={group.label} className="space-y-2.5">
            <p className="pt-hub-kicker px-2">
              {t(group.labelKey, group.label)}
            </p>
            <div className="space-y-1">
              {group.items.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={"end" in item ? item.end : undefined}
                    onClick={onNavigate}
                    className={({ isActive }) =>
                      sidebarLinkClasses(isActive, isLightMode)
                    }
                  >
                    {({ isActive }) => (
                      <>
                        {isActive ? (
                          <motion.span
                            layoutId="pt-hub-nav-active-pill"
                            className={cn(
                              "absolute inset-0 rounded-[24px] border",
                              getModuleToneClasses(item.module).navActive,
                            )}
                            style={getModuleToneStyle(item.module)}
                            transition={
                              reduceMotion
                                ? { duration: 0 }
                                : {
                                    type: "spring",
                                    stiffness: 280,
                                    damping: 30,
                                  }
                            }
                          />
                        ) : null}
                        <span
                          style={getModuleToneStyle(item.module)}
                          className={cn(
                            "relative z-10 flex h-10 w-10 shrink-0 items-center justify-center transition-colors",
                            isActive
                              ? "section-accent-nav-icon-active"
                              : isLightMode
                                ? "text-slate-600 group-hover:text-foreground"
                                : "text-muted-foreground group-hover:text-foreground",
                            getModuleToneClasses(item.module).navIcon,
                          )}
                        >
                          <Icon className="h-4 w-4 [stroke-width:1.7]" />
                        </span>
                        <motion.div
                          className="min-w-0 self-center"
                          animate={
                            reduceMotion
                              ? { opacity: 1, x: 0 }
                              : { opacity: 1, x: isActive ? 2 : 0 }
                          }
                          transition={{ duration: 0.18, ease: "easeOut" }}
                        >
                          <p
                            className={cn(
                              "relative z-10",
                              isLightMode ? "text-slate-900" : "text-inherit",
                            )}
                          >
                            {t(item.labelKey, item.label)}
                          </p>
                        </motion.div>
                      </>
                    )}
                  </NavLink>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
    </div>
  );
}

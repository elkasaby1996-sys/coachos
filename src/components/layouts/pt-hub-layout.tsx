import { useEffect, useState } from "react";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { cn } from "../../lib/utils";
import { useAuth } from "../../lib/auth";
import { useWorkspace } from "../../lib/use-workspace";
import { usePtHubWorkspaces } from "../../features/pt-hub/lib/pt-hub";
import { PtHubAnimatedBackground } from "../../features/pt-hub/components/pt-hub-animated-background";
import { supabase } from "../../lib/supabase";

const hubNavGroups = [
  {
    label: "Home",
    items: [
      { label: "Overview", to: "/pt-hub", icon: PanelsTopLeft, end: true },
      { label: "Coach Profile", to: "/pt-hub/profile", icon: UserRound },
      { label: "Profile Preview", to: "/pt-hub/profile/preview", icon: Globe },
    ],
  },
  {
    label: "Clients",
    items: [
      { label: "Leads", to: "/pt-hub/leads", icon: MessageSquarePlus },
      { label: "Clients", to: "/pt-hub/clients", icon: UsersRound },
      { label: "Coaching Spaces", to: "/pt-hub/workspaces", icon: Building },
      { label: "Payments", to: "/pt-hub/payments", icon: Wallet },
      { label: "Analytics", to: "/pt-hub/analytics", icon: PanelsTopLeft },
    ],
  },
  {
    label: "Account",
    items: [
      { label: "Settings", to: "/pt-hub/settings", icon: SlidersHorizontal },
    ],
  },
] as const;

const navDescriptions: Record<string, string> = {
  Overview: "Business summary",
  "Coach Profile": "Public trainer page",
  "Profile Preview": "See the public page",
  Leads: "New inquiries",
  Clients: "Client list and status",
  "Coaching Spaces": "Your active workspaces",
  Payments: "Billing and payouts",
  Analytics: "Business insights",
  Settings: "Account preferences",
};

const routeMeta: Record<string, { title: string; description: string }> = {
  "/pt-hub": {
    title: "Overview",
    description: "Run your coaching business from one dashboard.",
  },
  "/pt-hub/profile": {
    title: "Coach Profile",
    description: "Update the public trainer page clients will see.",
  },
  "/pt-hub/profile/preview": {
    title: "Profile Preview",
    description: "Preview your public trainer page before sharing it.",
  },
  "/pt-hub/leads": {
    title: "Leads",
    description: "Review new inquiries and follow up faster.",
  },
  "/pt-hub/clients": {
    title: "Clients",
    description: "See every client across your coaching spaces.",
  },
  "/pt-hub/workspaces": {
    title: "Coaching Spaces",
    description: "Open, create, and manage your coaching spaces.",
  },
  "/pt-hub/payments": {
    title: "Payments",
    description: "Check billing, invoices, and revenue at a glance.",
  },
  "/pt-hub/analytics": {
    title: "Analytics",
    description: "Track inquiries, conversions, and client growth.",
  },
  "/pt-hub/settings": {
    title: "Account Settings",
    description:
      "Manage account details, notifications, and profile visibility.",
  },
};

const defaultRouteMeta = routeMeta["/pt-hub"]!;
const PT_HUB_THEME_STORAGE_KEY = "coachos-pt-hub-theme-mode";

type PtHubThemeMode = "dark" | "light";

function getPtHubDropdownContentClassName(isLightMode: boolean) {
  return cn(
    "w-60 rounded-[22px] border p-1.5 text-foreground backdrop-blur-3xl",
    isLightMode
      ? "border-slate-900/8 bg-[linear-gradient(180deg,rgba(236,241,245,0.78),rgba(220,228,235,0.68))] shadow-[0_26px_62px_-36px_rgba(15,23,42,0.16)]"
      : "border-white/10 bg-[linear-gradient(180deg,rgba(16,20,18,0.94),rgba(9,12,11,0.92))] shadow-[0_30px_72px_-40px_rgba(0,0,0,0.92)]",
  );
}

function getPtHubDropdownItemClassName(isLightMode: boolean) {
  return cn(
    "group rounded-[14px] px-3 py-2.5 text-sm text-foreground transition-colors duration-200 focus:text-foreground data-[highlighted]:text-foreground",
    isLightMode
      ? "bg-transparent focus:bg-slate-900/[0.05] data-[highlighted]:bg-slate-900/[0.05]"
      : "bg-transparent focus:bg-white/[0.05] data-[highlighted]:bg-white/[0.05]",
  );
}

function getPtHubDropdownLabelClassName(isLightMode: boolean) {
  return cn("px-3 py-2", isLightMode ? "" : "");
}

function getPtHubDropdownSeparatorClassName(isLightMode: boolean) {
  return cn(
    "-mx-1 my-1.5 h-px",
    isLightMode ? "bg-slate-900/[0.08]" : "bg-white/[0.08]",
  );
}

function getPtHubDropdownUtilityRowClassName(isLightMode: boolean) {
  return cn(
    "flex items-center justify-between gap-3 rounded-[14px] px-3 py-2.5 text-sm text-foreground",
    isLightMode ? "bg-[rgba(255,255,255,0.18)]" : "bg-white/[0.03]",
  );
}

function getPtHubDropdownGlyphClassName(isLightMode: boolean) {
  return cn(
    "flex h-7 w-7 shrink-0 items-center justify-center rounded-[10px] transition-colors duration-200",
    isLightMode ? "text-slate-600" : "text-primary",
  );
}

function getPtHubHeaderPillClassName(isLightMode: boolean) {
  return cn(
    "group hidden h-[58px] w-[236px] items-center gap-3 rounded-[20px] border px-3 py-2 text-left backdrop-blur-3xl transition-all duration-200 hover:-translate-y-[1px] sm:flex",
    isLightMode
      ? "border-slate-900/8 bg-[linear-gradient(180deg,rgba(233,239,244,0.72),rgba(218,227,235,0.62))] shadow-[0_22px_48px_-34px_rgba(15,23,42,0.16),inset_0_1px_0_rgba(255,255,255,0.38)] hover:border-primary/16 hover:bg-[linear-gradient(180deg,rgba(238,243,247,0.78),rgba(223,232,239,0.68))] hover:shadow-[0_24px_54px_-34px_rgba(15,23,42,0.18),0_0_0_1px_rgba(79,143,170,0.08),inset_0_1px_0_rgba(255,255,255,0.44)]"
      : "border-white/10 bg-[linear-gradient(180deg,rgba(18,24,22,0.8),rgba(10,14,13,0.72))] shadow-[0_22px_46px_-34px_rgba(0,0,0,0.82),inset_0_1px_0_rgba(255,255,255,0.06)] hover:border-primary/18 hover:bg-[linear-gradient(180deg,rgba(22,29,26,0.88),rgba(12,17,15,0.78))] hover:shadow-[0_24px_52px_-34px_rgba(0,0,0,0.88),0_0_0_1px_rgba(116,201,164,0.08),inset_0_1px_0_rgba(255,255,255,0.08)]",
  );
}

function getPtHubHeaderPillIconClassName(isLightMode: boolean) {
  return cn(
    "flex h-9 w-9 shrink-0 items-center justify-center rounded-[14px] border text-foreground transition-colors duration-200",
    isLightMode
      ? "border-slate-900/8 bg-[linear-gradient(180deg,rgba(246,249,251,0.46),rgba(230,237,243,0.38))] text-[rgb(79,143,170)] shadow-[inset_0_1px_0_rgba(255,255,255,0.44),0_14px_28px_-24px_rgba(15,23,42,0.14)] group-hover:text-slate-900"
      : "border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.07),rgba(255,255,255,0.025))] text-primary shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_14px_28px_-24px_rgba(0,0,0,0.82)] group-hover:text-foreground",
  );
}

function getPtHubHeaderPillChevronClassName(isLightMode: boolean) {
  return cn(
    "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border transition-all duration-200",
    isLightMode
      ? "border-slate-900/8 bg-white/22 text-[rgb(79,143,170)] group-hover:border-primary/16 group-hover:text-slate-800"
      : "border-white/8 bg-white/[0.04] text-muted-foreground group-hover:border-primary/18 group-hover:text-primary",
  );
}

function sidebarLinkClasses(isActive: boolean, isLightMode: boolean) {
  return cn(
    "group relative flex items-start gap-3 rounded-[22px] border px-3.5 py-3 text-sm font-medium transition-all duration-200 cursor-pointer",
    isActive
      ? isLightMode
        ? "translate-x-1 border-primary/26 bg-[linear-gradient(180deg,rgba(236,242,246,0.72),rgba(221,230,238,0.6))] text-slate-900 shadow-[0_22px_54px_-36px_rgba(15,23,42,0.14)]"
        : "translate-x-1 border-primary/28 bg-[linear-gradient(180deg,oklch(var(--bg-surface-elevated)/0.98),oklch(var(--bg-surface)/0.92))] text-foreground shadow-[0_22px_54px_-36px_oklch(var(--accent)/0.42)]"
      : isLightMode
        ? "border-transparent bg-transparent text-slate-800 hover:border-border/80 hover:bg-white/24 hover:text-slate-950"
        : "border-transparent bg-transparent text-muted-foreground hover:border-border/70 hover:bg-background/55 hover:text-foreground",
  );
}

function PtHubThemeToggle({
  mode,
  onToggle,
}: {
  mode: PtHubThemeMode;
  onToggle: () => void;
}) {
  const isLightMode = mode === "light";

  return (
    <button
      type="button"
      role="switch"
      aria-checked={isLightMode}
      onClick={onToggle}
      aria-label={
        isLightMode
          ? "Switch PT Hub to dark mode"
          : "Switch PT Hub to light mode"
      }
      className={cn(
        "group relative inline-flex h-[30px] w-[92px] items-center rounded-full border px-1 backdrop-blur-2xl transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-0",
        isLightMode
          ? "border-black/10 bg-[linear-gradient(180deg,rgba(232,239,235,0.72),rgba(216,225,219,0.62))] text-foreground shadow-[0_16px_32px_-24px_rgba(15,23,42,0.18)]"
          : "border-white/12 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))] text-foreground shadow-[0_16px_30px_-24px_rgba(0,0,0,0.78)]",
      )}
    >
      <span
        className={cn(
          "pointer-events-none absolute top-1/2 h-[22px] w-[42px] -translate-y-1/2 rounded-full transition-all duration-200",
          isLightMode
            ? "left-[45px] border border-slate-900/85 bg-slate-900 shadow-[0_10px_18px_-12px_rgba(15,23,42,0.5)]"
            : "left-1 border border-white/12 bg-[linear-gradient(180deg,oklch(var(--accent)),oklch(var(--chart-2)))] shadow-[0_10px_18px_-12px_oklch(var(--accent)/0.6)]",
        )}
      />
      <span
        className={cn(
          "pointer-events-none absolute inset-[3px] rounded-full",
          isLightMode
            ? "bg-[linear-gradient(180deg,rgba(255,255,255,0.16),rgba(255,255,255,0.04))]"
            : "bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.01))]",
        )}
      />
      <span className="relative z-10 grid w-full grid-cols-2 items-center">
        <span
          className={cn(
            "flex h-[22px] items-center justify-center transition-colors duration-200",
            isLightMode ? "text-foreground/45" : "text-slate-950",
          )}
        >
          <Moon className="h-3.5 w-3.5" />
        </span>
        <span
          className={cn(
            "flex h-[22px] items-center justify-center transition-colors duration-200",
            isLightMode ? "text-white" : "text-foreground/45",
          )}
        >
          <Sun className="h-3.5 w-3.5" />
        </span>
      </span>
    </button>
  );
}

export function PtHubLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { workspaceId, switchWorkspace } = useWorkspace();
  const workspacesQuery = usePtHubWorkspaces();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [themeMode, setThemeMode] = useState<PtHubThemeMode>("dark");
  const [isScrollActive, setIsScrollActive] = useState(false);

  const meta = routeMeta[location.pathname] ?? defaultRouteMeta;
  const workspaces = workspacesQuery.data ?? [];
  const latestWorkspace = workspaces[0] ?? null;
  const currentWorkspace =
    workspaces.find((workspace) => workspace.id === workspaceId) ??
    latestWorkspace;
  const breadcrumbSegments = ["PT Hub", meta.title];
  const userInitial = (
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
    if (typeof window === "undefined") return;

    let scrollTimeout = 0;
    const handleScroll = () => {
      setIsScrollActive(true);
      window.clearTimeout(scrollTimeout);
      scrollTimeout = window.setTimeout(() => {
        setIsScrollActive(false);
      }, 90);
    };

    window.addEventListener("scroll", handleScroll, { passive: true });

    return () => {
      window.removeEventListener("scroll", handleScroll);
      window.clearTimeout(scrollTimeout);
    };
  }, []);

  const signOut = async () => {
    setIsSigningOut(true);
    await supabase.auth.signOut();
    navigate("/login", { replace: true });
  };

  return (
    <div
      className={cn(
        "pt-hub-theme theme-shell-canvas relative min-h-screen overflow-hidden",
        isScrollActive && "pt-hub-scroll-active",
        themeMode === "light" ? "pt-hub-theme-light" : "pt-hub-theme-dark",
      )}
    >
      <PtHubAnimatedBackground mode={themeMode} scrollActive={isScrollActive} />

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
                Repsync PT Hub
              </p>
              <p className="text-sm text-muted-foreground">Trainer workspace</p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setMobileOpen(false)}
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

      <PageContainer className="relative z-10 py-4 sm:py-5 lg:py-6">
        <div className="grid gap-5 lg:grid-cols-[300px_minmax(0,1fr)] xl:gap-6">
          <aside className="hidden lg:block">
            <div className="sticky top-5">
              <div
                className={cn(
                  "surface-panel-strong min-h-[calc(100vh-2.5rem)] overflow-hidden rounded-[34px] border-border/70",
                  isLightMode
                    ? "shadow-[0_30px_72px_-52px_rgba(15,23,42,0.14)]"
                    : "shadow-[0_40px_100px_-64px_rgba(0,0,0,0.98)]",
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

          <div className="min-w-0 space-y-5">
            <header
              className={cn(
                "surface-panel-strong relative overflow-hidden rounded-[34px] border-border/70 px-4 py-4 sm:px-5 lg:px-6",
                isLightMode
                  ? "shadow-[0_28px_76px_-56px_rgba(15,23,42,0.16)]"
                  : "shadow-[0_32px_90px_-58px_rgba(0,0,0,0.98)]",
              )}
            >
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,oklch(var(--accent)/0.2),transparent_34%),radial-gradient(circle_at_bottom_left,oklch(var(--chart-2)/0.12),transparent_30%),linear-gradient(135deg,transparent,oklch(var(--success)/0.06))]" />
              <div
                className={cn(
                  "pointer-events-none absolute inset-x-6 top-0 h-px",
                  isLightMode
                    ? "bg-[linear-gradient(90deg,transparent,rgba(15,23,42,0.12),transparent)]"
                    : "bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.28),transparent)]",
                )}
              />
              <div className="relative flex flex-wrap items-start justify-between gap-4">
                <div className="flex min-w-0 items-start gap-3">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="mt-1 lg:hidden"
                    onClick={() => setMobileOpen(true)}
                  >
                    <Menu className="h-5 w-5 [stroke-width:1.7]" />
                    <span className="sr-only">Open PT Hub navigation</span>
                  </Button>
                  <div className="min-w-0 space-y-3">
                    <div className="space-y-1.5">
                      <nav
                        aria-label="Breadcrumb"
                        className="text-xs text-muted-foreground"
                      >
                        <ol className="flex flex-wrap items-center gap-2 uppercase tracking-[0.22em]">
                          {breadcrumbSegments.map((segment, index) => (
                            <li
                              key={segment}
                              className="flex items-center gap-2"
                            >
                              {index > 0 ? (
                                <span aria-hidden="true">/</span>
                              ) : null}
                              <span>{segment}</span>
                            </li>
                          ))}
                        </ol>
                      </nav>
                      <p className="text-[2.15rem] font-semibold uppercase tracking-[0.06em] text-foreground sm:text-[2.45rem]">
                        {meta.title}
                      </p>
                      <p className="max-w-2xl text-[0.95rem] leading-6 text-muted-foreground">
                        {meta.description}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
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
                        <div className="min-w-0 flex-1 space-y-0.5">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-primary/80">
                            Profile
                          </p>
                          <p className="max-w-[138px] truncate text-[0.92rem] font-medium text-foreground">
                            {user?.email ?? "Trainer account"}
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
                      align="end"
                      sideOffset={10}
                      className={getPtHubDropdownContentClassName(isLightMode)}
                    >
                      <DropdownMenuLabel
                        className={getPtHubDropdownLabelClassName(isLightMode)}
                      >
                        <span className="block text-[11px] font-semibold uppercase tracking-[0.24em] text-primary/75">
                          Account
                        </span>
                        <span className="mt-1 block truncate text-sm font-medium text-foreground">
                          {user?.email ?? "Trainer account"}
                        </span>
                      </DropdownMenuLabel>
                      <DropdownMenuSeparator
                        className={getPtHubDropdownSeparatorClassName(
                          isLightMode,
                        )}
                      />
                      <div
                        className={getPtHubDropdownUtilityRowClassName(
                          isLightMode,
                        )}
                      >
                        <div className="flex min-w-0 items-center gap-2.5">
                          <span
                            className={getPtHubDropdownGlyphClassName(
                              isLightMode,
                            )}
                          >
                            <Moon className="h-4 w-4 [stroke-width:1.7]" />
                          </span>
                          <span className="truncate font-medium text-foreground">
                            Theme
                          </span>
                        </div>
                        <PtHubThemeToggle
                          mode={themeMode}
                          onToggle={() =>
                            setThemeMode((current) =>
                              current === "dark" ? "light" : "dark",
                            )
                          }
                        />
                      </div>
                      <DropdownMenuSeparator
                        className={getPtHubDropdownSeparatorClassName(
                          isLightMode,
                        )}
                      />
                      <DropdownMenuItem
                        className={cn(
                          "mt-1",
                          getPtHubDropdownItemClassName(isLightMode),
                        )}
                        onClick={() => navigate("/pt-hub/settings")}
                      >
                        <span
                          className={cn(
                            "mr-3",
                            getPtHubDropdownGlyphClassName(isLightMode),
                          )}
                        >
                          <SlidersHorizontal className="h-4 w-4 [stroke-width:1.7]" />
                        </span>
                        <span className="font-medium text-foreground">
                          Settings
                        </span>
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className={getPtHubDropdownItemClassName(isLightMode)}
                        disabled={isSigningOut}
                        onClick={() => {
                          void signOut();
                        }}
                      >
                        <span
                          className={cn(
                            "mr-3",
                            getPtHubDropdownGlyphClassName(isLightMode),
                          )}
                        >
                          <LogOut className="h-4 w-4 [stroke-width:1.7]" />
                        </span>
                        <span className="font-medium text-foreground">
                          {isSigningOut ? "Signing out..." : "Sign out"}
                        </span>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
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
                        <div className="min-w-0 flex-1 space-y-0.5 text-left">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-primary/80">
                            Coaching space
                          </p>
                          <p className="max-w-[138px] truncate text-[0.92rem] font-medium text-foreground">
                            {currentWorkspace?.name ?? "No workspace selected"}
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
                      align="end"
                      sideOffset={10}
                      className={cn(
                        getPtHubDropdownContentClassName(isLightMode),
                        "w-72",
                      )}
                    >
                      <DropdownMenuLabel
                        className={getPtHubDropdownLabelClassName(isLightMode)}
                      >
                        <span className="block text-[11px] font-semibold uppercase tracking-[0.24em] text-primary/75">
                          Coaching Spaces
                        </span>
                      </DropdownMenuLabel>
                      <DropdownMenuSeparator
                        className={getPtHubDropdownSeparatorClassName(
                          isLightMode,
                        )}
                      />
                      <DropdownMenuItem
                        className={cn(
                          "mt-1 px-3 py-3",
                          getPtHubDropdownItemClassName(isLightMode),
                        )}
                        onClick={() => navigate("/pt-hub")}
                      >
                        <div className="flex min-w-0 flex-1 items-center gap-3">
                          <span
                            className={cn(
                              "flex h-8 w-8 shrink-0 items-center justify-center rounded-[12px] transition-colors duration-200",
                              isLightMode ? "text-slate-600" : "text-primary",
                            )}
                          >
                            <PanelsTopLeft className="h-4 w-4 [stroke-width:1.7]" />
                          </span>
                          <p className="truncate font-medium text-foreground">
                            Repsync PT Hub
                          </p>
                        </div>
                        {location.pathname.startsWith("/pt-hub") ? (
                          <Check className="h-4 w-4 text-primary [stroke-width:1.9]" />
                        ) : null}
                      </DropdownMenuItem>
                      {workspaces.map((workspace) => (
                        <DropdownMenuItem
                          key={workspace.id}
                          className={cn(
                            "mt-1 px-3 py-3",
                            getPtHubDropdownItemClassName(isLightMode),
                          )}
                          onClick={() => {
                            switchWorkspace(workspace.id);
                            navigate("/pt/dashboard");
                          }}
                        >
                          <div className="flex min-w-0 flex-1 items-center gap-3">
                            <span
                              className={cn(
                                "flex h-8 w-8 shrink-0 items-center justify-center rounded-[12px] transition-colors duration-200",
                                isLightMode ? "text-slate-600" : "text-primary",
                              )}
                            >
                              <Building className="h-4 w-4 [stroke-width:1.7]" />
                            </span>
                            <p className="truncate font-medium text-foreground">
                              {workspace.name}
                            </p>
                          </div>
                          <div className="ml-3 flex shrink-0 items-center gap-2">
                            <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                              {workspace.clientCount ?? 0}
                            </span>
                            {workspace.id === currentWorkspace?.id ? (
                              <Check className="h-4 w-4 text-primary [stroke-width:1.9]" />
                            ) : null}
                          </div>
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            </header>

            <main className="min-w-0">
              <Outlet />
            </main>
          </div>
        </div>
      </PageContainer>
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
  const isLightMode = themeMode === "light";

  return (
    <div className={cn("flex h-full min-h-0 flex-col px-5 py-5", className)}>
      <div className="space-y-4 border-b border-border/60 pb-5">
        <div className="flex items-start gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[18px] border border-primary/16 bg-background/22 text-primary backdrop-blur-xl">
            <Building className="h-5 w-5 [stroke-width:1.7]" />
          </div>
          <div className="min-w-0 space-y-1">
            <p
              className={cn(
                "text-[1.15rem] font-semibold uppercase tracking-[0.05em]",
                isLightMode ? "text-slate-950" : "text-foreground",
              )}
            >
              Repsync PT Hub
            </p>
            <p
              className={cn(
                "text-sm leading-5",
                isLightMode ? "text-slate-600" : "text-muted-foreground",
              )}
            >
              Manage clients, inquiries, and your public profile.
            </p>
          </div>
        </div>
      </div>

      <nav className="mt-5 flex-1 overflow-y-auto pr-1 lg:flex lg:flex-col lg:justify-center lg:gap-6">
        {hubNavGroups.map((group) => (
          <div key={group.label} className="space-y-2.5">
            <p
              className={cn(
                "px-2 text-[10px] font-semibold uppercase tracking-[0.32em]",
                isLightMode ? "text-slate-500" : "text-muted-foreground/80",
              )}
            >
              {group.label}
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
                    className={({ isActive }) => sidebarLinkClasses(isActive, isLightMode)}
                  >
                    {({ isActive }) => (
                      <>
                        <span
                          className={cn(
                            "flex h-10 w-10 shrink-0 items-center justify-center rounded-[15px] border transition-colors",
                            isActive
                              ? "border-primary/20 bg-primary/10 text-primary"
                              : isLightMode
                                ? "border-slate-400/40 bg-[linear-gradient(180deg,rgba(245,248,246,0.34),rgba(228,235,231,0.22))] text-slate-600 group-hover:border-primary/22 group-hover:text-primary"
                                : "border-border/70 bg-background/75 text-muted-foreground group-hover:border-primary/20 group-hover:text-primary",
                          )}
                        >
                          <Icon className="h-4 w-4 [stroke-width:1.7]" />
                        </span>
                        <div className="min-w-0">
                          <p className={cn(isLightMode ? "text-slate-900" : "text-inherit")}>
                            {item.label}
                          </p>
                          <p
                            className={cn(
                              "text-xs leading-4.5",
                              isLightMode
                                ? "text-slate-600"
                                : "text-muted-foreground",
                            )}
                          >
                            {navDescriptions[item.label]}
                          </p>
                        </div>
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

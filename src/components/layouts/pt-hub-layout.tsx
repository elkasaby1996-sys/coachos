import { useState } from "react";
import {
  Building,
  Check,
  ChevronDown,
  Globe,
  LogOut,
  Menu,
  MessageSquarePlus,
  PanelsTopLeft,
  SlidersHorizontal,
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
    items: [{ label: "Settings", to: "/pt-hub/settings", icon: SlidersHorizontal }],
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
    description:
      "Update the public trainer page clients will see.",
  },
  "/pt-hub/profile/preview": {
    title: "Profile Preview",
    description:
      "Preview your public trainer page before sharing it.",
  },
  "/pt-hub/leads": {
    title: "Leads",
    description:
      "Review new inquiries and follow up faster.",
  },
  "/pt-hub/clients": {
    title: "Clients",
    description:
      "See every client across your coaching spaces.",
  },
  "/pt-hub/workspaces": {
    title: "Coaching Spaces",
    description:
      "Open, create, and manage your coaching spaces.",
  },
  "/pt-hub/payments": {
    title: "Payments",
    description:
      "Check billing, invoices, and revenue at a glance.",
  },
  "/pt-hub/analytics": {
    title: "Analytics",
    description:
      "Track inquiries, conversions, and client growth.",
  },
  "/pt-hub/settings": {
    title: "Account Settings",
    description:
      "Manage account details, notifications, and profile visibility.",
  },
};

const defaultRouteMeta = routeMeta["/pt-hub"]!;
const ptHubDropdownContentClassName =
  "w-60 rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(14,18,16,0.96),rgba(8,10,9,0.94))] p-2 text-foreground shadow-[0_32px_80px_-42px_rgba(0,0,0,0.96)] backdrop-blur-3xl";
const ptHubDropdownItemClassName =
  "rounded-[16px] px-3 py-2.5 text-sm text-foreground focus:bg-[rgba(255,255,255,0.06)] focus:text-foreground data-[highlighted]:bg-[rgba(255,255,255,0.06)] data-[highlighted]:text-foreground";
const ptHubHeaderPillClassName =
  "hidden h-[60px] w-[240px] items-center gap-3 rounded-[22px] border border-white/10 bg-[linear-gradient(180deg,rgba(17,22,20,0.94),rgba(10,13,12,0.9))] px-3 py-2 text-left shadow-[0_24px_54px_-38px_rgba(0,0,0,0.9)] backdrop-blur-2xl transition-all duration-200 hover:border-primary/18 hover:bg-[linear-gradient(180deg,rgba(20,26,23,0.96),rgba(12,16,14,0.92))] sm:flex";
const ptHubHeaderPillIconClassName =
  "flex h-10 w-10 shrink-0 items-center justify-center rounded-[18px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.03))] text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]";

function sidebarLinkClasses(isActive: boolean) {
  return cn(
    "group relative flex items-start gap-3 rounded-[20px] border px-3 py-3 text-sm font-medium transition-all duration-200 cursor-pointer",
    isActive
      ? "border-primary/25 bg-[linear-gradient(180deg,oklch(var(--bg-surface-elevated)/0.98),oklch(var(--bg-surface)/0.94))] text-foreground shadow-[0_20px_48px_-34px_oklch(var(--accent)/0.38)]"
      : "border-transparent bg-transparent text-muted-foreground hover:border-border/70 hover:bg-background/55 hover:text-foreground",
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

  const meta = routeMeta[location.pathname] ?? defaultRouteMeta;
  const workspaces = workspacesQuery.data ?? [];
  const latestWorkspace = workspaces[0] ?? null;
  const currentWorkspace =
    workspaces.find((workspace) => workspace.id === workspaceId) ?? latestWorkspace;
  const breadcrumbSegments = ["PT Hub", meta.title];
  const userInitial = (
    user?.email?.charAt(0) ||
    user?.phone?.charAt(0) ||
    "P"
  ).toUpperCase();

  const signOut = async () => {
    setIsSigningOut(true);
    await supabase.auth.signOut();
    navigate("/login", { replace: true });
  };

  return (
    <div className="pt-hub-theme theme-shell-canvas relative min-h-screen overflow-hidden">
      <PtHubAnimatedBackground />

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
                CoachOS PT Hub
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
            onNavigate={() => setMobileOpen(false)}
          />
        </div>
      </aside>

      <PageContainer className="relative py-4 sm:py-5 lg:py-6">
        <div className="grid gap-5 lg:grid-cols-[300px_minmax(0,1fr)] xl:gap-6">
          <aside className="hidden lg:block">
            <div className="sticky top-5">
              <div className="surface-panel-strong min-h-[calc(100vh-2.5rem)] overflow-hidden rounded-[32px] border-border/70">
                <SidebarContent
                  onLogout={signOut}
                  isSigningOut={isSigningOut}
                />
              </div>
            </div>
          </aside>

          <div className="min-w-0 space-y-5">
            <header className="surface-panel-strong relative overflow-hidden rounded-[32px] border-border/70 px-4 py-4 sm:px-5 lg:px-6">
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,oklch(var(--accent)/0.16),transparent_36%),radial-gradient(circle_at_bottom_left,oklch(var(--chart-2)/0.12),transparent_30%),linear-gradient(135deg,transparent,oklch(var(--success)/0.05))]" />
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
                      <nav aria-label="Breadcrumb" className="text-xs text-muted-foreground">
                        <ol className="flex flex-wrap items-center gap-2 uppercase tracking-[0.22em]">
                          {breadcrumbSegments.map((segment, index) => (
                            <li key={segment} className="flex items-center gap-2">
                              {index > 0 ? <span aria-hidden="true">/</span> : null}
                              <span>{segment}</span>
                            </li>
                          ))}
                        </ol>
                      </nav>
                      <p className="text-[2rem] font-semibold uppercase tracking-[0.03em] text-foreground">
                        {meta.title}
                      </p>
                      <p className="max-w-2xl text-sm leading-5 text-muted-foreground">
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
                        className={ptHubHeaderPillClassName}
                      >
                        <div className={ptHubHeaderPillIconClassName}>
                          {userInitial}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="max-w-[150px] truncate text-sm font-medium text-foreground">
                            {user?.email ?? "Trainer account"}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Trainer account
                          </p>
                        </div>
                        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground [stroke-width:1.7]" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      align="end"
                      sideOffset={10}
                      className={ptHubDropdownContentClassName}
                    >
                      <DropdownMenuLabel className="px-3 py-2">
                        <span className="block text-[11px] font-semibold uppercase tracking-[0.24em] text-primary/75">
                          Account
                        </span>
                        <span className="mt-1 block truncate text-sm font-medium text-foreground">
                          {user?.email ?? "Trainer account"}
                        </span>
                      </DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className={cn("mt-1", ptHubDropdownItemClassName)}
                        onClick={() => navigate("/pt-hub/settings")}
                      >
                        <SlidersHorizontal className="mr-2 h-4 w-4 [stroke-width:1.7]" />
                        Settings
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className={ptHubDropdownItemClassName}
                        disabled={isSigningOut}
                        onClick={() => {
                          void signOut();
                        }}
                      >
                        <LogOut className="mr-2 h-4 w-4 [stroke-width:1.7]" />
                        {isSigningOut ? "Signing out..." : "Sign out"}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        disabled={workspaces.length === 0}
                        className={cn(
                          ptHubHeaderPillClassName,
                          workspaces.length === 0 && "cursor-not-allowed opacity-50",
                        )}
                      >
                        <div className={ptHubHeaderPillIconClassName}>
                          <Building className="h-4 w-4 [stroke-width:1.7]" />
                        </div>
                        <div className="min-w-0 flex-1 text-left">
                          <p className="max-w-[150px] truncate text-sm font-medium text-foreground">
                            Open workspace
                          </p>
                          <p className="max-w-[150px] truncate text-xs text-muted-foreground">
                            {currentWorkspace?.name ?? "No workspace selected"}
                          </p>
                        </div>
                        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground [stroke-width:1.7]" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      align="end"
                      sideOffset={10}
                      className={cn(ptHubDropdownContentClassName, "w-72")}
                    >
                      <DropdownMenuLabel className="px-3 py-2">
                        <span className="block text-[11px] font-semibold uppercase tracking-[0.24em] text-primary/75">
                          Coaching Spaces
                        </span>
                        <span className="mt-1 block text-sm font-medium text-foreground">
                          Choose a workspace to open
                        </span>
                      </DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      {workspaces.map((workspace) => (
                        <DropdownMenuItem
                          key={workspace.id}
                          className={cn("mt-1 px-3 py-3", ptHubDropdownItemClassName)}
                          onClick={() => {
                            switchWorkspace(workspace.id);
                            navigate("/pt/dashboard");
                          }}
                        >
                          <div className="flex min-w-0 flex-1 items-center gap-3">
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[14px] border border-white/10 bg-[rgba(255,255,255,0.04)] text-muted-foreground">
                              <Building className="h-4 w-4 [stroke-width:1.7]" />
                            </span>
                            <div className="min-w-0">
                              <p className="truncate font-medium text-foreground">
                                {workspace.name}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {workspace.clientCount ?? 0} clients
                              </p>
                            </div>
                          </div>
                          {workspace.id === currentWorkspace?.id ? (
                            <Check className="ml-3 h-4 w-4 shrink-0 text-primary [stroke-width:1.9]" />
                          ) : null}
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
  onNavigate,
}: {
  className?: string;
  onLogout: () => Promise<void>;
  isSigningOut: boolean;
  onNavigate?: () => void;
}) {
  return (
    <div className={cn("flex h-full min-h-0 flex-col px-5 py-5", className)}>
      <div className="space-y-4 border-b border-border/60 pb-5">
        <div className="flex items-start gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[18px] border border-primary/16 bg-background/22 text-primary backdrop-blur-xl">
            <Building className="h-5 w-5 [stroke-width:1.7]" />
          </div>
          <div className="min-w-0 space-y-1">
            <p className="text-lg font-semibold tracking-tight text-foreground">
              CoachOS PT Hub
            </p>
            <p className="text-sm leading-5 text-muted-foreground">
              Manage clients, inquiries, and your public profile.
            </p>
          </div>
        </div>
      </div>

      <nav className="mt-5 flex-1 overflow-y-auto pr-1 lg:flex lg:flex-col lg:justify-center lg:gap-6">
        {hubNavGroups.map((group) => (
          <div key={group.label} className="space-y-2.5">
            <p className="px-2 text-[10px] font-semibold uppercase tracking-[0.28em] text-muted-foreground/80">
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
                    className={({ isActive }) => sidebarLinkClasses(isActive)}
                  >
                    {({ isActive }) => (
                      <>
                        <span
                          className={cn(
                            "absolute left-0 top-3 h-7 w-1 rounded-full transition-opacity",
                            isActive ? "bg-primary opacity-100" : "opacity-0",
                          )}
                        />
                        <span
                          className={cn(
                            "flex h-10 w-10 shrink-0 items-center justify-center rounded-[15px] border transition-colors",
                            isActive
                              ? "border-primary/20 bg-primary/10 text-primary"
                              : "border-border/70 bg-background/75 text-muted-foreground group-hover:border-primary/20 group-hover:text-primary",
                          )}
                        >
                          <Icon className="h-4 w-4 [stroke-width:1.7]" />
                        </span>
                        <div className="min-w-0">
                          <p>{item.label}</p>
                          <p className="text-xs leading-4.5 text-muted-foreground">
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

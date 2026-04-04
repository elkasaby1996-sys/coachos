import { useState } from "react";
import {
  ArrowUpRight,
  BarChart3,
  Building2,
  ChevronRight,
  ClipboardList,
  Eye,
  LayoutDashboard,
  LogOut,
  Menu,
  ReceiptText,
  Settings,
  UserCircle2,
  Users,
  X,
} from "lucide-react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { PageContainer } from "../common/page-container";
import { cn } from "../../lib/utils";
import { useAuth } from "../../lib/auth";
import { useWorkspace } from "../../lib/use-workspace";
import { usePtHubWorkspaces } from "../../features/pt-hub/lib/pt-hub";
import { supabase } from "../../lib/supabase";

const hubNavGroups = [
  {
    label: "Main",
    items: [
      { label: "Overview", to: "/pt-hub", icon: LayoutDashboard, end: true },
      { label: "Public Profile", to: "/pt-hub/profile", icon: UserCircle2 },
      { label: "Profile Preview", to: "/pt-hub/profile/preview", icon: Eye },
    ],
  },
  {
    label: "Business",
    items: [
      { label: "Leads", to: "/pt-hub/leads", icon: ClipboardList },
      { label: "Clients", to: "/pt-hub/clients", icon: Users },
      { label: "Workspaces", to: "/pt-hub/workspaces", icon: Building2 },
      { label: "Payments", to: "/pt-hub/payments", icon: ReceiptText },
      { label: "Analytics", to: "/pt-hub/analytics", icon: BarChart3 },
    ],
  },
  {
    label: "System",
    items: [{ label: "Settings", to: "/pt-hub/settings", icon: Settings }],
  },
] as const;

const navDescriptions: Record<string, string> = {
  Overview: "Business command center",
  "Public Profile": "Trainer brand editor",
  "Profile Preview": "Public-facing preview",
  Leads: "Applications CRM",
  Clients: "Cross-workspace portfolio",
  Workspaces: "Coaching layer entry",
  Payments: "Billing structure",
  Analytics: "Business metrics",
  Settings: "Account and visibility",
};

const routeMeta: Record<string, { title: string; description: string }> = {
  "/pt-hub": {
    title: "Overview",
    description: "Business-level control center for your training operation.",
  },
  "/pt-hub/profile": {
    title: "Public Profile Manager",
    description:
      "Shape how your trainer brand will appear when public surfaces go live.",
  },
  "/pt-hub/profile/preview": {
    title: "Profile Preview",
    description:
      "Preview the internal rendering of your future public trainer page.",
  },
  "/pt-hub/leads": {
    title: "Leads",
    description:
      "Track inbound applications and progress them through the PT Hub pipeline.",
  },
  "/pt-hub/clients": {
    title: "Clients",
    description:
      "Monitor your client base across all owned workspaces from one business-level view.",
  },
  "/pt-hub/workspaces": {
    title: "Workspaces",
    description:
      "Own the portfolio of coaching workspaces without dropping into day-to-day ops too early.",
  },
  "/pt-hub/payments": {
    title: "Payments",
    description:
      "Review platform billing structure and the future business revenue layer.",
  },
  "/pt-hub/analytics": {
    title: "Analytics",
    description:
      "Read trainer-level business signals across leads, clients, and profile readiness.",
  },
  "/pt-hub/settings": {
    title: "Account Settings",
    description:
      "Trainer account preferences, contact details, and future business controls.",
  },
};

const defaultRouteMeta = routeMeta["/pt-hub"]!;

function sidebarLinkClasses(isActive: boolean) {
  return cn(
    "group relative flex items-center gap-3 rounded-2xl border px-3 py-3 text-sm font-medium transition-colors",
    isActive
      ? "border-border/80 bg-card/78 text-foreground"
      : "border-transparent text-muted-foreground hover:border-border/60 hover:bg-card/45 hover:text-foreground",
  );
}

export function PtHubLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { switchWorkspace } = useWorkspace();
  const workspacesQuery = usePtHubWorkspaces();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);

  const meta = routeMeta[location.pathname] ?? defaultRouteMeta;
  const latestWorkspace = workspacesQuery.data?.[0] ?? null;
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
    <div className="theme-shell-canvas min-h-screen">
      <div className="flex min-h-screen">
        <aside className="theme-sidebar-surface hidden w-[306px] border-r border-border/70 px-5 py-6 md:flex md:flex-col">
          <SidebarContent
            latestWorkspaceName={latestWorkspace?.name ?? null}
            onOpenWorkspace={() => {
              if (!latestWorkspace) return;
              switchWorkspace(latestWorkspace.id);
              navigate("/pt/dashboard");
            }}
            onLogout={signOut}
            isSigningOut={isSigningOut}
          />
        </aside>

        <div
          className={cn(
            "theme-overlay fixed inset-0 z-40 backdrop-blur-sm transition md:hidden",
            mobileOpen ? "opacity-100" : "pointer-events-none opacity-0",
          )}
          onClick={() => setMobileOpen(false)}
          aria-hidden={!mobileOpen}
        />
        <aside
          className={cn(
            "theme-sidebar-surface fixed inset-y-0 left-0 z-50 w-[306px] border-r border-border/70 px-5 py-6 transition md:hidden",
            mobileOpen ? "translate-x-0" : "-translate-x-full",
          )}
        >
          <div className="mb-6 flex items-center justify-between">
            <div>
              <p className="text-lg font-semibold tracking-tight text-foreground">
                CoachOS PT Hub
              </p>
              <p className="text-sm text-muted-foreground">Business layer</p>
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
            latestWorkspaceName={latestWorkspace?.name ?? null}
            onOpenWorkspace={() => {
              if (!latestWorkspace) return;
              setMobileOpen(false);
              switchWorkspace(latestWorkspace.id);
              navigate("/pt/dashboard");
            }}
            onLogout={signOut}
            isSigningOut={isSigningOut}
            onNavigate={() => setMobileOpen(false)}
          />
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="theme-topbar border-b border-border/70 backdrop-blur-xl">
            <PageContainer className="max-w-[1560px] py-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex min-w-0 items-start gap-3">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="mt-1 md:hidden"
                    onClick={() => setMobileOpen(true)}
                  >
                    <Menu className="h-5 w-5" />
                    <span className="sr-only">Open PT Hub navigation</span>
                  </Button>
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="secondary">PT Hub</Badge>
                      <span className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                        Business layer
                      </span>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
                        PT Hub / {meta.title}
                      </p>
                      <p className="text-lg font-semibold tracking-tight text-foreground">
                        {meta.title}
                      </p>
                      <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
                        {meta.description}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant="secondary"
                    disabled={!latestWorkspace}
                    className="justify-between"
                    onClick={() => {
                      if (!latestWorkspace) return;
                      switchWorkspace(latestWorkspace.id);
                      navigate("/pt/dashboard");
                    }}
                  >
                    Open workspace
                    <ArrowUpRight className="h-4 w-4" />
                  </Button>
                  <div className="flex h-10 w-10 items-center justify-center rounded-full border border-border/70 bg-card/82 text-sm font-semibold text-foreground">
                    {userInitial}
                  </div>
                </div>
              </div>
            </PageContainer>
          </div>

          <main className="flex-1">
            <PageContainer className="max-w-[1560px] py-8 sm:py-10">
              <Outlet />
            </PageContainer>
          </main>
        </div>
      </div>
    </div>
  );
}

function SidebarContent({
  latestWorkspaceName,
  onOpenWorkspace,
  onLogout,
  isSigningOut,
  onNavigate,
}: {
  latestWorkspaceName: string | null;
  onOpenWorkspace: () => void;
  onLogout: () => Promise<void>;
  isSigningOut: boolean;
  onNavigate?: () => void;
}) {
  return (
    <>
      <div className="mb-8">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-border/70 bg-card/65 text-primary">
            <Building2 className="h-5 w-5" />
          </div>
          <div>
            <p className="text-lg font-semibold tracking-tight text-foreground">
              CoachOS
            </p>
            <p className="text-sm text-muted-foreground">
              PT Hub business layer
            </p>
          </div>
        </div>
      </div>

      <div className="surface-panel mb-6 rounded-[28px] p-5">
        <div className="space-y-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-primary/80">
            Business Layer
          </p>
          <p className="text-xl font-semibold tracking-tight text-foreground">
            Run the business here.
          </p>
          <p className="text-sm leading-6 text-muted-foreground">
            Brand, leads, portfolio visibility, and account controls live here.
          </p>
        </div>

        <div className="surface-section mt-5 p-4">
          <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
            Workspace layer
          </p>
          <p className="mt-2 text-base font-medium text-foreground">
            {latestWorkspaceName || "No workspace selected"}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Coaching operations stay separate.
          </p>
          <Button
            variant="secondary"
            className="mt-4 w-full justify-between"
            disabled={!latestWorkspaceName}
            onClick={onOpenWorkspace}
          >
            <span>Open workspace</span>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <nav className="flex flex-1 flex-col gap-5">
        {hubNavGroups.map((group) => (
          <div key={group.label} className="space-y-2">
            <p className="px-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
              {group.label}
            </p>
            <div className="space-y-1.5">
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
                            "absolute left-0 top-3 h-8 w-1 rounded-full transition-opacity",
                            isActive ? "bg-primary opacity-100" : "opacity-0",
                          )}
                        />
                        <span
                          className={cn(
                            "flex h-10 w-10 items-center justify-center rounded-xl border",
                            isActive
                              ? "border-primary/20 bg-primary/10 text-primary"
                              : "border-border/70 bg-card/68 text-muted-foreground group-hover:text-primary",
                          )}
                        >
                          <Icon className="h-4 w-4" />
                        </span>
                        <div className="min-w-0">
                          <p>{item.label}</p>
                          <p className="text-xs text-muted-foreground">
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

      <div className="surface-section mt-6 p-4">
        <p className="text-sm font-medium text-foreground">Session</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Use PT Hub first. Open a workspace only when you need operational
          depth.
        </p>
        <Button
          variant="ghost"
          className="mt-3 w-full justify-between text-muted-foreground hover:text-foreground"
          disabled={isSigningOut}
          onClick={() => {
            void onLogout();
          }}
        >
          <span>{isSigningOut ? "Signing out..." : "Sign out"}</span>
          <LogOut className="h-4 w-4" />
        </Button>
      </div>
    </>
  );
}

import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Apple,
  ArrowUpRight,
  BookOpen,
  Building2,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  ClipboardList,
  Dumbbell,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageCircle,
  Plus,
  Search,
  Settings,
  Sparkles,
  Users,
  X,
} from "lucide-react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { NotificationBell } from "../../features/notifications/components/notification-bell";
import { useAuth } from "../../lib/auth";
import { supabase } from "../../lib/supabase";
import { cn } from "../../lib/utils";
import { useWorkspace } from "../../lib/use-workspace";
import { LoadingScreen } from "../common/bootstrap-gate";
import { PageContainer } from "../common/page-container";
import { ThemeModeSwitch } from "../common/theme-mode-switch";
import { useTheme } from "../common/theme-provider";
import { InviteClientDialog } from "../pt/invite-client-dialog";
import { Button } from "../ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { Input } from "../ui/input";

const navItems = [
  { label: "Dashboard", to: "/pt/dashboard", icon: LayoutDashboard },
  { label: "Clients", to: "/pt/clients", icon: Users },
  { label: "Programs", to: "/pt/programs", icon: CalendarDays },
  { label: "Calendar", to: "/pt/calendar", icon: CalendarDays },
  { label: "Messages", to: "/pt/messages", icon: MessageCircle },
  { label: "Workouts", to: "/pt/templates/workouts", icon: Dumbbell },
  { label: "Nutrition Programs", to: "/pt/nutrition-programs", icon: Apple },
  { label: "Exercise Library", to: "/pt/settings/exercises", icon: BookOpen },
  { label: "Check-ins", to: "/pt/checkins", icon: ClipboardList },
  { label: "Settings", to: "/settings/workspace", icon: Settings },
] as const;

const workspaceRouteMeta = [
  {
    match: "/pt/dashboard",
    title: "Dashboard",
    description:
      "Operational pulse across clients, check-ins, messages, and next actions.",
  },
  {
    match: "/pt/clients/",
    title: "Client Detail",
    description:
      "Daily coaching view with plans, messages, nutrition, and check-ins.",
  },
  {
    match: "/pt/clients",
    title: "Clients",
    description:
      "Scan your roster quickly, spot risk, and jump straight into execution.",
  },
  {
    match: "/pt/programs/",
    title: "Program Builder",
    description:
      "Build dense, week-by-week training structures without losing speed.",
  },
  {
    match: "/pt/programs",
    title: "Programs",
    description:
      "Create and manage reusable training blocks for active coaching work.",
  },
  {
    match: "/pt/calendar",
    title: "Calendar",
    description:
      "Track scheduled coaching activity, check-ins, and operational timing.",
  },
  {
    match: "/pt/messages",
    title: "Messages",
    description:
      "Stay close to client conversations without leaving the workspace flow.",
  },
  {
    match: "/pt/templates/workouts/",
    title: "Workout Template Builder",
    description:
      "Compose reusable workouts, exercise blocks, and assignment-ready sessions.",
  },
  {
    match: "/pt/templates/workouts",
    title: "Workouts",
    description:
      "Template library for fast programming and assignment workflows.",
  },
  {
    match: "/pt/nutrition-programs/",
    title: "Nutrition Builder",
    description:
      "Configure meal structures and nutrition plans for active client delivery.",
  },
  {
    match: "/pt/nutrition-programs",
    title: "Nutrition Programs",
    description:
      "Manage nutrition templates in the same system language as training plans.",
  },
  {
    match: "/pt/checkins/templates",
    title: "Check-in Templates",
    description:
      "Standardize weekly review prompts for faster, repeatable coaching.",
  },
  {
    match: "/pt/checkins",
    title: "Check-ins",
    description:
      "Review queue health, prioritize responses, and keep weekly follow-up moving.",
  },
  {
    match: "/pt/settings/exercises",
    title: "Exercise Library",
    description:
      "Maintain the exercise catalog that powers your workout builders.",
  },
  {
    match: "/settings",
    title: "Workspace Settings",
    description:
      "Workspace identity, defaults, account controls, and operational preferences.",
  },
  {
    match: "/pt/notifications",
    title: "Notifications",
    description:
      "Activity inbox for workspace events that need attention or awareness.",
  },
] as const;

const PT_SIDEBAR_COLLAPSE_KEY = "coachos-pt-sidebar-collapsed";

type WorkspaceSwitcherOption = {
  id: string;
  name: string | null;
};

function WorkspaceSwitcher({
  workspaceDisplayName,
  workspaceSwitcherQuery,
  workspaceOptions,
  workspaceId,
  switchWorkspace,
  onCreateWorkspace,
  onSwitched,
}: {
  workspaceDisplayName: string;
  workspaceSwitcherQuery: {
    isLoading: boolean;
  };
  workspaceOptions: WorkspaceSwitcherOption[];
  workspaceId: string | null;
  switchWorkspace: (workspaceId: string) => void;
  onCreateWorkspace: () => void;
  onSwitched?: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="secondary"
          className="h-auto w-full items-start justify-between rounded-[20px] px-4 py-3 text-left"
          aria-label="Switch workspace"
        >
          <span className="space-y-1">
            <span className="block text-sm font-semibold text-foreground">
              {workspaceDisplayName}
            </span>
            <span className="block text-xs text-muted-foreground">
              Operational layer
            </span>
          </span>
          <ChevronsUpDown className="mt-0.5 h-4 w-4 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>Switch workspace</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {workspaceSwitcherQuery.isLoading ? (
          <DropdownMenuItem disabled>Loading...</DropdownMenuItem>
        ) : workspaceOptions.length === 0 ? (
          <DropdownMenuItem disabled>No workspaces found</DropdownMenuItem>
        ) : (
          workspaceOptions.map((workspace) => (
            <DropdownMenuItem
              key={workspace.id}
              onClick={() => {
                switchWorkspace(workspace.id);
                onSwitched?.();
              }}
            >
              {workspace.name?.trim() || "PT Workspace"}
              {workspace.id === workspaceId ? " (Current)" : ""}
            </DropdownMenuItem>
          ))
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onCreateWorkspace}>
          Create new workspace
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function PtLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const {
    workspaceId,
    workspaceIds,
    loading,
    error,
    switchWorkspace,
    refreshWorkspace,
  } = useWorkspace();
  const { authError, user } = useAuth();
  const { resolvedTheme, toggleTheme } = useTheme();
  const errorMessage =
    error?.message ??
    authError?.message ??
    (workspaceId ? null : "Workspace not found.");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [desktopNavCollapsed, setDesktopNavCollapsed] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [createWorkspaceOpen, setCreateWorkspaceOpen] = useState(false);
  const [newWorkspaceName, setNewWorkspaceName] = useState("");
  const [createWorkspaceError, setCreateWorkspaceError] = useState<
    string | null
  >(null);
  const [isCreatingWorkspace, setIsCreatingWorkspace] = useState(false);
  const workspaceSwitcherQuery = useQuery({
    queryKey: ["pt-workspace-switcher", user?.id, workspaceIds],
    enabled: workspaceIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workspaces")
        .select("id, name")
        .in("id", workspaceIds);
      if (error) throw error;
      const rows = ((data ?? []) as WorkspaceSwitcherOption[]).sort(
        (a, b) => workspaceIds.indexOf(a.id) - workspaceIds.indexOf(b.id),
      );
      return rows;
    },
  });
  const workspaceOptions = workspaceSwitcherQuery.data ?? [];
  const activeWorkspace =
    workspaceOptions.find((workspace) => workspace.id === workspaceId) ?? null;
  const workspaceDisplayName = activeWorkspace?.name?.trim() || "PT Workspace";
  const pageMeta =
    workspaceRouteMeta.find((item) =>
      location.pathname.startsWith(item.match),
    ) ?? workspaceRouteMeta[0];

  const handleCreateWorkspace = async () => {
    const nextName = newWorkspaceName.trim();
    if (!nextName) {
      setCreateWorkspaceError("Workspace name is required.");
      return;
    }

    setIsCreatingWorkspace(true);
    setCreateWorkspaceError(null);
    try {
      const { data, error } = await supabase.rpc("create_workspace", {
        p_name: nextName,
      });
      if (error) throw error;

      const createdWorkspaceId = Array.isArray(data)
        ? ((data[0] as { workspace_id?: string } | undefined)?.workspace_id ??
          null)
        : ((data as { workspace_id?: string } | null)?.workspace_id ?? null);

      if (!createdWorkspaceId) {
        throw new Error("Workspace was created, but no workspace ID returned.");
      }

      switchWorkspace(createdWorkspaceId);
      refreshWorkspace();
      setNewWorkspaceName("");
      setCreateWorkspaceOpen(false);

      await queryClient.invalidateQueries({
        predicate: (query) =>
          query.queryKey.some(
            (part) => typeof part === "string" && part.includes("workspace"),
          ),
      });
    } catch (createError) {
      setCreateWorkspaceError(
        createError instanceof Error
          ? createError.message
          : "Failed to create workspace.",
      );
    } finally {
      setIsCreatingWorkspace(false);
    }
  };

  const signOut = async () => {
    setIsSigningOut(true);
    await supabase.auth.signOut();
    navigate("/login", { replace: true });
  };

  const userInitial = (
    user?.email?.charAt(0) ||
    user?.phone?.charAt(0) ||
    "U"
  ).toUpperCase();

  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = window.localStorage.getItem(PT_SIDEBAR_COLLAPSE_KEY);
    setDesktopNavCollapsed(raw === "1");
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(
      PT_SIDEBAR_COLLAPSE_KEY,
      desktopNavCollapsed ? "1" : "0",
    );
  }, [desktopNavCollapsed]);

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
              <Button size="sm" variant="secondary" onClick={signOut}>
                Sign out
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.06),transparent_24%),linear-gradient(180deg,rgba(13,18,29,1),rgba(10,14,23,1))]">
      <div className="flex min-h-screen">
        <aside
          className={cn(
            "hidden border-r border-border/70 bg-[linear-gradient(180deg,rgba(15,20,32,0.98),rgba(9,13,22,1))] py-6 md:flex md:flex-col",
            desktopNavCollapsed ? "w-24 px-3" : "w-[296px] px-4",
          )}
        >
          <div className="mb-6 flex items-center justify-between">
            <div className={cn(desktopNavCollapsed && "mx-auto")}>
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-border/70 bg-background/40 text-primary">
                  <Sparkles className="h-4 w-4" />
                </div>
                <div className={cn(desktopNavCollapsed && "hidden")}>
                  <span className="text-lg font-semibold tracking-tight text-foreground">
                    CoachOS
                  </span>
                  <p className="text-xs text-muted-foreground">
                    PT Workspace
                  </p>
                </div>
              </div>
            </div>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              onClick={() => setDesktopNavCollapsed((prev) => !prev)}
              aria-label={
                desktopNavCollapsed
                  ? "Expand navigation"
                  : "Collapse navigation"
              }
            >
              {desktopNavCollapsed ? (
                <ChevronRight className="h-4 w-4" />
              ) : (
                <ChevronLeft className="h-4 w-4" />
              )}
            </Button>
          </div>

          {!desktopNavCollapsed ? (
            <div className="mb-6 rounded-[26px] border border-border/70 bg-background/35 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-primary/80">
                Workspace Layer
              </p>
              <div className="mt-3 space-y-3">
                <WorkspaceSwitcher
                  workspaceDisplayName={workspaceDisplayName}
                  workspaceSwitcherQuery={workspaceSwitcherQuery}
                  workspaceOptions={workspaceOptions}
                  workspaceId={workspaceId}
                  switchWorkspace={switchWorkspace}
                  onCreateWorkspace={() => {
                    setCreateWorkspaceError(null);
                    setCreateWorkspaceOpen(true);
                  }}
                />
                <Button
                  variant="ghost"
                  className="w-full justify-between rounded-[20px] border border-border/70 bg-background/55 px-4"
                  onClick={() => navigate("/pt-hub")}
                >
                  <span className="space-y-0.5 text-left">
                    <span className="block text-sm font-medium text-foreground">
                      PT Hub
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      Business/admin
                    </span>
                  </span>
                  <ArrowUpRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ) : (
            <div className="mb-6 flex justify-center">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-border/70 bg-background/45 text-sm font-semibold text-foreground">
                PT
              </div>
            </div>
          )}

          <nav className="flex flex-1 flex-col gap-1.5">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  title={desktopNavCollapsed ? item.label : undefined}
                  className={({ isActive }) =>
                    cn(
                      "group relative flex items-center rounded-2xl border border-transparent text-sm font-medium text-muted-foreground transition hover:border-border/60 hover:bg-background/42 hover:text-foreground",
                      desktopNavCollapsed
                        ? "justify-center px-2 py-2.5"
                        : "gap-3 px-3 py-2.5",
                      isActive && "border-border/70 bg-background/62 text-foreground",
                    )
                  }
                >
                  {({ isActive }) => (
                    <>
                      {!desktopNavCollapsed ? (
                        <span
                          className={cn(
                            "absolute left-0 top-3 h-8 w-1 rounded-full transition-opacity",
                            isActive ? "bg-primary opacity-100" : "opacity-0",
                          )}
                        />
                      ) : null}
                      <span
                        className={cn(
                          "flex h-9 w-9 items-center justify-center rounded-xl border",
                          isActive
                            ? "border-primary/20 bg-primary/10 text-primary"
                            : "border-border/70 bg-background/55 text-muted-foreground group-hover:text-primary",
                        )}
                      >
                        <Icon className="h-4 w-4" />
                      </span>
                      {!desktopNavCollapsed ? item.label : null}
                    </>
                  )}
                </NavLink>
              );
            })}
          </nav>

          {!desktopNavCollapsed ? (
            <div className="mt-6 rounded-[24px] border border-border/70 bg-background/35 p-4 text-xs text-muted-foreground">
              <p className="text-sm font-medium text-foreground">
                Operational mode
              </p>
              <p className="mt-1 leading-5">
                Built for queues, follow-ups, and fast client actions.
              </p>
              <Button
                variant="ghost"
                className="mt-3 w-full justify-between rounded-[18px] border border-border/70 bg-background/55"
                size="sm"
                disabled={isSigningOut}
                onClick={signOut}
              >
                {isSigningOut ? "Logging out..." : "Log out"}
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          ) : null}
        </aside>

        <div
          className={cn(
            "fixed inset-0 z-40 bg-background/70 backdrop-blur-sm transition md:hidden",
            mobileNavOpen ? "opacity-100" : "pointer-events-none opacity-0",
          )}
          aria-hidden={!mobileNavOpen}
          onClick={() => setMobileNavOpen(false)}
        />

        <aside
          className={cn(
            "fixed inset-y-0 left-0 z-50 w-72 -translate-x-full border-r border-border/70 bg-[linear-gradient(180deg,rgba(15,20,32,0.99),rgba(9,13,22,1))] px-4 py-6 transition md:hidden",
            mobileNavOpen && "translate-x-0",
          )}
        >
          <div className="mb-6 flex items-center justify-between">
            <div>
              <span className="text-lg font-semibold tracking-tight text-foreground">
                CoachOS
              </span>
              <p className="text-xs text-muted-foreground">PT Workspace</p>
            </div>
            <Button
              size="icon"
              variant="ghost"
              onClick={() => setMobileNavOpen(false)}
            >
              <span className="sr-only">Close navigation</span>
              <X className="h-4 w-4" />
            </Button>
          </div>

          <div className="mb-8 rounded-[24px] border border-border/70 bg-background/35 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-primary/80">
              Workspace Layer
            </p>
            <div className="mt-3 space-y-3">
              <WorkspaceSwitcher
                workspaceDisplayName={workspaceDisplayName}
                workspaceSwitcherQuery={workspaceSwitcherQuery}
                workspaceOptions={workspaceOptions}
                workspaceId={workspaceId}
                switchWorkspace={switchWorkspace}
                onCreateWorkspace={() => {
                  setCreateWorkspaceError(null);
                  setCreateWorkspaceOpen(true);
                }}
                onSwitched={() => setMobileNavOpen(false)}
              />
              <Button
                variant="ghost"
                className="w-full justify-between rounded-[20px] border border-border/70 bg-background/55 px-4"
                onClick={() => {
                  setMobileNavOpen(false);
                  navigate("/pt-hub");
                }}
              >
                <span className="space-y-0.5 text-left">
                  <span className="block text-sm font-medium text-foreground">
                    PT Hub
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    Business/admin
                  </span>
                </span>
                <ArrowUpRight className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <nav className="flex flex-1 flex-col gap-1.5">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  onClick={() => setMobileNavOpen(false)}
                  className={({ isActive }) =>
                    cn(
                      "group flex items-center gap-3 rounded-2xl border border-transparent px-3 py-2.5 text-sm font-medium text-muted-foreground transition hover:border-border/60 hover:bg-background/42 hover:text-foreground",
                      isActive && "border-border/70 bg-background/62 text-foreground",
                    )
                  }
                >
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-border/70 bg-background/55 text-muted-foreground group-hover:text-primary">
                    <Icon className="h-4 w-4" />
                  </span>
                  {item.label}
                </NavLink>
              );
            })}
          </nav>

          <div className="mt-6 rounded-[24px] border border-border/70 bg-background/35 p-4 text-xs text-muted-foreground">
            <p className="text-sm font-medium text-foreground">
              Operational mode
            </p>
            <p className="mt-1 leading-5">
              Keep client actions here. Use PT Hub for business context.
            </p>
            <Button
              variant="ghost"
              className="mt-3 w-full justify-between rounded-[18px] border border-border/70 bg-background/55"
              size="sm"
              disabled={isSigningOut}
              onClick={signOut}
            >
              {isSigningOut ? "Logging out..." : "Log out"}
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="border-b border-border/70 bg-background/55 py-4 backdrop-blur-xl">
            <PageContainer className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex min-w-0 items-start gap-3">
                <Button
                  variant="ghost"
                  size="icon"
                  className="md:hidden"
                  onClick={() => setMobileNavOpen(true)}
                >
                  <span className="sr-only">Open navigation</span>
                  <Menu className="h-5 w-5" />
                </Button>
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-primary">
                      PT Workspace
                    </span>
                    <span className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
                      Operational layer
                    </span>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
                      {workspaceDisplayName} / {pageMeta.title}
                    </p>
                    <h1 className="text-lg font-semibold tracking-tight text-foreground">
                      {pageMeta.title}
                    </h1>
                    <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
                      {pageMeta.description}
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex flex-1 items-center gap-3 md:max-w-[27rem] xl:max-w-[32rem]">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Search clients, programs, tags..."
                    className="h-9 rounded-full border-border/60 bg-background/50 pl-8 text-[13px] shadow-none"
                    aria-label="Search clients"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  className="gap-2 rounded-full border border-border/70 bg-background/65 px-4"
                  onClick={() => navigate("/pt-hub")}
                >
                  <Building2 className="h-4 w-4" />
                  PT Hub
                </Button>
                <InviteClientDialog
                  trigger={
                    <Button className="gap-2 rounded-full px-4" variant="default">
                      <Plus className="h-4 w-4" />
                      Invite client
                    </Button>
                  }
                />
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="secondary"
                      className="gap-2 rounded-full px-4"
                    >
                      <Plus className="h-4 w-4" />
                      Quick actions
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuLabel>Quick actions</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <InviteClientDialog
                      trigger={<DropdownMenuItem>Invite client</DropdownMenuItem>}
                    />
                    <DropdownMenuItem>Create template</DropdownMenuItem>
                    <DropdownMenuItem>Assign workout</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <NotificationBell viewAllHref="/pt/notifications" />
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="rounded-full border border-border/70 bg-background/65 text-sm font-semibold"
                      aria-label="Profile menu"
                    >
                      {userInitial}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-52">
                    <DropdownMenuLabel>Profile</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => navigate("/settings/workspace")}
                    >
                      Settings
                    </DropdownMenuItem>
                    <div className="px-2 py-1.5">
                      <ThemeModeSwitch
                        checked={resolvedTheme === "dark"}
                        onToggle={toggleTheme}
                      />
                    </div>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem disabled={isSigningOut} onClick={signOut}>
                      {isSigningOut ? "Logging out..." : "Log out"}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </PageContainer>
          </header>

          <main className="min-w-0 flex-1 py-6">
            <PageContainer className="flex w-full flex-col gap-6">
              <Outlet />
            </PageContainer>
          </main>
        </div>
      </div>

      <Dialog open={createWorkspaceOpen} onOpenChange={setCreateWorkspaceOpen}>
        <DialogContent className="w-[92vw] max-w-[460px]">
          <DialogHeader>
            <DialogTitle>Create workspace</DialogTitle>
            <DialogDescription>
              Add another workspace to this PT account, then switch between them
              from the workspace card.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <label
              htmlFor="create-workspace-name"
              className="field-label block"
            >
              Workspace name
            </label>
            <Input
              id="create-workspace-name"
              value={newWorkspaceName}
              onChange={(event) => setNewWorkspaceName(event.target.value)}
              placeholder="Enter workspace name"
              autoFocus
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void handleCreateWorkspace();
                }
              }}
            />
            {createWorkspaceError ? (
              <p className="text-xs text-danger">{createWorkspaceError}</p>
            ) : null}
          </div>
          <DialogFooter className="mt-2 flex-row justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              className="w-full sm:w-auto"
              onClick={() => setCreateWorkspaceOpen(false)}
              disabled={isCreatingWorkspace}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className="w-full sm:w-auto"
              onClick={handleCreateWorkspace}
              disabled={isCreatingWorkspace}
            >
              {isCreatingWorkspace ? "Creating..." : "Create workspace"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

import { NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  BookOpen,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Dumbbell,
  LayoutDashboard,
  MessageCircle,
  Menu,
  Plus,
  Settings,
  Search,
  Sparkles,
  Users,
  Apple,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { cn } from "../../lib/utils";
import { PageContainer } from "../common/page-container";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
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
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { InviteClientDialog } from "../pt/invite-client-dialog";
import { NotificationBell } from "../../features/notifications/components/notification-bell";
import { useWorkspace } from "../../lib/use-workspace";
import { useAuth } from "../../lib/auth";
import { supabase } from "../../lib/supabase";
import { LoadingScreen } from "../common/bootstrap-gate";
import { useTheme } from "../common/theme-provider";
import { ThemeModeSwitch } from "../common/theme-mode-switch";

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
];

const PT_SIDEBAR_COLLAPSE_KEY = "coachos-pt-sidebar-collapsed";

type NotificationItem = {
  id: string;
  title: string;
  description: string;
  createdAt: string;
  to: string;
};

type ClientSummaryRow = {
  id: string;
  display_name: string | null;
  status: string | null;
  dob?: string | null;
};

type WorkspaceSwitcherOption = {
  id: string;
  name: string | null;
};

function getBirthdayReminderLabel(dob: string, now = new Date()) {
  const parsed = new Date(dob);
  if (Number.isNaN(parsed.getTime())) return null;

  const birthdayMonth = parsed.getMonth();
  const birthdayDate = parsed.getDate();
  const todayMonth = now.getMonth();
  const todayDate = now.getDate();
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);

  if (birthdayMonth === todayMonth && birthdayDate === todayDate) {
    return "Birthday today";
  }

  if (
    birthdayMonth === tomorrow.getMonth() &&
    birthdayDate === tomorrow.getDate()
  ) {
    return "Birthday tomorrow";
  }

  return null;
}

export function PtLayout() {
  const navigate = useNavigate();
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

  return (
    <div className="min-h-screen bg-background">
      <div className="flex min-h-screen">
        <aside
          className={cn(
            "hidden flex-col border-r border-border bg-card py-6 md:flex",
            desktopNavCollapsed ? "w-20 px-2" : "w-72 px-4",
          )}
        >
          <div className="mb-6 flex items-center justify-between">
            <div className={cn(desktopNavCollapsed && "mx-auto")}>
              <span
                className={cn(
                  "text-lg font-semibold tracking-tight",
                  desktopNavCollapsed && "sr-only",
                )}
              >
                CoachOS
              </span>
              <p
                className={cn(
                  "text-xs text-muted-foreground",
                  desktopNavCollapsed && "hidden",
                )}
              >
                Performance console
              </p>
            </div>
            <div className="flex items-center gap-1">
              <Sparkles
                className={cn(
                  "h-5 w-5 text-accent",
                  desktopNavCollapsed && "hidden",
                )}
              />
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
          </div>
          {!desktopNavCollapsed ? (
            <div className="mb-8 rounded-xl border border-border bg-background p-3">
              <p className="text-xs text-muted-foreground">Workspace</p>
              <div className="mt-2 flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold">
                    {workspaceDisplayName}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Coach - Pro plan
                  </p>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      size="icon"
                      variant="secondary"
                      aria-label="Switch workspace"
                    >
                      <svg
                        className="h-4 w-4 text-muted-foreground"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <path d="m6 9 6 6 6-6" />
                      </svg>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    <DropdownMenuLabel>Switch workspace</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {workspaceSwitcherQuery.isLoading ? (
                      <DropdownMenuItem disabled>Loading...</DropdownMenuItem>
                    ) : workspaceOptions.length === 0 ? (
                      <DropdownMenuItem disabled>
                        No workspaces found
                      </DropdownMenuItem>
                    ) : (
                      workspaceOptions.map((workspace) => (
                        <DropdownMenuItem
                          key={workspace.id}
                          onClick={() => switchWorkspace(workspace.id)}
                        >
                          {workspace.name?.trim() || "PT Workspace"}
                          {workspace.id === workspaceId ? " (Current)" : ""}
                        </DropdownMenuItem>
                      ))
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => {
                        setCreateWorkspaceError(null);
                        setCreateWorkspaceOpen(true);
                      }}
                    >
                      Create new workspace
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          ) : (
            <div className="mb-6 flex justify-center">
              <div className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-background text-sm font-semibold">
                PT
              </div>
            </div>
          )}
          <nav className="flex flex-1 flex-col gap-2">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  title={desktopNavCollapsed ? item.label : undefined}
                  className={({ isActive }) =>
                    cn(
                      "group flex items-center rounded-xl border border-transparent text-sm font-medium text-muted-foreground transition hover:border-border hover:bg-muted",
                      desktopNavCollapsed
                        ? "justify-center px-2 py-2"
                        : "gap-3 px-3 py-2",
                      isActive &&
                        "border-accent/40 bg-accent/10 text-foreground shadow-sm shadow-accent/10",
                    )
                  }
                >
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted text-foreground group-hover:bg-background">
                    <Icon className="h-4 w-4" />
                  </span>
                  {!desktopNavCollapsed ? item.label : null}
                </NavLink>
              );
            })}
          </nav>
          {!desktopNavCollapsed ? (
            <div className="mt-6 rounded-xl border border-border bg-muted/60 p-4 text-xs text-muted-foreground">
              <p className="text-sm font-medium text-foreground">
                Need a push?
              </p>
              <p className="mt-1">
                Enable performance alerts for clients with low adherence.
              </p>
              <Button className="mt-3 w-full" size="sm">
                Activate alerts
              </Button>
            </div>
          ) : null}
        </aside>
        <div
          className={cn(
            "fixed inset-0 z-40 bg-background/80 opacity-0 transition md:hidden",
            mobileNavOpen ? "opacity-100" : "pointer-events-none",
          )}
          aria-hidden={!mobileNavOpen}
          onClick={() => setMobileNavOpen(false)}
        />
        <aside
          className={cn(
            "fixed inset-y-0 left-0 z-50 w-72 -translate-x-full border-r border-border bg-card px-4 py-6 transition md:hidden",
            mobileNavOpen && "translate-x-0",
          )}
        >
          <div className="mb-6 flex items-center justify-between">
            <div>
              <span className="text-lg font-semibold tracking-tight">
                CoachOS
              </span>
              <p className="text-xs text-muted-foreground">
                Performance console
              </p>
            </div>
            <Button
              size="icon"
              variant="ghost"
              onClick={() => setMobileNavOpen(false)}
            >
              <span className="sr-only">Close navigation</span>
              <svg
                className="h-4 w-4 text-muted-foreground"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M18 6 6 18" />
                <path d="m6 6 12 12" />
              </svg>
            </Button>
          </div>
          <div className="mb-8 rounded-xl border border-border bg-background p-3">
            <p className="text-xs text-muted-foreground">Workspace</p>
            <div className="mt-2 flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold">{workspaceDisplayName}</p>
                <p className="text-xs text-muted-foreground">
                  Coach - Pro plan
                </p>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    size="icon"
                    variant="secondary"
                    aria-label="Switch workspace"
                  >
                    <svg
                      className="h-4 w-4 text-muted-foreground"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="m6 9 6 6 6-6" />
                    </svg>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel>Switch workspace</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {workspaceSwitcherQuery.isLoading ? (
                    <DropdownMenuItem disabled>Loading...</DropdownMenuItem>
                  ) : workspaceOptions.length === 0 ? (
                    <DropdownMenuItem disabled>
                      No workspaces found
                    </DropdownMenuItem>
                  ) : (
                    workspaceOptions.map((workspace) => (
                      <DropdownMenuItem
                        key={workspace.id}
                        onClick={() => {
                          switchWorkspace(workspace.id);
                          setMobileNavOpen(false);
                        }}
                      >
                        {workspace.name?.trim() || "PT Workspace"}
                        {workspace.id === workspaceId ? " (Current)" : ""}
                      </DropdownMenuItem>
                    ))
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => {
                      setCreateWorkspaceError(null);
                      setCreateWorkspaceOpen(true);
                    }}
                  >
                    Create new workspace
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
          <nav className="flex flex-1 flex-col gap-2">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  onClick={() => setMobileNavOpen(false)}
                  className={({ isActive }) =>
                    cn(
                      "group flex items-center gap-3 rounded-xl border border-transparent px-3 py-2 text-sm font-medium text-muted-foreground transition hover:border-border hover:bg-muted",
                      isActive &&
                        "border-accent/40 bg-accent/10 text-foreground shadow-sm shadow-accent/10",
                    )
                  }
                >
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted text-foreground group-hover:bg-background">
                    <Icon className="h-4 w-4" />
                  </span>
                  {item.label}
                </NavLink>
              );
            })}
          </nav>
          <div className="mt-6 rounded-xl border border-border bg-muted/60 p-4 text-xs text-muted-foreground">
            <p className="text-sm font-medium text-foreground">Need a push?</p>
            <p className="mt-1">
              Enable performance alerts for clients with low adherence.
            </p>
            <Button className="mt-3 w-full" size="sm">
              Activate alerts
            </Button>
          </div>
        </aside>
        <div className="flex flex-1 min-w-0 flex-col">
          <header className="border-b border-border bg-card py-4">
            <PageContainer className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <Button
                  variant="ghost"
                  size="icon"
                  className="md:hidden"
                  onClick={() => setMobileNavOpen(true)}
                >
                  <span className="sr-only">Open navigation</span>
                  <Menu className="h-5 w-5" />
                </Button>
                <div>
                  <p className="text-sm text-muted-foreground">Welcome back</p>
                  <h1 className="text-lg font-semibold tracking-tight">
                    PT Workspace
                  </h1>
                </div>
              </div>
              <div className="flex flex-1 items-center gap-3 md:max-w-xl xl:max-w-2xl">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Search clients, programs, tags..."
                    className="pl-9"
                    aria-label="Search clients"
                  />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  className="gap-2"
                  onClick={() => navigate("/pt-hub")}
                >
                  <Building2 className="h-4 w-4" />
                  PT Hub
                </Button>
                <InviteClientDialog
                  trigger={
                    <Button className="gap-2" variant="default">
                      <Plus className="h-4 w-4" />
                      Invite client
                    </Button>
                  }
                />
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="secondary" className="gap-2">
                      <Plus className="h-4 w-4" />
                      Quick actions
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuLabel>Quick actions</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <InviteClientDialog
                      trigger={
                        <DropdownMenuItem>Invite client</DropdownMenuItem>
                      }
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
                      className="rounded-full border border-border/70 bg-card/70 text-sm font-semibold"
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
                    <DropdownMenuItem
                      disabled={isSigningOut}
                      onClick={async () => {
                        setIsSigningOut(true);
                        await supabase.auth.signOut();
                        navigate("/login", { replace: true });
                      }}
                    >
                      {isSigningOut ? "Logging out..." : "Log out"}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </PageContainer>
          </header>
          <main className="flex-1 min-w-0 bg-background py-6">
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
              className="text-xs font-semibold text-muted-foreground"
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

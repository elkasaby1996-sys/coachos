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
  Menu,
  MessageCircle,
  Plus,
  Search,
  Settings,
  Sparkles,
  Users,
  X,
} from "lucide-react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
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
import { PtMessageComposeProvider } from "../pt/pt-message-compose";
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
          <span className="block text-sm font-semibold text-foreground">
            {workspaceDisplayName}
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
    <div className="theme-shell-canvas min-h-screen">
      <div className="flex min-h-screen">
        <aside
          className={cn(
            "theme-sidebar-surface hidden border-r border-border/70 py-6 md:flex md:flex-col",
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
                  <p className="text-xs text-muted-foreground">PT Workspace</p>
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
            <div className="surface-section mb-6 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-primary/80">
                Workspace
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
                  className="w-full justify-between rounded-[20px] border border-border/70 bg-card/70 px-4"
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
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-border/70 bg-card/65 text-sm font-semibold text-foreground">
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
                      "group relative flex items-center rounded-2xl border border-transparent text-sm font-medium text-muted-foreground transition hover:border-border/60 hover:bg-card/42 hover:text-foreground",
                      desktopNavCollapsed
                        ? "justify-center px-2 py-2.5"
                        : "gap-3 px-3 py-2.5",
                      isActive && "border-border/70 bg-card/72 text-foreground",
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
                            : "border-border/70 bg-card/65 text-muted-foreground group-hover:text-primary",
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
        </aside>

        <div
          className={cn(
            "theme-overlay fixed inset-0 z-40 backdrop-blur-sm transition md:hidden",
            mobileNavOpen ? "opacity-100" : "pointer-events-none opacity-0",
          )}
          aria-hidden={!mobileNavOpen}
          onClick={() => setMobileNavOpen(false)}
        />

        <aside
          className={cn(
            "theme-sidebar-surface fixed inset-y-0 left-0 z-50 w-72 -translate-x-full border-r border-border/70 px-4 py-6 transition md:hidden",
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

          <div className="surface-section mb-8 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-primary/80">
              Workspace
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
                className="w-full justify-between rounded-[20px] border border-border/70 bg-card/70 px-4"
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
                      "group flex items-center gap-3 rounded-2xl border border-transparent px-3 py-2.5 text-sm font-medium text-muted-foreground transition hover:border-border/60 hover:bg-card/42 hover:text-foreground",
                      isActive && "border-border/70 bg-card/72 text-foreground",
                    )
                  }
                >
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-border/70 bg-card/65 text-muted-foreground group-hover:text-primary">
                    <Icon className="h-4 w-4" />
                  </span>
                  {item.label}
                </NavLink>
              );
            })}
          </nav>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="theme-topbar border-b border-border/70 py-4 backdrop-blur-xl">
            <PageContainer className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex min-w-0 items-center gap-3">
                <Button
                  variant="ghost"
                  size="icon"
                  className="md:hidden"
                  onClick={() => setMobileNavOpen(true)}
                >
                  <span className="sr-only">Open navigation</span>
                  <Menu className="h-5 w-5" />
                </Button>
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                    Workspace
                  </p>
                  <div className="truncate text-sm font-semibold text-foreground">
                    {workspaceDisplayName}
                  </div>
                </div>
              </div>

              <div className="flex flex-1 items-center gap-3 md:max-w-[27rem] xl:max-w-[32rem]">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Search clients, programs, tags..."
                    className="h-9 rounded-full border-border/60 bg-card/65 pl-8 text-[13px] shadow-none"
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
                    <Button
                      className="gap-2 rounded-full px-4"
                      variant="default"
                    >
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
                      className="rounded-full border border-border/70 bg-card/75 text-sm font-semibold"
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

          <PtMessageComposeProvider>
            <main className="min-w-0 flex-1 py-6">
              <PageContainer className="flex w-full flex-col gap-6">
                <Outlet />
              </PageContainer>
            </main>
          </PtMessageComposeProvider>
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

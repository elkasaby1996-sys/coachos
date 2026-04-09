import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion, useReducedMotion } from "framer-motion";
import {
  Apple,
  ArrowUpRight,
  BookOpen,
  Building2,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Dumbbell,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageCircle,
  Moon,
  Plus,
  Search,
  Settings,
  Sparkles,
  Users,
  X,
} from "lucide-react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { NotificationBell } from "../../features/notifications/components/notification-bell";
import {
  createPtWorkspace,
  usePtHubSettings,
} from "../../features/pt-hub/lib/pt-hub";
import { getUserDisplayName } from "../../lib/account-profiles";
import { useBootstrapAuth, useSessionAuth } from "../../lib/auth";
import { supabase } from "../../lib/supabase";
import { cn } from "../../lib/utils";
import { useWorkspace } from "../../lib/use-workspace";
import { LoadingScreen } from "../common/bootstrap-gate";
import { AppFooter } from "../common/app-footer";
import { PageContainer } from "../common/page-container";
import { ThemeModeSwitch } from "../common/theme-mode-switch";
import { useTheme } from "../common/theme-provider";
import { AppShellBackgroundLayer } from "../common/app-shell-background";
import { RouteTransition } from "../common/route-transition";
import { InviteClientDialog } from "../pt/invite-client-dialog";
import { PtMessageComposeProvider } from "../pt/pt-message-compose";
import { WorkspaceHeaderModeProvider } from "../pt/workspace-page-header";
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
import { FieldCharacterMeta } from "../common/field-character-meta";
import {
  getModuleToneClasses,
  getModuleToneForPath,
  getModuleToneStyle,
  type ModuleTone,
} from "../../lib/module-tone";
import { getCharacterLimitState } from "../../lib/character-limits";
import "../../styles/pt-workspace-shell.css";

const PT_SIDEBAR_COLLAPSE_KEY = "coachos-pt-sidebar-collapsed";

type WorkspaceSwitcherOption = {
  id: string;
  name: string | null;
};

type SearchResult =
  | {
      id: string;
      type: "route";
      label: string;
      meta: string;
      href: string;
    }
  | {
      id: string;
      type: "client";
      label: string;
      meta: string;
      href: string;
    }
  | {
      id: string;
      type: "program";
      label: string;
      meta: string;
      href: string;
    }
  | {
      id: string;
      type: "workout";
      label: string;
      meta: string;
      href: string;
    }
  | {
      id: string;
      type: "checkin";
      label: string;
      meta: string;
      href: string;
    };

type PtNavItem = {
  label: string;
  description: string;
  to: string;
  icon: ComponentType<{ className?: string }>;
  module: ModuleTone;
};

const ptNavGroups: Array<{
  label: string;
  items: PtNavItem[];
}> = [
  {
    label: "Operate",
    items: [
      {
        label: "Dashboard",
        description: "Track coaching activity and daily priorities.",
        to: "/pt/dashboard",
        icon: LayoutDashboard,
        module: "overview",
      },
      {
        label: "Clients",
        description: "Manage your roster, notes, and client detail views.",
        to: "/pt/clients",
        icon: Users,
        module: "clients",
      },
      {
        label: "Messages",
        description: "Stay on top of conversations and follow-ups.",
        to: "/pt/messages",
        icon: MessageCircle,
        module: "coaching",
      },
      {
        label: "Calendar",
        description: "Review sessions, planning, and weekly schedule flow.",
        to: "/pt/calendar",
        icon: CalendarDays,
        module: "coaching",
      },
      {
        label: "Check-ins",
        description: "Monitor readiness, responses, and coaching feedback.",
        to: "/pt/checkins",
        icon: ClipboardList,
        module: "checkins",
      },
    ],
  },
  {
    label: "Build",
    items: [
      {
        label: "Programs",
        description: "Create, edit, and assign structured programs.",
        to: "/pt/programs",
        icon: CalendarDays,
        module: "coaching",
      },
      {
        label: "Workouts",
        description: "Shape workout templates and exercise flow.",
        to: "/pt/templates/workouts",
        icon: Dumbbell,
        module: "coaching",
      },
      {
        label: "Nutrition Programs",
        description: "Manage nutrition planning and meal structure.",
        to: "/pt/nutrition-programs",
        icon: Apple,
        module: "coaching",
      },
      {
        label: "Exercise Library",
        description: "Review and organize reusable exercise assets.",
        to: "/pt/settings/exercises",
        icon: BookOpen,
        module: "coaching",
      },
    ],
  },
  {
    label: "Control",
    items: [
      {
        label: "Settings",
        description: "Adjust workspace defaults and account controls.",
        to: "/settings/workspace",
        icon: Settings,
        module: "settings",
      },
    ],
  },
];

const ptSearchRoutes: SearchResult[] = [
  {
    id: "route-dashboard",
    type: "route",
    label: "Dashboard",
    meta: "Workspace overview",
    href: "/pt/dashboard",
  },
  {
    id: "route-clients",
    type: "route",
    label: "Clients",
    meta: "Roster and client detail",
    href: "/pt/clients",
  },
  {
    id: "route-programs",
    type: "route",
    label: "Programs",
    meta: "Program templates and planning",
    href: "/pt/programs",
  },
  {
    id: "route-workouts",
    type: "route",
    label: "Workouts",
    meta: "Workout templates",
    href: "/pt/templates/workouts",
  },
  {
    id: "route-checkins",
    type: "route",
    label: "Check-in Templates",
    meta: "Template library and assignments",
    href: "/pt/checkins/templates",
  },
  {
    id: "route-calendar",
    type: "route",
    label: "Calendar",
    meta: "Coach calendar",
    href: "/pt/calendar",
  },
  {
    id: "route-messages",
    type: "route",
    label: "Messages",
    meta: "Client conversations",
    href: "/pt/messages",
  },
  {
    id: "route-settings",
    type: "route",
    label: "Settings",
    meta: "Workspace settings",
    href: "/settings/workspace",
  },
];

function getPtRouteHeader(
  pathname: string,
  navGroups: Array<{
    label: string;
    items: PtNavItem[];
  }>,
) {
  if (pathname.startsWith("/settings/") || pathname.startsWith("/workspace/")) {
    return {
      title: "Settings",
      description: "Adjust workspace defaults and account controls.",
    };
  }

  if (pathname.startsWith("/pt/clients/")) {
    return {
      title: "Client Detail",
      description:
        "Review client state, planning, communication, and follow-ups in one place.",
    };
  }

  const matchedItem = [...navGroups.flatMap((group) => group.items)]
    .sort((a, b) => b.to.length - a.to.length)
    .find((item) => pathname.startsWith(item.to));

  return {
    title: matchedItem?.label ?? "PT Workspace",
    description: matchedItem?.description ?? null,
  };
}

function getHeaderPillClassName(isLightMode: boolean) {
  return cn(
    "group flex h-[54px] min-w-[204px] items-center gap-2.5 rounded-[18px] border px-3 py-2 text-left backdrop-blur-3xl transition-all duration-200 hover:-translate-y-[1px] sm:w-[214px]",
    isLightMode
      ? "border-[oklch(var(--border-default)/0.7)] bg-[linear-gradient(180deg,oklch(var(--bg-surface-elevated)/0.8),oklch(var(--bg-surface)/0.68))] shadow-[0_22px_48px_-34px_oklch(0.28_0.02_190/0.16),inset_0_1px_0_oklch(1_0_0/0.34)] hover:border-primary/18 hover:bg-[linear-gradient(180deg,oklch(var(--bg-surface-elevated)/0.88),oklch(var(--bg-surface)/0.74))]"
      : "border-white/10 bg-[linear-gradient(180deg,rgba(18,24,22,0.8),rgba(10,14,13,0.72))] shadow-[0_22px_46px_-34px_rgba(0,0,0,0.82),inset_0_1px_0_rgba(255,255,255,0.06)] hover:border-primary/18 hover:bg-[linear-gradient(180deg,rgba(22,29,26,0.88),rgba(12,17,15,0.78))]",
  );
}

function getHeaderPillIconClassName(isLightMode: boolean) {
  return cn(
    "flex h-8 w-8 shrink-0 items-center justify-center text-foreground transition-colors duration-200",
    isLightMode
      ? "text-primary group-hover:text-[oklch(var(--text-primary))]"
      : "text-primary group-hover:text-foreground",
  );
}

function getHeaderPillChevronClassName(isLightMode: boolean) {
  return cn(
    "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition-all duration-200",
    isLightMode
      ? "border-[oklch(var(--border-default)/0.62)] bg-[oklch(var(--bg-surface-elevated)/0.62)] text-primary group-hover:border-primary/16 group-hover:text-[oklch(var(--text-primary))]"
      : "border-white/8 bg-white/[0.04] text-muted-foreground group-hover:border-primary/18 group-hover:text-primary",
  );
}

function getHeaderUtilityButtonClassName(isLightMode: boolean) {
  return cn(
    "inline-flex h-[54px] items-center justify-center gap-2 rounded-[18px] border px-4 text-sm font-medium backdrop-blur-3xl transition-all duration-200 hover:-translate-y-[1px]",
    isLightMode
      ? "border-[oklch(var(--border-default)/0.7)] bg-[linear-gradient(180deg,oklch(var(--bg-surface-elevated)/0.8),oklch(var(--bg-surface)/0.68))] text-[oklch(var(--text-primary))] shadow-[0_22px_48px_-34px_oklch(0.28_0.02_190/0.16),inset_0_1px_0_oklch(1_0_0/0.34)] hover:border-primary/18"
      : "border-white/10 bg-[linear-gradient(180deg,rgba(18,24,22,0.8),rgba(10,14,13,0.72))] text-foreground shadow-[0_22px_46px_-34px_rgba(0,0,0,0.82),inset_0_1px_0_rgba(255,255,255,0.06)] hover:border-primary/18",
  );
}

function getHeaderBellButtonClassName(isLightMode: boolean) {
  return cn(
    "h-[54px] w-[54px] rounded-[18px] border backdrop-blur-3xl transition-all duration-200 hover:-translate-y-[1px]",
    isLightMode
      ? "border-[oklch(var(--border-default)/0.7)] bg-[linear-gradient(180deg,oklch(var(--bg-surface-elevated)/0.8),oklch(var(--bg-surface)/0.68))] text-[oklch(var(--text-primary))] shadow-[0_22px_48px_-34px_oklch(0.28_0.02_190/0.16),inset_0_1px_0_oklch(1_0_0/0.34)] hover:border-primary/18"
      : "border-white/10 bg-[linear-gradient(180deg,rgba(18,24,22,0.8),rgba(10,14,13,0.72))] text-foreground shadow-[0_22px_46px_-34px_rgba(0,0,0,0.82),inset_0_1px_0_rgba(255,255,255,0.06)] hover:border-primary/18",
  );
}

function sidebarLinkClasses(
  isActive: boolean,
  isLightMode: boolean,
  collapsed: boolean,
) {
  return cn(
    "group relative flex items-center gap-3 rounded-[22px] border text-sm font-medium transition-all duration-200",
    collapsed ? "justify-center px-2.5 py-2.5" : "px-3.5 py-3",
    isActive
      ? isLightMode
        ? "translate-x-1 border-transparent bg-transparent text-[oklch(var(--text-primary))]"
        : "translate-x-1 border-transparent bg-transparent text-foreground"
      : isLightMode
        ? "border-transparent bg-transparent text-[oklch(var(--text-secondary))] hover:border-[oklch(var(--border-default)/0.75)] hover:bg-[oklch(var(--bg-surface-elevated)/0.34)] hover:text-[oklch(var(--text-primary))]"
        : "border-transparent bg-transparent text-muted-foreground hover:border-border/70 hover:bg-background/55 hover:text-foreground",
  );
}

function SidebarNav({
  navGroups,
  collapsed,
  isLightMode,
  onNavigate,
}: {
  navGroups: Array<{
    label: string;
    items: PtNavItem[];
  }>;
  collapsed: boolean;
  isLightMode: boolean;
  onNavigate?: () => void;
}) {
  const reduceMotion = useReducedMotion();

  return (
    <nav className="mt-5 min-h-0 flex-1 overflow-y-auto pb-4 pr-1 lg:flex lg:flex-col lg:gap-6">
      {navGroups.map((group) => (
        <div key={group.label} className="space-y-2.5">
          {!collapsed ? (
            <p
              className={cn(
                "px-2 text-[10px] font-semibold uppercase tracking-[0.32em]",
                isLightMode ? "text-slate-500" : "text-muted-foreground/80",
              )}
            >
              {group.label}
            </p>
          ) : null}
          <div className="space-y-1">
            {group.items.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  title={collapsed ? item.label : undefined}
                  onClick={onNavigate}
                  className={({ isActive }) =>
                    sidebarLinkClasses(isActive, isLightMode, collapsed)
                  }
                >
                  {({ isActive }) => (
                    <>
                      {isActive ? (
                        <motion.span
                          layoutId={
                            reduceMotion
                              ? undefined
                              : collapsed
                                ? "pt-nav-active-collapsed"
                                : "pt-nav-active-expanded"
                          }
                          className={cn(
                            "absolute inset-0 rounded-[22px]",
                            getModuleToneClasses(item.module).navActive,
                          )}
                          style={getModuleToneStyle(item.module)}
                          transition={{
                            type: "spring",
                            stiffness: 250,
                            damping: 28,
                            mass: 0.9,
                          }}
                        />
                      ) : null}
                      <span
                        style={getModuleToneStyle(item.module)}
                        className={cn(
                          "relative z-10 flex h-10 w-10 shrink-0 items-center justify-center transition-colors",
                          isActive
                            ? "section-accent-nav-icon-active"
                            : isLightMode
                              ? "text-[oklch(var(--text-muted))] group-hover:text-foreground"
                              : "text-muted-foreground group-hover:text-foreground",
                          getModuleToneClasses(item.module).navIcon,
                        )}
                      >
                        <Icon className="h-4 w-4 [stroke-width:1.7]" />
                      </span>
                      {!collapsed ? (
                        <motion.div
                          className="min-w-0"
                          animate={
                            reduceMotion
                              ? undefined
                              : {
                                  x: isActive ? 4 : 0,
                                  opacity: isActive ? 1 : 0.9,
                                }
                          }
                          transition={{
                            duration: 0.22,
                            ease: [0.22, 1, 0.36, 1],
                          }}
                        >
                          <p
                            className={cn(
                              isLightMode
                                ? "text-[oklch(var(--text-primary))]"
                                : "text-inherit",
                            )}
                          >
                            {item.label}
                          </p>
                        </motion.div>
                      ) : null}
                    </>
                  )}
                </NavLink>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}

function getWorkspaceRouteTransitionKey(pathname: string) {
  const workspaceSettingsMatch = pathname.match(
    /^\/workspace\/([^/]+)\/settings(?:\/[^/]+)?(?:\/.*)?$/,
  );
  if (workspaceSettingsMatch) {
    return `/workspace/${workspaceSettingsMatch[1]}/settings`;
  }
  return pathname;
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
  const { authError, user } = useSessionAuth();
  const { patchBootstrap } = useBootstrapAuth();
  const settingsQuery = usePtHubSettings();
  const { resolvedTheme, toggleTheme } = useTheme();
  const isLightMode = resolvedTheme === "light";
  const workspaceSettingsPath = workspaceId
    ? `/workspace/${workspaceId}/settings/general`
    : "/settings/workspace";
  const navGroups = useMemo(
    () =>
      ptNavGroups.map((group) => ({
        ...group,
        items: group.items.map((item) =>
          item.to === "/settings/workspace"
            ? { ...item, to: workspaceSettingsPath }
            : item,
        ),
      })),
    [workspaceSettingsPath],
  );
  const searchRoutes = useMemo(
    () =>
      ptSearchRoutes.map((item) =>
        item.type === "route" && item.href === "/settings/workspace"
          ? { ...item, href: workspaceSettingsPath }
          : item,
      ),
    [workspaceSettingsPath],
  );
  const pageHeader = getPtRouteHeader(location.pathname, navGroups);
  const currentModule = getModuleToneForPath(location.pathname);
  const routeTransitionKey = getWorkspaceRouteTransitionKey(location.pathname);
  const currentModuleClasses = getModuleToneClasses(currentModule);
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
  const workspaceNameLimitState = getCharacterLimitState({
    value: newWorkspaceName,
    kind: "entity_name",
    fieldLabel: "Workspace name",
  });
  const hasWorkspaceNameOverLimit = workspaceNameLimitState.overLimit;
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearchInput, setDebouncedSearchInput] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchHighlightIndex, setSearchHighlightIndex] = useState(0);
  const searchShellRef = useRef<HTMLDivElement | null>(null);
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
  const workspaces = workspaceSwitcherQuery.data ?? [];
  const currentWorkspace =
    workspaces.find((workspace) => workspace.id === workspaceId) ?? null;
  const workspaceDisplayName = currentWorkspace?.name?.trim() || "PT Workspace";
  const settingsFullName = settingsQuery.data?.fullName.trim();
  const profileDisplayName =
    (settingsFullName && settingsFullName.length > 0
      ? settingsFullName
      : null) ||
    getUserDisplayName(user) ||
    "Trainer account";
  const normalizedSearch = debouncedSearchInput.trim().toLowerCase();

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setDebouncedSearchInput(searchInput);
    }, 180);

    return () => window.clearTimeout(timeout);
  }, [searchInput]);

  useEffect(() => {
    if (!searchOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (!searchShellRef.current?.contains(event.target as Node)) {
        setSearchOpen(false);
      }
    };

    window.addEventListener("mousedown", handlePointerDown);
    return () => window.removeEventListener("mousedown", handlePointerDown);
  }, [searchOpen]);

  const searchQuery = useQuery({
    queryKey: ["pt-header-search", workspaceId, normalizedSearch],
    enabled: Boolean(workspaceId && normalizedSearch.length >= 2),
    queryFn: async () => {
      const wildcard = `%${normalizedSearch}%`;

      const [clientsResult, programsResult, workoutsResult, checkinsResult] =
        await Promise.all([
          supabase
            .from("clients")
            .select("id, display_name, goal")
            .eq("workspace_id", workspaceId ?? "")
            .or(`display_name.ilike.${wildcard},goal.ilike.${wildcard}`)
            .limit(5),
          supabase
            .from("program_templates")
            .select("id, name, description")
            .eq("workspace_id", workspaceId ?? "")
            .or(`name.ilike.${wildcard},description.ilike.${wildcard}`)
            .limit(5),
          supabase
            .from("workout_templates")
            .select("id, name, workout_type_tag")
            .eq("workspace_id", workspaceId ?? "")
            .or(`name.ilike.${wildcard},workout_type_tag.ilike.${wildcard}`)
            .limit(5),
          supabase
            .from("checkin_templates")
            .select("id, name, description")
            .eq("workspace_id", workspaceId ?? "")
            .or(`name.ilike.${wildcard},description.ilike.${wildcard}`)
            .limit(5),
        ]);

      if (clientsResult.error) throw clientsResult.error;
      if (programsResult.error) throw programsResult.error;
      if (workoutsResult.error) throw workoutsResult.error;
      if (checkinsResult.error) throw checkinsResult.error;

      const routeMatches = searchRoutes.filter((item) =>
        `${item.label} ${item.meta}`.toLowerCase().includes(normalizedSearch),
      );

      const clientResults: SearchResult[] = (clientsResult.data ?? []).map(
        (client) => ({
          id: `client-${client.id}`,
          type: "client",
          label: client.display_name?.trim() || "Client",
          meta: client.goal?.trim() || "Client record",
          href: `/pt/clients/${client.id}`,
        }),
      );

      const programResults: SearchResult[] = (programsResult.data ?? []).map(
        (program) => ({
          id: `program-${program.id}`,
          type: "program",
          label: program.name?.trim() || "Program",
          meta: program.description?.trim() || "Program template",
          href: `/pt/programs/${program.id}/edit`,
        }),
      );

      const workoutResults: SearchResult[] = (workoutsResult.data ?? []).map(
        (workout) => ({
          id: `workout-${workout.id}`,
          type: "workout",
          label: workout.name?.trim() || "Workout template",
          meta: workout.workout_type_tag?.trim() || "Workout template",
          href: `/pt/templates/workouts/${workout.id}`,
        }),
      );

      const checkinResults: SearchResult[] = (checkinsResult.data ?? []).map(
        (template) => ({
          id: `checkin-${template.id}`,
          type: "checkin",
          label: template.name?.trim() || "Check-in template",
          meta: template.description?.trim() || "Check-in template",
          href: "/pt/checkins/templates",
        }),
      );

      return [
        ...routeMatches,
        ...clientResults,
        ...programResults,
        ...workoutResults,
        ...checkinResults,
      ].slice(0, 10);
    },
  });

  const searchResults = useMemo(() => {
    if (normalizedSearch.length === 0) return searchRoutes.slice(0, 6);
    return searchQuery.data ?? [];
  }, [normalizedSearch.length, searchQuery.data, searchRoutes]);

  useEffect(() => {
    setSearchHighlightIndex(0);
  }, [normalizedSearch, searchResults.length]);

  const handleCreateWorkspace = async () => {
    if (hasWorkspaceNameOverLimit) {
      setCreateWorkspaceError(
        workspaceNameLimitState.errorText ?? "Workspace name is too long.",
      );
      return;
    }
    const nextName = newWorkspaceName.trim();
    if (!nextName) {
      setCreateWorkspaceError("Workspace name is required.");
      return;
    }

    setIsCreatingWorkspace(true);
    setCreateWorkspaceError(null);
    try {
      const createdWorkspaceId = await createPtWorkspace(nextName);

      patchBootstrap({
        accountType: "pt",
        role: "pt",
        hasWorkspaceMembership: true,
        ptWorkspaceComplete: true,
        activeWorkspaceId: createdWorkspaceId,
      });
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

  const handleSearchSelect = (result: SearchResult) => {
    setSearchInput("");
    setDebouncedSearchInput("");
    setSearchOpen(false);
    navigate(result.href);
  };

  const userInitial = (
    profileDisplayName.charAt(0) ||
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
      <div
        className="pt-workspace-theme theme-shell-canvas relative isolate min-h-screen overflow-hidden"
        style={getModuleToneStyle(currentModule)}
      >
        <AppShellBackgroundLayer />
        <div className="relative z-10 flex min-h-screen items-center justify-center px-4">
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
      </div>
    );
  }

  return (
    <div
      className={cn(
        "pt-workspace-theme theme-shell-canvas relative isolate flex min-h-screen flex-col overflow-hidden lg:h-screen",
        isLightMode ? "pt-workspace-theme-light" : "pt-workspace-theme-dark",
      )}
      style={getModuleToneStyle(currentModule)}
    >
      <AppShellBackgroundLayer />
      <div
        className={cn(
          "theme-overlay fixed inset-0 z-40 backdrop-blur-sm transition lg:hidden",
          mobileNavOpen ? "opacity-100" : "pointer-events-none opacity-0",
        )}
        aria-hidden={!mobileNavOpen}
        onClick={() => setMobileNavOpen(false)}
      />

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-[320px] max-w-[calc(100vw-1rem)] p-3 transition lg:hidden",
          mobileNavOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="surface-panel-strong flex h-full flex-col overflow-hidden rounded-[32px] border-border/70">
          <div className="flex items-center justify-between border-b border-border/60 px-5 py-4">
            <div>
              <p className="text-xl font-semibold uppercase tracking-[0.06em] text-foreground">
                Repsync PT
              </p>
              <p className="text-sm text-muted-foreground">
                Coaching workspace
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setMobileNavOpen(false)}
              aria-label="Close navigation"
            >
              <X className="h-5 w-5" />
            </Button>
          </div>
          <div className="flex h-full min-h-0 flex-col px-5 py-5">
            <SidebarNav
              navGroups={navGroups}
              collapsed={false}
              isLightMode={isLightMode}
              onNavigate={() => setMobileNavOpen(false)}
            />
          </div>
        </div>
      </aside>

      <PageContainer className="relative z-10 flex-1 py-4 sm:py-5 lg:min-h-0 lg:overflow-hidden lg:py-6">
        <div
          className={cn(
            "grid items-start gap-5 lg:h-full lg:items-stretch xl:gap-6",
            desktopNavCollapsed
              ? "lg:grid-cols-[104px_minmax(0,1fr)]"
              : "lg:grid-cols-[296px_minmax(0,1fr)]",
          )}
        >
          <aside className="hidden lg:block lg:h-full lg:min-h-0">
            <div className="sticky top-0 h-full min-h-0">
              <div className="surface-panel-strong h-full min-h-0 overflow-hidden rounded-[34px] border-border/70">
                <div className="flex h-full min-h-0 flex-col px-4 py-5">
                  <div
                    className={cn(
                      "mb-4 flex items-center",
                      desktopNavCollapsed
                        ? "justify-center"
                        : "justify-between gap-3",
                    )}
                  >
                    <div
                      className={cn(
                        "flex items-center gap-3",
                        desktopNavCollapsed && "justify-center",
                      )}
                    >
                      <Sparkles className="h-5 w-5 shrink-0 text-primary [stroke-width:1.7]" />
                      {!desktopNavCollapsed ? (
                        <div className="min-w-0">
                          <p className="text-[1.1rem] font-semibold uppercase tracking-[0.05em] text-foreground">
                            Repsync PT
                          </p>
                          <p className="text-sm text-muted-foreground">
                            Coaching workspace
                          </p>
                        </div>
                      ) : null}
                    </div>
                    {!desktopNavCollapsed ? (
                      <Button
                        type="button"
                        size="icon"
                        variant="secondary"
                        className="rounded-full border border-border/70 bg-card/68"
                        onClick={() => setDesktopNavCollapsed(true)}
                        aria-label="Collapse navigation"
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                    ) : null}
                  </div>
                  {desktopNavCollapsed ? (
                    <div className="mb-4 flex justify-center">
                      <Button
                        type="button"
                        size="icon"
                        variant="secondary"
                        className="rounded-full border border-border/70 bg-card/68"
                        onClick={() => setDesktopNavCollapsed(false)}
                        aria-label="Expand navigation"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : null}
                  <SidebarNav
                    navGroups={navGroups}
                    collapsed={desktopNavCollapsed}
                    isLightMode={isLightMode}
                  />
                </div>
              </div>
            </div>
          </aside>

          <PtMessageComposeProvider>
            <WorkspaceHeaderModeProvider value="shell">
              <div className="min-w-0 space-y-5 lg:flex lg:h-full lg:min-h-0 lg:flex-col">
                <header
                  className={cn(
                    "surface-panel-strong relative overflow-hidden rounded-[34px] border-border/70 px-4 py-4 sm:px-5 lg:px-6",
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
                      <div className="flex min-w-0 items-center gap-3">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="lg:hidden"
                          onClick={() => setMobileNavOpen(true)}
                        >
                          <Menu className="h-5 w-5 [stroke-width:1.7]" />
                          <span className="sr-only">Open PT navigation</span>
                        </Button>
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
                            {pageHeader.title}
                          </p>
                          <p
                            className={cn(
                              "truncate text-[2rem] font-semibold uppercase tracking-[0.06em] text-foreground sm:text-[2.25rem]",
                              currentModuleClasses.title,
                            )}
                          >
                            {pageHeader.title}
                          </p>
                          {pageHeader.description ? (
                            <p className="max-w-2xl text-sm leading-5 text-muted-foreground">
                              {pageHeader.description}
                            </p>
                          ) : null}
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <NotificationBell
                          viewAllHref="/pt/notifications"
                          buttonClassName={getHeaderBellButtonClassName(
                            isLightMode,
                          )}
                          iconClassName="h-[18px] w-[18px]"
                        />

                        <InviteClientDialog
                          trigger={
                            <Button
                              className={getHeaderUtilityButtonClassName(
                                isLightMode,
                              )}
                              variant="ghost"
                            >
                              <Plus className="h-4 w-4" />
                              Invite client
                            </Button>
                          }
                        />

                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button
                              type="button"
                              className={getHeaderPillClassName(isLightMode)}
                              aria-label="Workspace menu"
                            >
                              <div
                                className={getHeaderPillIconClassName(
                                  isLightMode,
                                )}
                              >
                                <Building2 className="h-4 w-4 [stroke-width:1.7]" />
                              </div>
                              <div className="min-w-0 flex-1 space-y-0.5 text-left">
                                <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-primary/80">
                                  Workspace
                                </p>
                                <p className="max-w-[138px] truncate text-[0.92rem] font-medium text-foreground">
                                  {workspaceDisplayName}
                                </p>
                              </div>
                              <span
                                className={getHeaderPillChevronClassName(
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
                            className="w-72"
                          >
                            <DropdownMenuLabel>
                              Active workspace
                            </DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={() => navigate("/pt-hub")}
                            >
                              <div className="flex min-w-0 flex-1 items-center gap-3">
                                <span className="app-dropdown-icon-badge">
                                  <ArrowUpRight className="h-4 w-4 [stroke-width:1.7]" />
                                </span>
                                <div className="min-w-0">
                                  <p className="truncate font-medium text-foreground">
                                    Repsync PT Hub
                                  </p>
                                  <p className="text-xs text-muted-foreground">
                                    Business and admin workspace
                                  </p>
                                </div>
                              </div>
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            {workspaceSwitcherQuery.isLoading ? (
                              <DropdownMenuItem disabled>
                                Loading workspaces...
                              </DropdownMenuItem>
                            ) : workspaces.length === 0 ? (
                              <DropdownMenuItem disabled>
                                No workspaces found
                              </DropdownMenuItem>
                            ) : (
                              workspaces.map((workspace) => (
                                <DropdownMenuItem
                                  key={workspace.id}
                                  onClick={() => {
                                    switchWorkspace(workspace.id);
                                    navigate("/pt/dashboard");
                                  }}
                                >
                                  <div className="flex min-w-0 flex-1 items-center gap-3">
                                    <span className="app-dropdown-icon-badge">
                                      <Building2 className="h-4 w-4 [stroke-width:1.7]" />
                                    </span>
                                    <p className="truncate font-medium text-foreground">
                                      {workspace.name?.trim() || "PT Workspace"}
                                    </p>
                                  </div>
                                  {workspace.id === workspaceId ? (
                                    <Check className="h-4 w-4 text-primary [stroke-width:1.9]" />
                                  ) : null}
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
                              <span className="app-dropdown-icon-badge">
                                <Plus className="h-4 w-4 [stroke-width:1.7]" />
                              </span>
                              Create workspace
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>

                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button
                              type="button"
                              className={getHeaderPillClassName(isLightMode)}
                              aria-label="Profile menu"
                            >
                              <div
                                className={getHeaderPillIconClassName(
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
                                  {profileDisplayName}
                                </p>
                              </div>
                              <span
                                className={getHeaderPillChevronClassName(
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
                            className="w-56"
                          >
                            <DropdownMenuLabel>Profile</DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={() => navigate(workspaceSettingsPath)}
                            >
                              <span className="app-dropdown-icon-badge">
                                <Settings className="h-4 w-4 [stroke-width:1.7]" />
                              </span>
                              Settings
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
                              onClick={signOut}
                            >
                              <span className="app-dropdown-icon-badge">
                                <LogOut className="h-4 w-4 [stroke-width:1.7]" />
                              </span>
                              {isSigningOut ? "Signing out..." : "Sign out"}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                      <div
                        ref={searchShellRef}
                        className="relative w-full lg:max-w-[32rem]"
                      >
                        <Search className="app-search-icon h-3.5 w-3.5" />
                        <Input
                          placeholder="Search clients, programs, tags..."
                          className="app-search-input"
                          aria-label="Search clients"
                          value={searchInput}
                          onChange={(event) => {
                            setSearchInput(event.target.value);
                            setSearchOpen(true);
                          }}
                          onFocus={() => setSearchOpen(true)}
                          onKeyDown={(event) => {
                            if (!searchResults.length) return;

                            if (event.key === "ArrowDown") {
                              event.preventDefault();
                              setSearchOpen(true);
                              setSearchHighlightIndex((current) =>
                                Math.min(current + 1, searchResults.length - 1),
                              );
                            }

                            if (event.key === "ArrowUp") {
                              event.preventDefault();
                              setSearchHighlightIndex((current) =>
                                Math.max(current - 1, 0),
                              );
                            }

                            if (event.key === "Enter") {
                              event.preventDefault();
                              const selected =
                                searchResults[searchHighlightIndex] ??
                                searchResults[0];
                              if (selected) {
                                handleSearchSelect(selected);
                              }
                            }

                            if (event.key === "Escape") {
                              setSearchOpen(false);
                            }
                          }}
                        />
                        {searchOpen ? (
                          <div className="absolute inset-x-0 top-[calc(100%+0.6rem)] z-30 overflow-hidden rounded-[24px] border border-border/75 bg-[var(--popover-bg)] p-2 shadow-[var(--popover-shadow)] backdrop-blur-2xl">
                            {searchQuery.isLoading ? (
                              <div className="px-3 py-3 text-sm text-muted-foreground">
                                Searching workspace...
                              </div>
                            ) : searchResults.length === 0 ? (
                              <div className="px-3 py-3 text-sm text-muted-foreground">
                                No matching results.
                              </div>
                            ) : (
                              <div className="space-y-1">
                                {searchResults.map((result, index) => (
                                  <button
                                    key={result.id}
                                    type="button"
                                    className={cn(
                                      "flex w-full items-center justify-between gap-3 rounded-[18px] px-3 py-3 text-left transition-colors",
                                      index === searchHighlightIndex
                                        ? "bg-card/80 text-foreground"
                                        : "text-foreground/90 hover:bg-card/72",
                                    )}
                                    onMouseEnter={() =>
                                      setSearchHighlightIndex(index)
                                    }
                                    onClick={() => handleSearchSelect(result)}
                                  >
                                    <div className="min-w-0">
                                      <p className="truncate text-sm font-medium text-foreground">
                                        {result.label}
                                      </p>
                                      <p className="truncate text-xs text-muted-foreground">
                                        {result.meta}
                                      </p>
                                    </div>
                                    <span className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                                      {result.type}
                                    </span>
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </header>

                <main className="min-w-0 lg:min-h-0 lg:flex-1 lg:overflow-x-hidden lg:overflow-y-auto lg:pr-1">
                  <div className="pt-content-zoom">
                    <RouteTransition
                      className="grid gap-6"
                      routeKey={routeTransitionKey}
                    >
                      <Outlet />
                    </RouteTransition>
                  </div>
                </main>
              </div>
            </WorkspaceHeaderModeProvider>
          </PtMessageComposeProvider>
        </div>
      </PageContainer>
      <AppFooter className="mt-4 sm:mt-5 lg:mt-0" />

      <Dialog open={createWorkspaceOpen} onOpenChange={setCreateWorkspaceOpen}>
        <DialogContent className="w-[92vw] max-w-[460px]">
          <DialogHeader>
            <DialogTitle>Create workspace</DialogTitle>
            <DialogDescription>
              Add another workspace to this PT account, then switch between them
              from the workspace menu.
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
              isInvalid={hasWorkspaceNameOverLimit}
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
            <FieldCharacterMeta
              count={workspaceNameLimitState.count}
              limit={workspaceNameLimitState.limit}
              errorText={workspaceNameLimitState.errorText}
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
              disabled={isCreatingWorkspace || hasWorkspaceNameOverLimit}
            >
              {isCreatingWorkspace ? "Creating..." : "Create workspace"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

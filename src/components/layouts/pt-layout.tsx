import { NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  Bell,
  BookOpen,
  CalendarDays,
  ClipboardList,
  Dumbbell,
  LayoutDashboard,
  MessageCircle,
  Menu,
  Plus,
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { InviteClientDialog } from "../pt/invite-client-dialog";
import { useWorkspace } from "../../lib/use-workspace";
import { useAuth } from "../../lib/auth";
import { supabase } from "../../lib/supabase";
import { LoadingScreen } from "../common/bootstrap-gate";
import { formatRelativeTime } from "../../lib/relative-time";
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
];

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
};

export function PtLayout() {
  const navigate = useNavigate();
  const { workspaceId, loading, error } = useWorkspace();
  const { authError, user } = useAuth();
  const { resolvedTheme, toggleTheme } = useTheme();
  const errorMessage =
    error?.message ??
    authError?.message ??
    (workspaceId ? null : "Workspace not found.");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);

  useEffect(() => {
    const loadNotifications = async () => {
      if (!workspaceId || !user?.id) {
        setNotifications([]);
        return;
      }
      setNotificationsLoading(true);
      try {
        const now = new Date();
        const nowIso = now.toISOString();
        const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
        const twoDaysAgoIso = twoDaysAgo.toISOString();
        const sevenDaysAheadIso = new Date(
          now.getTime() + 7 * 24 * 60 * 60 * 1000,
        ).toISOString();
        const twoDaysAgoDateKey = twoDaysAgo.toISOString().slice(0, 10);

        const clientsRes = await supabase
          .from("clients")
          .select("id, display_name, status")
          .eq("workspace_id", workspaceId);
        if (clientsRes.error) throw clientsRes.error;
        const clientIds = ((clientsRes.data ?? []) as ClientSummaryRow[]).map(
          (c) => c.id,
        );

        const [convRes, workoutsRes, habitsRes, checkinsRes, eventsRes] =
          await Promise.all([
            supabase
              .from("conversations")
              .select(
                "id, client_id, last_message_at, last_message_sender_name, last_message_preview, last_message_sender_role",
              )
              .eq("workspace_id", workspaceId)
              .eq("last_message_sender_role", "client")
              .gte("last_message_at", twoDaysAgoIso)
              .order("last_message_at", { ascending: false })
              .limit(8),
            supabase
              .from("assigned_workouts")
              .select("id, client_id, completed_at, scheduled_date")
              .eq("workspace_id", workspaceId)
              .eq("status", "completed")
              .gte("completed_at", twoDaysAgoIso)
              .order("completed_at", { ascending: false })
              .limit(12),
            supabase
              .from("habit_logs")
              .select("id, client_id, log_date, created_at")
              .in(
                "client_id",
                clientIds.length
                  ? clientIds
                  : ["00000000-0000-0000-0000-000000000000"],
              )
              .gte("log_date", twoDaysAgoDateKey)
              .order("log_date", { ascending: false })
              .limit(12),
            supabase
              .from("checkins")
              .select("id, client_id, submitted_at, week_ending_saturday")
              .in(
                "client_id",
                clientIds.length
                  ? clientIds
                  : ["00000000-0000-0000-0000-000000000000"],
              )
              .not("submitted_at", "is", null)
              .gte("submitted_at", twoDaysAgoIso)
              .order("submitted_at", { ascending: false })
              .limit(12),
            supabase
              .from("coach_calendar_events")
              .select("id, title, starts_at")
              .eq("workspace_id", workspaceId)
              .gte("starts_at", nowIso)
              .lte("starts_at", sevenDaysAheadIso)
              .order("starts_at", { ascending: true })
              .limit(10),
          ]);

        if (convRes.error) throw convRes.error;
        if (workoutsRes.error) throw workoutsRes.error;
        if (habitsRes.error) throw habitsRes.error;
        if (checkinsRes.error) throw checkinsRes.error;
        if (eventsRes.error) throw eventsRes.error;

        const clientMap = new Map<string, ClientSummaryRow>();
        ((clientsRes.data ?? []) as ClientSummaryRow[]).forEach((client) => {
          clientMap.set(client.id, client);
        });

        const items: NotificationItem[] = [];
        const lastActivityByClient = new Map<string, number>();
        const trackClientActivity = (
          clientId: string | null,
          iso: string | null,
        ) => {
          if (!clientId || !iso) return;
          const ts = new Date(iso).getTime();
          if (!Number.isFinite(ts)) return;
          const existing = lastActivityByClient.get(clientId) ?? 0;
          if (ts > existing) lastActivityByClient.set(clientId, ts);
        };

        (
          (convRes.data ?? []) as Array<{
            id: string;
            client_id: string | null;
            last_message_at: string | null;
            last_message_sender_name: string | null;
            last_message_preview: string | null;
          }>
        ).forEach((row) => {
          if (!row.client_id || !row.last_message_at) return;
          const clientName =
            clientMap.get(row.client_id)?.display_name ?? "Client";
          items.push({
            id: `msg-${row.id}`,
            title: "New message",
            description: `${clientName}: ${row.last_message_preview ?? "Sent a message"}`,
            createdAt: row.last_message_at,
            to: `/pt/messages?client=${row.client_id}`,
          });
          trackClientActivity(row.client_id, row.last_message_at);
        });

        (
          (workoutsRes.data ?? []) as Array<{
            id: string;
            client_id: string | null;
            completed_at: string | null;
          }>
        ).forEach((row) => {
          if (!row.client_id || !row.completed_at) return;
          const clientName =
            clientMap.get(row.client_id)?.display_name ?? "Client";
          items.push({
            id: `workout-${row.id}`,
            title: "Workout completed",
            description: `${clientName} completed a workout`,
            createdAt: row.completed_at,
            to: `/pt/clients/${row.client_id}?tab=workout`,
          });
          trackClientActivity(row.client_id, row.completed_at);
        });

        (
          (habitsRes.data ?? []) as Array<{
            id: string;
            client_id: string | null;
            log_date: string | null;
            created_at: string | null;
          }>
        ).forEach((row) => {
          if (!row.client_id || !row.log_date) return;
          const clientName =
            clientMap.get(row.client_id)?.display_name ?? "Client";
          const createdAt = row.created_at ?? `${row.log_date}T12:00:00.000Z`;
          items.push({
            id: `habit-${row.id}`,
            title: "Habits completed",
            description: `${clientName} logged habits for ${row.log_date}`,
            createdAt,
            to: `/pt/clients/${row.client_id}?tab=habits`,
          });
          trackClientActivity(row.client_id, createdAt);
        });

        (
          (checkinsRes.data ?? []) as Array<{
            id: string;
            client_id: string | null;
            submitted_at: string | null;
            week_ending_saturday: string | null;
          }>
        ).forEach((row) => {
          if (!row.client_id || !row.submitted_at) return;
          const clientName =
            clientMap.get(row.client_id)?.display_name ?? "Client";
          items.push({
            id: `checkin-${row.id}`,
            title: "Check-in submitted",
            description: `${clientName} submitted weekly check-in`,
            createdAt: row.submitted_at,
            to: `/pt/clients/${row.client_id}?tab=checkins`,
          });
          trackClientActivity(row.client_id, row.submitted_at);
        });

        (
          (eventsRes.data ?? []) as Array<{
            id: string;
            title: string | null;
            starts_at: string | null;
          }>
        ).forEach((row) => {
          if (!row.starts_at) return;
          items.push({
            id: `event-${row.id}`,
            title: "Upcoming calendar event",
            description: row.title ?? "Scheduled event",
            createdAt: row.starts_at,
            to: "/pt/calendar",
          });
        });

        const inactiveCutoffTs = twoDaysAgo.getTime();
        ((clientsRes.data ?? []) as ClientSummaryRow[]).forEach((client) => {
          const status = (client.status ?? "active").toLowerCase();
          if (status !== "active") return;
          const lastTs = lastActivityByClient.get(client.id) ?? 0;
          if (!lastTs || lastTs < inactiveCutoffTs) {
            items.push({
              id: `inactive-${client.id}`,
              title: "Client inactive for 2+ days",
              description: `${client.display_name ?? "Client"} has no recent activity`,
              createdAt: twoDaysAgoIso,
              to: `/pt/clients/${client.id}?tab=overview`,
            });
          }
        });

        const deduped = Array.from(
          new Map(items.map((item) => [item.id, item])).values(),
        )
          .sort(
            (a, b) =>
              new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
          )
          .slice(0, 30);

        setNotifications(deduped);
      } catch {
        setNotifications([]);
      } finally {
        setNotificationsLoading(false);
      }
    };

    loadNotifications();
    const interval = window.setInterval(loadNotifications, 60_000);
    return () => window.clearInterval(interval);
  }, [workspaceId, user?.id]);

  const unreadCount = useMemo(() => notifications.length, [notifications]);
  const userInitial = (
    user?.email?.charAt(0) ||
    user?.phone?.charAt(0) ||
    "U"
  ).toUpperCase();

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
        <aside className="hidden w-72 flex-col border-r border-border bg-card px-4 py-6 md:flex">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <span className="text-lg font-semibold tracking-tight">
                CoachOS
              </span>
              <p className="text-xs text-muted-foreground">
                Performance console
              </p>
            </div>
            <Sparkles className="h-5 w-5 text-accent" />
          </div>
          <div className="mb-8 rounded-xl border border-border bg-background p-3">
            <p className="text-xs text-muted-foreground">Workspace</p>
            <div className="mt-2 flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold">Velocity PT Lab</p>
                <p className="text-xs text-muted-foreground">
                  Coach - Pro plan
                </p>
              </div>
              <Button size="icon" variant="secondary">
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
            </div>
          </div>
          <nav className="flex flex-1 flex-col gap-2">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
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
                <p className="text-sm font-semibold">Velocity PT Lab</p>
                <p className="text-xs text-muted-foreground">
                  Coach - Pro plan
                </p>
              </div>
              <Button size="icon" variant="secondary">
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
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="relative"
                      aria-label="Notifications"
                    >
                      <Bell className="h-4 w-4" />
                      {unreadCount > 0 ? (
                        <>
                          <span className="absolute right-1 top-1 h-2.5 w-2.5 rounded-full bg-accent" />
                          <span className="absolute -right-1 -top-1 min-w-[1.1rem] rounded-full bg-accent px-1 text-[10px] font-semibold text-accent-foreground">
                            {unreadCount > 99 ? "99+" : unreadCount}
                          </span>
                        </>
                      ) : null}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="end"
                    className="w-[360px] max-w-[90vw]"
                  >
                    <DropdownMenuLabel>Notifications</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {notificationsLoading ? (
                      <div className="px-2 py-2 text-xs text-muted-foreground">
                        Loading...
                      </div>
                    ) : notifications.length === 0 ? (
                      <div className="px-2 py-2 text-xs text-muted-foreground">
                        No new notifications.
                      </div>
                    ) : (
                      notifications.slice(0, 12).map((item) => (
                        <DropdownMenuItem
                          key={item.id}
                          className="cursor-pointer items-start py-2"
                          onClick={() => navigate(item.to)}
                        >
                          <div className="space-y-0.5">
                            <p className="text-sm font-medium leading-tight">
                              {item.title}
                            </p>
                            <p className="text-xs text-muted-foreground leading-snug">
                              {item.description}
                            </p>
                            <p className="text-[10px] uppercase tracking-wide text-muted-foreground/80">
                              {formatRelativeTime(item.createdAt)}
                            </p>
                          </div>
                        </DropdownMenuItem>
                      ))
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
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
                    <DropdownMenuItem onClick={() => navigate("/pt/settings")}>
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
    </div>
  );
}

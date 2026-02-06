import { NavLink, Outlet } from "react-router-dom";
import {
  Bell,
  BookOpen,
  CalendarDays,
  ClipboardList,
  Dumbbell,
  LayoutDashboard,
  Menu,
  Plus,
  Search,
  Settings,
  Sparkles,
  Users,
} from "lucide-react";
import { useState } from "react";
import { cn } from "../../lib/utils";
import { ThemeToggle } from "../common/theme-toggle";
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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../ui/tooltip";
import { InviteClientDialog } from "../pt/invite-client-dialog";
import { useWorkspace } from "../../lib/use-workspace";
import { useAuth } from "../../lib/auth";
import { supabase } from "../../lib/supabase";
import { LoadingScreen } from "../common/bootstrap-gate";

const navItems = [
  { label: "Dashboard", to: "/pt/dashboard", icon: LayoutDashboard },
  { label: "Clients", to: "/pt/clients", icon: Users },
  { label: "Programs", to: "/pt/programs", icon: CalendarDays },
  { label: "Workouts", to: "/pt/templates/workouts", icon: Dumbbell },
  { label: "Exercise Library", to: "/pt/settings/exercises", icon: BookOpen },
  { label: "Check-ins", to: "/pt/checkins/templates", icon: ClipboardList },
  { label: "Settings", to: "/pt/settings", icon: Settings },
];

export function PtLayout() {
  const { workspaceId, loading, error } = useWorkspace();
  const { authError } = useAuth();
  const errorMessage =
    error?.message ?? authError?.message ?? (workspaceId ? null : "Workspace not found.");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

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
    <TooltipProvider>
      <div className="min-h-screen bg-background">
        <div className="flex min-h-screen">
          <aside className="hidden w-72 flex-col border-r border-border bg-card px-4 py-6 md:flex">
            <div className="mb-6 flex items-center justify-between">
              <div>
                <span className="text-lg font-semibold tracking-tight">CoachOS</span>
                <p className="text-xs text-muted-foreground">Performance console</p>
              </div>
              <Sparkles className="h-5 w-5 text-accent" />
            </div>
            <div className="mb-8 rounded-xl border border-border bg-background p-3">
              <p className="text-xs text-muted-foreground">Workspace</p>
              <div className="mt-2 flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold">Velocity PT Lab</p>
                  <p className="text-xs text-muted-foreground">Coach - Pro plan</p>
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
                          "border-accent/40 bg-accent/10 text-foreground shadow-sm shadow-accent/10"
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
              <p className="mt-1">Enable performance alerts for clients with low adherence.</p>
              <Button className="mt-3 w-full" size="sm">
                Activate alerts
              </Button>
            </div>
          </aside>
          <div
            className={cn(
              "fixed inset-0 z-40 bg-background/80 opacity-0 transition md:hidden",
              mobileNavOpen ? "opacity-100" : "pointer-events-none"
            )}
            aria-hidden={!mobileNavOpen}
            onClick={() => setMobileNavOpen(false)}
          />
          <aside
            className={cn(
              "fixed inset-y-0 left-0 z-50 w-72 -translate-x-full border-r border-border bg-card px-4 py-6 transition md:hidden",
              mobileNavOpen && "translate-x-0"
            )}
          >
            <div className="mb-6 flex items-center justify-between">
              <div>
                <span className="text-lg font-semibold tracking-tight">CoachOS</span>
                <p className="text-xs text-muted-foreground">Performance console</p>
              </div>
              <Button size="icon" variant="ghost" onClick={() => setMobileNavOpen(false)}>
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
                  <p className="text-xs text-muted-foreground">Coach - Pro plan</p>
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
                          "border-accent/40 bg-accent/10 text-foreground shadow-sm shadow-accent/10"
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
              <p className="mt-1">Enable performance alerts for clients with low adherence.</p>
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
                    <h1 className="text-lg font-semibold tracking-tight">PT Workspace</h1>
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
                      <InviteClientDialog trigger={<DropdownMenuItem>Invite client</DropdownMenuItem>} />
                      <DropdownMenuItem>Create template</DropdownMenuItem>
                      <DropdownMenuItem>Assign workout</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="ghost" size="icon" className="relative">
                        <Bell className="h-4 w-4" />
                        <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-accent" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>3 new alerts</TooltipContent>
                  </Tooltip>
                  <ThemeToggle />
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
    </TooltipProvider>
  );
}

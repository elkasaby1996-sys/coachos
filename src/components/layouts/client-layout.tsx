import { NavLink, Outlet } from "react-router-dom";
import { CalendarDays, Home, MessageCircle, TrendingUp, UserCircle } from "lucide-react";
import { cn } from "../../lib/utils";
import { ThemeToggle } from "../common/theme-toggle";
import { Button } from "../ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { useWorkspace } from "../../lib/use-workspace";
import { useAuth } from "../../lib/auth";
import { supabase } from "../../lib/supabase";
import { LoadingScreen } from "../common/bootstrap-gate";

const navItems = [
  { label: "Home", to: "/app/home", icon: Home },
  { label: "Progress", to: "/app/progress", icon: TrendingUp },
  { label: "Habits", to: "/app/habits", icon: CalendarDays },
  { label: "Messages", to: "/app/messages", icon: MessageCircle },
  { label: "Profile", to: "/app/profile", icon: UserCircle },
];

export function ClientLayout() {
  const { workspaceId, loading, error } = useWorkspace();
  const { authError } = useAuth();
  const errorMessage =
    error?.message ?? authError?.message ?? (workspaceId ? null : "Workspace not found.");

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
      <div className="flex min-h-screen w-full">
        <aside className="hidden w-64 flex-col border-r border-border bg-card px-4 py-6 md:flex">
          <div className="mb-8 flex items-center justify-between">
            <span className="text-lg font-semibold tracking-tight">CoachOS</span>
            <ThemeToggle />
          </div>
          <nav className="flex flex-1 flex-col gap-2">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-muted",
                    isActive && "bg-muted text-foreground"
                  )
                }
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </NavLink>
            ))}
          </nav>
        </aside>
        <div className="flex flex-1 min-w-0 flex-col">
          <header className="flex items-center justify-between border-b border-border bg-card px-4 py-4 md:hidden">
            <div>
              <p className="text-sm text-muted-foreground">Client portal</p>
              <h1 className="text-lg font-semibold tracking-tight">Today</h1>
            </div>
            <ThemeToggle />
          </header>
          <main className="flex-1 min-w-0 px-4 py-6 md:px-8">
            <Outlet />
          </main>
          <nav className="fixed bottom-0 left-0 right-0 border-t border-border bg-card px-4 py-2 md:hidden">
            <div className="flex items-center justify-between">
              {navItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    cn(
                      "flex flex-col items-center gap-1 text-xs text-muted-foreground",
                      isActive && "text-foreground"
                    )
                  }
                >
                  <item.icon className="h-5 w-5" />
                  {item.label}
                </NavLink>
              ))}
            </div>
          </nav>
        </div>
      </div>
    </div>
  );
}

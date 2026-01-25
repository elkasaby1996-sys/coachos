import { NavLink, Outlet } from "react-router-dom";
import { cn } from "../../lib/utils";
import { ThemeToggle } from "../common/theme-toggle";
import { Button } from "../ui/button";

const navItems = [
  { label: "Dashboard", to: "/pt/dashboard" },
  { label: "Clients", to: "/pt/clients" },
  { label: "Workouts", to: "/pt/templates/workouts" },
  { label: "Check-ins", to: "/pt/checkins/templates" },
  { label: "Settings", to: "/pt/settings" },
];

export function PtLayout() {
  return (
    <div className="min-h-screen bg-background">
      <div className="flex min-h-screen">
        <aside className="hidden w-64 flex-col border-r border-border bg-card px-4 py-6 md:flex">
          <div className="mb-8 flex items-center justify-between">
            <span className="text-lg font-semibold tracking-tight">CoachOS</span>
            <Button variant="secondary" size="sm">
              Collapse
            </Button>
          </div>
          <nav className="flex flex-1 flex-col gap-2">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  cn(
                    "rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-muted",
                    isActive && "bg-muted text-foreground"
                  )
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        </aside>
        <div className="flex flex-1 flex-col">
          <header className="flex items-center justify-between border-b border-border bg-card px-4 py-4 md:px-8">
            <div>
              <p className="text-sm text-muted-foreground">Welcome back</p>
              <h1 className="text-lg font-semibold tracking-tight">PT Workspace</h1>
            </div>
            <div className="flex items-center gap-3">
              <Button variant="secondary">Invite client</Button>
              <ThemeToggle />
            </div>
          </header>
          <main className="flex-1 bg-background px-4 py-6 md:px-8">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
}

import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { settingsNavItems } from "./nav";
import { cn } from "../../lib/utils";

export function SettingsLayout() {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <div className="space-y-5">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Settings
        </h1>
        <p className="text-sm text-muted-foreground">
          Manage workspace, account, and product defaults.
        </p>
      </header>

      <div className="md:hidden">
        <label
          htmlFor="settings-section-select"
          className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground"
        >
          Settings section
        </label>
        <select
          id="settings-section-select"
          className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"
          value={
            settingsNavItems.find((item) =>
              location.pathname.startsWith(item.to),
            )?.to ?? "/settings/workspace"
          }
          onChange={(event) => navigate(event.target.value)}
        >
          {settingsNavItems.map((item) => (
            <option key={item.id} value={item.to}>
              {item.label}
            </option>
          ))}
        </select>
      </div>

      <div className="grid gap-6 md:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="hidden md:block">
          <nav className="sticky top-24 rounded-2xl border border-border bg-card/70 p-2">
            {settingsNavItems.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.id}
                  to={item.to}
                  data-testid={`settings-nav-${item.id}`}
                  className={({ isActive }) =>
                    cn(
                      "flex items-start gap-3 rounded-xl px-3 py-3 transition",
                      isActive
                        ? "bg-accent/10 text-foreground"
                        : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                    )
                  }
                >
                  <span className="mt-0.5 rounded-md border border-border bg-background p-1.5">
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="space-y-1">
                    <span className="block text-sm font-medium">
                      {item.label}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {item.description}
                    </span>
                  </span>
                </NavLink>
              );
            })}
          </nav>
        </aside>

        <div className="min-w-0">
          <Outlet />
        </div>
      </div>
    </div>
  );
}

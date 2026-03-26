import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { WorkspacePageHeader } from "../../components/pt/workspace-page-header";
import { settingsNavItems } from "./nav";
import { cn } from "../../lib/utils";

export function SettingsLayout() {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <div className="space-y-5">
      <WorkspacePageHeader
        title="Settings"
        description="Manage workspace, account, and product defaults with the same shared system used across the PT workspace."
      />

      <div className="md:hidden">
        <label
          htmlFor="settings-section-select"
          className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground"
        >
          Settings section
        </label>
        <select
          id="settings-section-select"
          className="w-full"
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
          <nav className="sticky top-24 rounded-[24px] border border-border/70 bg-[linear-gradient(180deg,oklch(var(--card)/0.98),oklch(var(--card)/0.9))] p-2">
            {settingsNavItems.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.id}
                  to={item.to}
                  data-testid={`settings-nav-${item.id}`}
                  className={({ isActive }) =>
                    cn(
                      "flex items-start gap-3 rounded-2xl px-3 py-3 transition",
                      isActive
                        ? "border border-border/70 bg-background/70 text-foreground"
                        : "border border-transparent text-muted-foreground hover:border-border/60 hover:bg-background/55 hover:text-foreground",
                    )
                  }
                >
                  <span className="mt-0.5 rounded-xl border border-border/70 bg-background/75 p-1.5">
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

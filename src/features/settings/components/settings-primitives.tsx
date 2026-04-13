import { motion, useReducedMotion } from "framer-motion";
import { NavLink, useLocation } from "react-router-dom";
import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../../../components/ui/card";
import { cn } from "../../../lib/utils";
import {
  getModuleToneClasses,
  getModuleToneStyle,
} from "../../../lib/module-tone";

export type SettingsTabLink = {
  id: string;
  label: string;
  description?: string;
  to: string;
};

export function ScopeBadge({
  scope,
}: {
  scope: "PT Hub" | "Workspace" | "Client";
}) {
  return <Badge variant="secondary">{scope}</Badge>;
}

export function SettingsHeader({
  title,
  description,
  actions,
  scope,
}: {
  title: string;
  description: string;
  actions?: React.ReactNode;
  scope: "PT Hub" | "Workspace" | "Client";
}) {
  const toneClasses = getModuleToneClasses("settings");

  return (
    <header className="space-y-3" style={getModuleToneStyle("settings")}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p
          className={cn(
            "inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.24em]",
            toneClasses.text,
          )}
        >
          <span
            aria-hidden
            className={cn("h-1.5 w-1.5 rounded-full", toneClasses.dot)}
          />
          Settings
        </p>
        <div className="flex items-center gap-2">
          <ScopeBadge scope={scope} />
          {actions}
        </div>
      </div>
      <div className="space-y-1">
        <h1
          className={cn(
            "text-[1.9rem] font-semibold tracking-tight",
            toneClasses.title,
          )}
        >
          {title}
        </h1>
        <p className="max-w-3xl text-sm text-muted-foreground">{description}</p>
      </div>
    </header>
  );
}

export function SettingsTabs({ tabs }: { tabs: SettingsTabLink[] }) {
  const location = useLocation();
  const reduceMotion = useReducedMotion();
  const activePath = location.pathname.replace(/\/+$/, "");

  const isTabActive = (to: string) => {
    const [rawPath = "", rawQuery = ""] = to.split("?");
    const tabPath = rawPath.replace(/\/+$/, "");
    const pathMatches = activePath === tabPath || activePath.startsWith(`${tabPath}/`);
    if (!pathMatches) return false;
    if (!rawQuery) return true;

    const expectedParams = new URLSearchParams(rawQuery);
    const activeParams = new URLSearchParams(location.search);
    for (const [key, value] of expectedParams.entries()) {
      if (activeParams.get(key) !== value) {
        return false;
      }
    }
    return true;
  };

  return (
    <nav
      className="pt-hub-tab-rail h-auto min-h-[3.75rem] justify-center"
      aria-label="Settings tabs"
    >
      {tabs.map((tab) => {
        const active = isTabActive(tab.to);

        return (
          <NavLink
            key={tab.id}
            to={tab.to}
            data-state={active ? "active" : "inactive"}
            className={cn(
              "pt-hub-tab-trigger group",
              active ? "text-foreground" : "text-muted-foreground",
            )}
          >
            {active ? (
              <motion.span
                layoutId="settings-tab-active-pill"
                className="pt-hub-tab-active-pill absolute inset-0 rounded-[18px] border"
                transition={
                  reduceMotion
                    ? { duration: 0 }
                    : {
                        type: "spring",
                        stiffness: 280,
                        damping: 30,
                      }
                }
              />
            ) : null}
            <span className="relative z-10">{tab.label}</span>
          </NavLink>
        );
      })}
    </nav>
  );
}

export function SettingsPageShell({
  header,
  tabs,
  children,
  rightRail,
}: {
  header?: React.ReactNode;
  tabs: React.ReactNode;
  children: React.ReactNode;
  rightRail?: React.ReactNode;
}) {
  return (
    <section className="space-y-5">
      {header ?? null}
      <div className="sticky top-0 z-30 py-2">
        <div className="mx-auto flex w-full max-w-full items-center gap-3">
          <div className="min-w-0 flex-1">{tabs}</div>
          <div
            id="settings-nav-action-slot"
            className="flex shrink-0 items-center justify-end"
          />
        </div>
      </div>
      {rightRail ? (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="min-w-0 space-y-4">{children}</div>
          <aside className="space-y-4 xl:sticky xl:top-20 xl:self-start">
            {rightRail}
          </aside>
        </div>
      ) : (
        <div className="space-y-4">{children}</div>
      )}
    </section>
  );
}

export function SettingsSectionCard({
  title,
  children,
  action,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <Card className="surface-panel rounded-[24px] border-border/70">
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <CardTitle className="text-base font-semibold">{title}</CardTitle>
        </div>
        {action}
      </CardHeader>
      <CardContent className="space-y-4">{children}</CardContent>
    </Card>
  );
}

export function SettingsFieldRow({
  label,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-3 lg:grid-cols-[minmax(0,220px)_1fr] lg:gap-6">
      <div className="space-y-1">
        <p className="text-sm font-medium text-foreground">{label}</p>
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

export function SettingsHelperCallout(_props: {
  title: string;
  body: string;
  tone?: "info" | "warning";
}) {
  return null;
}

export function StickySaveBar({
  isDirty,
  isSaving,
  onSave,
  onDiscard,
  statusText,
}: {
  isDirty: boolean;
  isSaving?: boolean;
  onSave: () => void | boolean | Promise<void | boolean>;
  onDiscard: () => void;
  statusText?: string;
}) {
  if (!isDirty) return null;

  return (
    <div className="sticky bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-20 mt-5 lg:bottom-6">
      <div
        className="surface-panel-portal flex flex-col gap-3 rounded-[20px] border border-border/70 px-4 py-3 md:flex-row md:items-center md:justify-between"
        style={{
          backgroundColor: "var(--sticky-bar-bg)",
          boxShadow: "var(--sticky-shadow)",
        }}
      >
        <p className="text-sm text-muted-foreground">
          {statusText ?? "Unsaved changes"}
        </p>
        <div className="flex items-center gap-2">
          <Button type="button" variant="secondary" onClick={onDiscard}>
            Discard
          </Button>
          <Button
            type="button"
            onClick={() => void onSave()}
            disabled={Boolean(isSaving)}
          >
            {isSaving ? "Saving..." : "Save changes"}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function DisabledSettingField({
  value,
  placeholder,
}: {
  value?: string;
  placeholder?: string;
}) {
  return (
    <input
      readOnly
      disabled
      value={value ?? ""}
      placeholder={placeholder}
      className="h-10 w-full app-field cursor-not-allowed px-3 text-sm opacity-70"
    />
  );
}

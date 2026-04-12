import type { CSSProperties } from "react";

export const moduleTones = [
  "overview",
  "leads",
  "clients",
  "coaching",
  "checkins",
  "billing",
  "analytics",
  "profile",
  "settings",
] as const;

export type ModuleTone = (typeof moduleTones)[number];

export type ModuleToneClasses = {
  badge: string;
  iconBadge: string;
  dot: string;
  rail: string;
  text: string;
  title: string;
  card: string;
  panel: string;
  tab: string;
  navActive: string;
  navIcon: string;
};

export const moduleToneMeta: Record<
  ModuleTone,
  {
    label: string;
    chartVar: string;
  }
> = {
  overview: { label: "Overview", chartVar: "var(--module-overview-text)" },
  leads: { label: "Leads", chartVar: "var(--module-leads-text)" },
  clients: { label: "Clients", chartVar: "var(--module-clients-text)" },
  coaching: { label: "Coaching", chartVar: "var(--module-coaching-text)" },
  checkins: { label: "Check-ins", chartVar: "var(--module-checkins-text)" },
  billing: { label: "Billing", chartVar: "var(--module-billing-text)" },
  analytics: { label: "Analytics", chartVar: "var(--module-analytics-text)" },
  profile: { label: "Profile", chartVar: "var(--module-profile-text)" },
  settings: { label: "Settings", chartVar: "var(--module-settings-text)" },
};

const moduleToneClassMap: Record<ModuleTone, ModuleToneClasses> = {
  overview: buildModuleToneClasses("overview"),
  leads: buildModuleToneClasses("leads"),
  clients: buildModuleToneClasses("clients"),
  coaching: buildModuleToneClasses("coaching"),
  checkins: buildModuleToneClasses("checkins"),
  billing: buildModuleToneClasses("billing"),
  analytics: buildModuleToneClasses("analytics"),
  profile: buildModuleToneClasses("profile"),
  settings: buildModuleToneClasses("settings"),
};

function buildModuleToneClasses(_module: ModuleTone): ModuleToneClasses {
  return {
    badge: "section-accent-badge",
    iconBadge: "section-accent-icon-badge",
    dot: "section-accent-dot",
    rail: "section-accent-rail",
    text: "section-accent-kicker",
    title: "section-accent-title",
    card: "section-accent-card",
    panel: "section-accent-panel",
    tab: "section-accent-tab",
    navActive: "section-accent-nav-active",
    navIcon: "section-accent-nav-icon",
  };
}

const routeToneMatchers: Array<{ prefix: string; tone: ModuleTone }> = [
  { prefix: "/pt-hub/packages", tone: "profile" },
  { prefix: "/pt-hub/profile/preview", tone: "profile" },
  { prefix: "/pt-hub/profile", tone: "profile" },
  { prefix: "/pt-hub/leads", tone: "leads" },
  { prefix: "/pt-hub/clients", tone: "clients" },
  { prefix: "/pt-hub/workspaces", tone: "coaching" },
  { prefix: "/pt-hub/payments", tone: "billing" },
  { prefix: "/pt-hub/analytics", tone: "analytics" },
  { prefix: "/pt-hub/settings", tone: "settings" },
  { prefix: "/pt-hub", tone: "overview" },
  { prefix: "/pt/clients/", tone: "clients" },
  { prefix: "/pt/clients", tone: "clients" },
  { prefix: "/pt/checkins", tone: "checkins" },
  { prefix: "/pt/messages", tone: "coaching" },
  { prefix: "/pt/notifications", tone: "settings" },
  { prefix: "/pt/calendar", tone: "coaching" },
  { prefix: "/pt/program", tone: "coaching" },
  { prefix: "/pt/templates/workouts", tone: "coaching" },
  { prefix: "/pt/workout", tone: "coaching" },
  { prefix: "/pt/nutrition", tone: "coaching" },
  { prefix: "/pt/settings/exercises", tone: "coaching" },
  { prefix: "/pt/settings", tone: "settings" },
  { prefix: "/settings/", tone: "settings" },
  { prefix: "/workspace/", tone: "settings" },
  { prefix: "/pt/ops/status", tone: "settings" },
  { prefix: "/pt/dashboard", tone: "overview" },
  { prefix: "/app/workout-run", tone: "checkins" },
  { prefix: "/app/workout-summary", tone: "checkins" },
  { prefix: "/app/workout-today", tone: "checkins" },
  { prefix: "/app/progress", tone: "analytics" },
  { prefix: "/app/messages", tone: "coaching" },
  { prefix: "/app/checkin", tone: "checkins" },
  { prefix: "/app/workout", tone: "checkins" },
  { prefix: "/app/habits", tone: "checkins" },
  { prefix: "/app/profile", tone: "profile" },
  { prefix: "/app/onboarding", tone: "profile" },
  { prefix: "/app/baseline", tone: "profile" },
  { prefix: "/app/medical", tone: "clients" },
  { prefix: "/app/settings", tone: "settings" },
  { prefix: "/app/notifications", tone: "settings" },
  { prefix: "/app/home", tone: "overview" },
];

export function getModuleToneForPath(
  pathname: string,
  fallback: ModuleTone = "overview",
): ModuleTone {
  const match = routeToneMatchers.find((entry) => pathname.startsWith(entry.prefix));
  return match?.tone ?? fallback;
}

export function getModuleToneStyle(
  module: ModuleTone | null | undefined,
): CSSProperties | undefined {
  if (!module) return undefined;

  return {
    ["--section-accent" as const]: `oklch(var(--module-${module}))`,
    ["--section-accent-hover" as const]: `oklch(var(--module-${module}-hover))`,
    ["--section-accent-bg-soft" as const]: `var(--module-${module}-bg-soft)`,
    ["--section-accent-border" as const]: `var(--module-${module}-border)`,
    ["--section-accent-text" as const]: `var(--module-${module}-text)`,
    ["--section-accent-icon" as const]: `var(--module-${module}-icon)`,
    ["--section-accent-ring" as const]: `var(--module-${module}-ring)`,
    ["--section-accent-rail" as const]: `var(--module-${module}-rail)`,
    ["--accent" as const]: `var(--module-${module})`,
    ["--accent-hover" as const]: `var(--module-${module}-hover)`,
    ["--primary" as const]: `var(--module-${module})`,
    ["--ring" as const]: `var(--module-${module})`,
    ["--field-glass-border-focus" as const]: `var(--module-${module}-border)`,
    ["--field-glass-ring" as const]: `var(--module-${module}-ring)`,
  } as CSSProperties;
}

export function getModuleToneClasses(module: ModuleTone): ModuleToneClasses {
  return moduleToneClassMap[module];
}

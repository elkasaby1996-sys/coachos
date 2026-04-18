import { useMemo, type CSSProperties } from "react";
import { useLocation } from "react-router-dom";
import {
  getModuleToneForPath,
  getModuleToneStyle,
  type ModuleTone,
} from "../../lib/module-tone";
import { cn } from "../../lib/utils";
import { AppShellBackgroundLayer } from "./app-shell-background";
import { useTheme } from "./theme-provider";

type WireframeLoaderVariant = "screen" | "auth";
type WireframeShell = "public" | "client-workspace" | "pt-workspace" | "pt-hub";
type WireframeThemeMode = "dark" | "light";

const PT_HUB_THEME_STORAGE_KEY = "coachos-pt-hub-theme-mode";

interface WireframeLoaderProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: WireframeLoaderVariant;
  title?: string;
  message?: string;
  shell?: WireframeShell;
  tone?: ModuleTone;
  themeMode?: WireframeThemeMode;
  authWidthClassName?: string;
}

function WireframeBlock({
  className,
  style,
}: {
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "rounded-md bg-[oklch(var(--section-accent)/0.16)] opacity-90 motion-safe:animate-[pulse_2.4s_ease-in-out_infinite] motion-reduce:animate-none",
        className,
      )}
      style={style}
    />
  );
}

function WireframeLoaderCopy({
  title,
  message,
  align = "left",
}: {
  title: string;
  message: string;
  align?: "left" | "center";
}) {
  return (
    <div
      className={cn(
        "space-y-2",
        align === "center" ? "text-center" : "text-left",
      )}
    >
      <p className="text-sm font-medium text-foreground/90">{title}</p>
      <p className="text-sm leading-6 text-muted-foreground">{message}</p>
    </div>
  );
}

function getWireframeShell(pathname: string): WireframeShell {
  if (pathname.startsWith("/pt-hub")) return "pt-hub";
  if (
    pathname.startsWith("/pt") ||
    pathname.startsWith("/settings") ||
    pathname.startsWith("/workspace/")
  ) {
    return "pt-workspace";
  }
  if (pathname.startsWith("/app")) return "client-workspace";
  return "public";
}

function getWireframeTone(pathname: string, shell: WireframeShell): ModuleTone {
  if (pathname.startsWith("/signup/pt")) return "coaching";
  if (pathname.startsWith("/signup/client")) return "profile";
  if (pathname.startsWith("/client/onboarding")) return "profile";
  if (pathname.startsWith("/invite") || pathname.startsWith("/join")) {
    return "clients";
  }
  if (pathname.startsWith("/login") || pathname.startsWith("/signup")) {
    return shell === "pt-workspace" ? "coaching" : "overview";
  }

  return getModuleToneForPath(pathname, "overview");
}

function readPtHubThemeMode(): WireframeThemeMode {
  if (typeof window === "undefined") return "dark";

  const storedTheme = window.localStorage.getItem(PT_HUB_THEME_STORAGE_KEY);
  if (storedTheme === "dark" || storedTheme === "light") {
    return storedTheme;
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function getShellClassName(shell: WireframeShell, themeMode: WireframeThemeMode) {
  if (shell === "pt-hub") {
    return cn(
      "pt-hub-theme theme-shell-canvas",
      themeMode === "light" ? "pt-hub-theme-light" : "pt-hub-theme-dark",
    );
  }

  if (shell === "pt-workspace") {
    return "pt-workspace-theme theme-shell-canvas";
  }

  if (shell === "client-workspace") {
    return "theme-shell-canvas [background:var(--portal-page-bg)]";
  }

  return "theme-shell-canvas";
}

function getScreenOverlayStyle(
  tone: ModuleTone,
  themeMode: WireframeThemeMode,
): CSSProperties {
  return {
    background:
      themeMode === "light"
        ? `radial-gradient(circle at 14% 18%, oklch(var(--module-${tone}) / 0.14), transparent 30%), radial-gradient(circle at 82% 16%, oklch(var(--module-${tone}-hover) / 0.09), transparent 26%), linear-gradient(180deg, rgba(255,255,255,0.08), transparent 22%, oklch(var(--module-${tone}) / 0.04))`
        : `radial-gradient(circle at 14% 18%, oklch(var(--module-${tone}) / 0.18), transparent 30%), radial-gradient(circle at 82% 16%, oklch(var(--module-${tone}-hover) / 0.12), transparent 26%), linear-gradient(180deg, rgba(255,255,255,0.03), transparent 22%, rgba(0,0,0,0.12))`,
  };
}

function getPanelStyle(
  tone: ModuleTone,
  themeMode: WireframeThemeMode,
): CSSProperties {
  return {
    background:
      themeMode === "light"
        ? `linear-gradient(180deg, rgba(255,255,255,0.86), oklch(var(--module-${tone}) / 0.06))`
        : `linear-gradient(180deg, rgba(11,17,25,0.78), oklch(var(--module-${tone}) / 0.08))`,
    boxShadow:
      themeMode === "light"
        ? "0 18px 40px -30px rgba(15, 23, 42, 0.12)"
        : "0 18px 44px -32px rgba(2, 6, 23, 0.36)",
    contain: "layout paint",
  };
}

function getScreenContainerClassName(shell: WireframeShell) {
  if (shell === "client-workspace") {
    return "relative z-10 mx-auto flex min-h-screen w-full max-w-[1628px] items-center px-4 py-8 sm:px-6 lg:px-6 xl:px-6";
  }

  if (shell === "pt-workspace" || shell === "pt-hub") {
    return "relative z-10 mx-auto flex min-h-screen w-full max-w-[1720px] items-center px-4 py-8 sm:px-5 lg:px-5 xl:px-6";
  }

  return "relative z-10 mx-auto flex min-h-screen w-full max-w-[1360px] items-center px-4 py-8 sm:px-6 lg:px-8 xl:px-10";
}

export function getWireframeAuthWidthClass(pathname: string) {
  if (pathname.startsWith("/signup/pt")) return "max-w-lg";
  if (pathname.startsWith("/signup/client")) return "max-w-lg";
  if (pathname.startsWith("/signup")) return "max-w-2xl";
  if (pathname.startsWith("/invite")) return "max-w-lg";
  if (pathname.startsWith("/join")) return "max-w-lg";
  if (pathname.startsWith("/client/onboarding/account")) return "max-w-xl";
  if (pathname.startsWith("/pt/onboarding/workspace")) return "max-w-lg";
  if (pathname.startsWith("/pt/onboarding/profile")) return "max-w-2xl";
  if (pathname.startsWith("/no-workspace")) return "max-w-md";
  return "max-w-md";
}

function ScreenWireframe({
  title,
  message,
  shell,
  tone,
  themeMode,
}: {
  title: string;
  message: string;
  shell: WireframeShell;
  tone: ModuleTone;
  themeMode: WireframeThemeMode;
}) {
  const shellClassName = getShellClassName(shell, themeMode);
  const panelStyle = getPanelStyle(tone, themeMode);
  const screenContainerClassName = getScreenContainerClassName(shell);

  return (
    <div
      className={cn(
        "relative isolate min-h-screen overflow-hidden bg-background",
        shellClassName,
      )}
      style={getModuleToneStyle(tone)}
    >
      <AppShellBackgroundLayer animated={false} mode={themeMode} />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10"
        style={getScreenOverlayStyle(tone, themeMode)}
      />
      <div className={screenContainerClassName}>
        <div className="grid w-full gap-5 lg:grid-cols-[248px_minmax(0,1fr)]">
          <div
            className="hidden rounded-[32px] p-5 md:block"
            style={panelStyle}
          >
            <div className="space-y-5">
              <div className="space-y-3">
                <WireframeBlock className="h-5 w-24 rounded-full" />
                <WireframeBlock className="h-12 w-full rounded-[20px]" />
              </div>
              <div className="space-y-3">
                <WireframeBlock className="h-12 w-full rounded-[20px]" />
                <WireframeBlock className="h-12 w-full rounded-[20px]" />
                <WireframeBlock className="h-12 w-full rounded-[20px]" />
                <WireframeBlock className="h-12 w-full rounded-[20px]" />
                <WireframeBlock className="h-12 w-4/5 rounded-[20px]" />
              </div>
              <WireframeBlock className="mt-8 h-24 w-full rounded-[24px]" />
            </div>
          </div>

          <div className="space-y-5">
            <div
              className="rounded-[32px] p-5"
              style={panelStyle}
            >
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="min-w-0 flex-1 space-y-3">
                  <WireframeBlock className="h-4 w-28 rounded-full" />
                  <WireframeBlock className="h-10 w-48 max-w-full rounded-[18px]" />
                  <WireframeBlock className="h-4 w-72 max-w-full rounded-full" />
                </div>
                <div className="flex items-center gap-3">
                  <WireframeBlock className="h-12 w-12 rounded-[18px]" />
                  <WireframeBlock className="h-12 w-40 rounded-[18px]" />
                </div>
              </div>
            </div>

            <div className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(280px,0.8fr)]">
              <div className="space-y-5">
                <div
                  className="rounded-[32px] p-5"
                  style={panelStyle}
                >
                  <div className="grid gap-4 sm:grid-cols-3">
                    <WireframeBlock className="h-28 rounded-[24px]" />
                    <WireframeBlock className="h-28 rounded-[24px]" />
                    <WireframeBlock className="h-28 rounded-[24px]" />
                  </div>
                </div>

                <div
                  className="rounded-[32px] p-5"
                  style={panelStyle}
                >
                  <div className="space-y-4">
                    <WireframeBlock className="h-5 w-44 rounded-full" />
                    <WireframeBlock className="h-4 w-full rounded-full" />
                    <WireframeBlock className="h-4 w-11/12 rounded-full" />
                    <WireframeBlock className="h-4 w-4/5 rounded-full" />
                    <div className="grid gap-4 pt-2 md:grid-cols-2">
                      <WireframeBlock className="h-40 rounded-[24px]" />
                      <WireframeBlock className="h-40 rounded-[24px]" />
                    </div>
                  </div>
                </div>
              </div>

              <div
                className="rounded-[32px] p-5"
                style={panelStyle}
              >
                <div className="space-y-4">
                  <WireframeBlock className="h-5 w-32 rounded-full" />
                  <WireframeBlock className="h-24 w-full rounded-[24px]" />
                  <WireframeBlock className="h-16 w-full rounded-[20px]" />
                  <WireframeBlock className="h-16 w-full rounded-[20px]" />
                  <WireframeBlock className="h-16 w-5/6 rounded-[20px]" />
                </div>
              </div>
            </div>

            <WireframeLoaderCopy title={title} message={message} />
          </div>
        </div>
      </div>
    </div>
  );
}

function AuthWireframe({
  title,
  message,
  tone,
  themeMode,
  authWidthClassName,
}: {
  title: string;
  message: string;
  tone: ModuleTone;
  themeMode: WireframeThemeMode;
  authWidthClassName: string;
}) {
  const panelStyle = getPanelStyle(tone, themeMode);

  return (
    <div
      className={cn("w-full rounded-[28px] p-6 sm:p-7", authWidthClassName)}
      style={panelStyle}
    >
      <div className="space-y-6">
        <div className="space-y-4 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-background/35">
            <WireframeBlock className="h-5 w-5 rounded-md" />
          </div>
          <div className="space-y-3">
            <WireframeBlock className="mx-auto h-7 w-40 rounded-full" />
            <WireframeBlock className="mx-auto h-4 w-64 max-w-full rounded-full" />
          </div>
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <WireframeBlock className="h-4 w-24 rounded-full" />
            <WireframeBlock className="h-11 w-full rounded-[16px]" />
          </div>
          <div className="space-y-2">
            <WireframeBlock className="h-4 w-28 rounded-full" />
            <WireframeBlock className="h-11 w-full rounded-[16px]" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <WireframeBlock className="h-11 rounded-[16px]" />
            <WireframeBlock className="h-11 rounded-[16px]" />
          </div>
          <WireframeBlock className="h-11 w-full rounded-[16px]" />
        </div>

        <WireframeLoaderCopy title={title} message={message} align="center" />
      </div>
    </div>
  );
}

export function WireframeLoader({
  variant = "screen",
  title = "Loading",
  message = "Preparing your workspace layout...",
  shell = "public",
  tone = "overview",
  themeMode = "dark",
  authWidthClassName = "max-w-md",
  className,
  ...props
}: WireframeLoaderProps) {
  return (
    <div
      aria-busy="true"
      role="status"
      className={cn("w-full", className)}
      {...props}
    >
      <span className="sr-only">{message}</span>
      {variant === "auth" ? (
        <AuthWireframe
          title={title}
          message={message}
          tone={tone}
          themeMode={themeMode}
          authWidthClassName={authWidthClassName}
        />
      ) : (
        <ScreenWireframe
          title={title}
          message={message}
          shell={shell}
          tone={tone}
          themeMode={themeMode}
        />
      )}
    </div>
  );
}

export function RouteAwareWireframeLoader({
  variant = "screen",
  ...props
}: Omit<WireframeLoaderProps, "shell" | "themeMode" | "tone">) {
  const location = useLocation();
  const { resolvedTheme } = useTheme();

  const appearance = useMemo(() => {
    const shell = getWireframeShell(location.pathname);
    const tone = getWireframeTone(location.pathname, shell);
    const themeMode =
      shell === "pt-hub" ? readPtHubThemeMode() : resolvedTheme;
    const authWidthClassName = getWireframeAuthWidthClass(location.pathname);

    return { shell, tone, themeMode, authWidthClassName };
  }, [location.pathname, resolvedTheme]);

  return (
    <WireframeLoader
      variant={variant}
      shell={appearance.shell}
      tone={appearance.tone}
      themeMode={appearance.themeMode}
      authWidthClassName={appearance.authWidthClassName}
      {...props}
    />
  );
}

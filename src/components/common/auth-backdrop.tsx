import { cn } from "../../lib/utils";
import { AppShellBackgroundLayer } from "./app-shell-background";
import { AppFooter } from "./app-footer";

interface AuthBackdropProps {
  children: React.ReactNode;
  brandName?: string;
  logo?: React.ReactNode;
  contentClassName?: string;
}

export function AuthBackdrop({
  children,
  contentClassName,
}: AuthBackdropProps) {
  return (
    <div className="pt-hub-theme pt-hub-theme-dark theme-shell-canvas relative isolate flex h-dvh flex-col overflow-hidden">
      <AppShellBackgroundLayer animated />

      <div
        className={cn(
          "relative z-10 mx-auto flex min-h-0 w-full flex-1 items-start justify-center overflow-y-auto px-4 py-8 sm:items-center sm:px-6 lg:px-8",
          contentClassName,
        )}
      >
        {children}
      </div>

      <AppFooter className="pointer-events-auto relative z-20 w-full shrink-0" />
    </div>
  );
}

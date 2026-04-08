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
    <div className="pt-hub-theme pt-hub-theme-dark theme-shell-canvas relative isolate flex min-h-screen items-center justify-center overflow-hidden px-4 py-8 sm:px-6 lg:px-8">
      <AppShellBackgroundLayer />

      <div className={cn("relative z-10 w-full", contentClassName)}>
        {children}
      </div>

      <AppFooter className="pointer-events-auto absolute inset-x-0 bottom-0 z-20" />
    </div>
  );
}

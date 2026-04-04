import { cn } from "../../lib/utils";
import { Link } from "react-router-dom";
import { AppShellBackgroundLayer } from "./app-shell-background";

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

      <nav className="pointer-events-auto absolute bottom-4 z-20 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
        <Link className="transition-colors hover:text-foreground" to="/privacy">
          Privacy
        </Link>
        <Link className="transition-colors hover:text-foreground" to="/terms">
          Terms
        </Link>
        <Link className="transition-colors hover:text-foreground" to="/support">
          Support
        </Link>
      </nav>
    </div>
  );
}

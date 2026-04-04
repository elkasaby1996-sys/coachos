import { cn } from "../../lib/utils";
import { Link } from "react-router-dom";

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
    <div className="theme-shell-canvas relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-8">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_18%,oklch(var(--accent)/0.12),transparent_20%),radial-gradient(circle_at_82%_16%,oklch(var(--chart-3)/0.12),transparent_22%),radial-gradient(circle_at_50%_105%,oklch(var(--bg-sidebar)/0.92),transparent_38%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_30%,oklch(var(--bg-canvas)/0.84)_100%)]" />

      <div className={cn("relative z-10 w-full", contentClassName)}>
        {children}
      </div>

      <nav className="pointer-events-auto absolute bottom-4 z-20 flex items-center gap-4 text-xs text-muted-foreground">
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

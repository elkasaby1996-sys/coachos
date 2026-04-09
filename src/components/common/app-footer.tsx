import { Link } from "react-router-dom";
import { cn } from "../../lib/utils";
import { PageContainer } from "./page-container";

type AppFooterProps = {
  className?: string;
  contentClassName?: string;
  size?: "default" | "portal";
};

export function AppFooter({
  className,
  contentClassName,
  size = "default",
}: AppFooterProps) {
  return (
    <footer
      className={cn(
        "relative z-20 border-t border-border/60 bg-[oklch(var(--bg-surface)/0.55)] py-3 backdrop-blur-xl sm:py-4",
        className,
      )}
    >
      <PageContainer
        size={size}
        className={cn(
          "flex flex-col gap-2 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between",
          contentClassName,
        )}
      >
        <span>c 2026 RepSync</span>
        <nav className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <Link className="transition-colors hover:text-foreground" to="/support">
            Support
          </Link>
          <Link className="transition-colors hover:text-foreground" to="/privacy">
            Privacy policy
          </Link>
          <Link className="transition-colors hover:text-foreground" to="/terms">
            Terms of use
          </Link>
        </nav>
        <span className="sm:text-right">Region &amp; language (TBW)</span>
      </PageContainer>
    </footer>
  );
}

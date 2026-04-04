import { cn } from "../../lib/utils";
import { Moon, Sun } from "lucide-react";
import { LIGHT_MODE_ENABLED } from "../../lib/theme";

interface ThemeModeSwitchProps {
  checked: boolean;
  onToggle: () => void | Promise<void>;
  className?: string;
}

export function ThemeModeSwitch({
  checked,
  onToggle,
  className,
}: ThemeModeSwitchProps) {
  if (!LIGHT_MODE_ENABLED) return null;

  return (
    <button
      type="button"
      onClick={() => void onToggle()}
      aria-label={checked ? "Switch to light mode" : "Switch to dark mode"}
      aria-pressed={checked}
      className={cn(
        "relative flex h-9 w-full max-w-[92px] items-center justify-between rounded-lg border border-border/70 bg-card/70 px-2 text-muted-foreground shadow-sm backdrop-blur-sm transition-colors hover:border-border",
        className,
      )}
    >
      <Moon
        className={cn(
          "z-10 h-3.5 w-3.5 transition-colors duration-300",
          checked ? "text-foreground/45" : "text-foreground",
        )}
      />
      <Sun
        className={cn(
          "z-10 h-3.5 w-3.5 transition-colors duration-300",
          checked
            ? "text-primary [filter:drop-shadow(0_0_5px_oklch(var(--primary)/0.45))]"
            : "text-foreground/45",
        )}
      />

      <div
        className={cn(
          "pointer-events-none absolute left-1/2 top-1/2 h-5 w-10 -translate-x-1/2 -translate-y-1/2 rounded-full shadow-inner transition-colors duration-300",
          checked ? "bg-primary/28" : "bg-muted/80",
        )}
      >
        <div
          className={cn(
            "absolute left-0.5 top-0.5 h-4 w-4 rounded-full border border-border/70 shadow-md transition-[transform,background-color] duration-300 ease-out",
            checked
              ? "translate-x-5 bg-primary"
              : "translate-x-0 bg-muted-foreground/50",
          )}
        >
          <div className="absolute left-1 top-0.5 h-1 w-1.5 rounded-full bg-white/35 blur-[1px]" />
        </div>
      </div>
    </button>
  );
}

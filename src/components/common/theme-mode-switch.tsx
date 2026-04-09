import { cn } from "../../lib/utils";
import { Moon, Sun } from "lucide-react";
import { LIGHT_MODE_ENABLED } from "../../lib/theme";

interface ThemeModeSwitchProps {
  mode: "dark" | "light";
  onToggle: () => void | Promise<void>;
  className?: string;
}

export function ThemeModeSwitch({
  mode,
  onToggle,
  className,
}: ThemeModeSwitchProps) {
  if (!LIGHT_MODE_ENABLED) return null;
  const isLightMode = mode === "light";

  return (
    <button
      type="button"
      onClick={() => void onToggle()}
      role="switch"
      aria-checked={isLightMode}
      aria-label={
        isLightMode ? "Switch to dark mode" : "Switch to light mode"
      }
      className={cn(
        "group relative inline-flex h-[30px] w-[92px] items-center rounded-full border px-1 backdrop-blur-2xl transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-0",
        isLightMode
          ? "border-black/10 bg-[linear-gradient(180deg,rgba(232,239,235,0.72),rgba(216,225,219,0.62))] text-foreground shadow-[0_16px_32px_-24px_rgba(15,23,42,0.18)]"
          : "border-white/12 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))] text-foreground shadow-[0_16px_30px_-24px_rgba(0,0,0,0.78)]",
        className,
      )}
    >
      <span
        className={cn(
          "pointer-events-none absolute top-1/2 h-[22px] w-[42px] -translate-y-1/2 rounded-full transition-all duration-200",
          isLightMode
            ? "left-[45px] border border-slate-900/85 bg-slate-900 shadow-[0_10px_18px_-12px_rgba(15,23,42,0.5)]"
            : "left-1 border border-white/12 bg-[linear-gradient(180deg,oklch(var(--accent)),oklch(var(--chart-2)))] shadow-[0_10px_18px_-12px_oklch(var(--accent)/0.6)]",
        )}
      />
      <span
        className={cn(
          "pointer-events-none absolute inset-[3px] rounded-full",
          isLightMode
            ? "bg-[linear-gradient(180deg,rgba(255,255,255,0.16),rgba(255,255,255,0.04))]"
            : "bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.01))]",
        )}
      />
      <span className="relative z-10 grid w-full grid-cols-2 items-center">
        <span
          className={cn(
            "flex h-[22px] items-center justify-center transition-colors duration-200",
            isLightMode ? "text-foreground/45" : "text-slate-950",
          )}
        >
          <Moon className="h-3.5 w-3.5" />
        </span>
        <span
          className={cn(
            "flex h-[22px] items-center justify-center transition-colors duration-200",
            isLightMode ? "text-white" : "text-foreground/45",
          )}
        >
          <Sun className="h-3.5 w-3.5" />
        </span>
      </span>
    </button>
  );
}

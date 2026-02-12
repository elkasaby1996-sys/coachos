import { cn } from "../../lib/utils";
import { motion } from "framer-motion";
import { Moon, Sun } from "lucide-react";

interface ThemeModeSwitchProps {
  checked: boolean;
  onToggle: () => void | Promise<void>;
  className?: string;
}

export function ThemeModeSwitch({ checked, onToggle, className }: ThemeModeSwitchProps) {
  return (
    <button
      type="button"
      onClick={() => void onToggle()}
      aria-label={checked ? "Switch to light mode" : "Switch to dark mode"}
      aria-pressed={checked}
      className={cn(
        "relative flex h-9 w-full max-w-[92px] items-center justify-between rounded-lg border border-border/70 bg-card/70 px-2 text-muted-foreground shadow-sm backdrop-blur-sm transition-colors hover:border-border",
        className
      )}
    >
      <Moon className={cn("z-10 h-3.5 w-3.5 transition-colors duration-300", checked ? "text-foreground/45" : "text-foreground")} />
      <Sun
        className={cn(
          "z-10 h-3.5 w-3.5 transition-colors duration-300",
          checked ? "text-primary [filter:drop-shadow(0_0_5px_oklch(var(--primary)/0.45))]" : "text-foreground/45"
        )}
      />

      <motion.div
        className="pointer-events-none absolute left-1/2 top-1/2 h-5 w-10 -translate-x-1/2 -translate-y-1/2 rounded-full shadow-inner"
        initial={false}
        animate={{
          backgroundColor: checked ? "oklch(var(--primary) / 0.28)" : "oklch(var(--muted) / 0.8)",
        }}
        transition={{ duration: 0.25 }}
      >
        <motion.div
          className="absolute top-0.5 left-0.5 h-4 w-4 rounded-full border border-border/70 shadow-md"
          initial={false}
          animate={{
            x: checked ? 20 : 0,
            backgroundColor: checked ? "oklch(var(--primary))" : "oklch(var(--muted-foreground) / 0.5)",
          }}
          transition={{ type: "spring", stiffness: 520, damping: 32 }}
          whileTap={{ scale: 0.9 }}
        >
          <div className="absolute left-1 top-0.5 h-1 w-1.5 rounded-full bg-white/35 blur-[1px]" />
        </motion.div>
      </motion.div>
    </button>
  );
}

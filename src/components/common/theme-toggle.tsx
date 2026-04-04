import { Laptop, Moon, Sun } from "lucide-react";
import { useTheme } from "./theme-provider";
import { Button } from "../ui/button";
import { LIGHT_MODE_ENABLED } from "../../lib/theme";

export function ThemeToggle() {
  const { themePreference, cycleThemePreference } = useTheme();

  if (!LIGHT_MODE_ENABLED) return null;

  const icon =
    themePreference === "system" ? (
      <Laptop className="h-5 w-5" />
    ) : themePreference === "dark" ? (
      <Moon className="h-5 w-5" />
    ) : (
      <Sun className="h-5 w-5" />
    );

  return (
    <Button
      variant="secondary"
      size="icon"
      onClick={() => void cycleThemePreference()}
      aria-label={`Theme: ${themePreference}`}
      title={`Theme: ${themePreference}`}
      className="rounded-full border border-border/70 bg-card/68 text-foreground shadow-[inset_0_1px_0_oklch(1_0_0/0.04)]"
    >
      {icon}
    </Button>
  );
}

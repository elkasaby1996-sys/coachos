import { Laptop, Moon, Sun } from "lucide-react";
import { useTheme } from "./theme-provider";
import { Button } from "../ui/button";
import { LIGHT_MODE_ENABLED } from "../../lib/theme";

export function ThemeToggle() {
  if (!LIGHT_MODE_ENABLED) return null;

  const { themePreference, cycleThemePreference } = useTheme();

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
      variant="ghost"
      size="icon"
      onClick={() => void cycleThemePreference()}
      aria-label={`Theme: ${themePreference}`}
      title={`Theme: ${themePreference}`}
    >
      {icon}
    </Button>
  );
}

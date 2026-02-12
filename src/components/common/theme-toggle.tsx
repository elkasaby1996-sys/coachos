import { Laptop, Moon, Sun } from "lucide-react";
import { useTheme } from "./theme-provider";
import { Button } from "../ui/button";

export function ThemeToggle() {
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

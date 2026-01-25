import { Card } from "../ui/card";
import { cn } from "../../lib/utils";

interface KpiTileProps {
  label: string;
  value: string | number;
  accent?: boolean;
}

export function KpiTile({ label, value, accent = false }: KpiTileProps) {
  return (
    <Card className="p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div
        className={cn(
          "mt-2 text-2xl font-bold",
          accent && "text-accent"
        )}
      >
        {value}
      </div>
    </Card>
  );
}

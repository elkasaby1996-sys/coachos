import { Card } from "../ui/card";
import { cn } from "../../lib/utils";

interface KpiTileProps {
  label: string;
  value: string | number;
  delta?: string;
  sparkline?: number[];
  accent?: boolean;
}

export function KpiTile({ label, value, delta, sparkline = [], accent = false }: KpiTileProps) {
  const max = Math.max(...sparkline, 1);

  return (
    <Card className="group relative overflow-hidden border-border/70 bg-card/80 p-4 transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-card">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{label}</div>
          <div className={cn("mt-2 text-2xl font-semibold tracking-tight", accent && "text-accent")}>
            {value}
          </div>
          {delta && <div className="mt-1 text-xs text-muted-foreground">{delta}</div>}
        </div>
        <div className="flex items-end gap-1">
          {sparkline.map((point, index) => (
            <span
              key={`${label}-${index}`}
              className={cn(
                "h-8 w-1 rounded-full bg-muted/60 transition group-hover:bg-accent/70"
              )}
              style={{ height: `${Math.max(10, (point / max) * 32)}px` }}
            />
          ))}
        </div>
      </div>
    </Card>
  );
}

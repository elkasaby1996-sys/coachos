import { Card, CardHeader, CardTitle } from "../../ui/card";
import { cn } from "../../../lib/utils";

export function StatCard({
  label,
  value,
  helper,
  icon: Icon,
  accent,
  sparkline,
}: {
  label: string;
  value: string | number;
  helper?: string;
  icon: React.ComponentType<{ className?: string }>;
  accent?: boolean;
  sparkline?: React.ReactNode;
}) {
  return (
    <Card
      className={cn(
        "border-border/70 bg-card/80",
        accent && "border-primary/40 bg-card/90 shadow-glow"
      )}
    >
      <CardHeader className="space-y-2">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span className="uppercase tracking-[0.25em]">{label}</span>
          <Icon className="h-4 w-4 text-primary" />
        </div>
        <div className="flex items-end justify-between gap-3">
          <div>
            <CardTitle className="text-2xl font-semibold tracking-tight">{value}</CardTitle>
            {helper ? <p className="text-xs text-muted-foreground">{helper}</p> : null}
          </div>
          {sparkline ? <div className="hidden sm:block">{sparkline}</div> : null}
        </div>
      </CardHeader>
    </Card>
  );
}
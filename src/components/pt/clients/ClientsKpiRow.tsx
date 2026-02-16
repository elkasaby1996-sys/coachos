import { Card, CardHeader, CardTitle } from "../../ui/card";

export function ClientsKpiRow({
  stats,
}: {
  stats: Array<{ label: string; value: number; tone?: string }>;
}) {
  return (
    <div className="grid gap-3 md:grid-cols-4">
      {stats.map((stat) => (
        <Card key={stat.label} className="border-border/70 bg-card/80">
          <CardHeader className="space-y-1">
            <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
              {stat.label}
            </p>
            <CardTitle className={`text-2xl ${stat.tone ?? "text-foreground"}`}>
              {stat.value}
            </CardTitle>
          </CardHeader>
        </Card>
      ))}
    </div>
  );
}

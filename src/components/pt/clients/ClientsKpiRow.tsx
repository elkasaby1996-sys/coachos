import { Card, CardHeader, CardTitle } from "../../ui/card";

export function ClientsKpiRow({
  stats,
}: {
  stats: Array<{ label: string; value: number; tone?: string }>;
}) {
  return (
    <div className="grid gap-3 md:grid-cols-4">
      {stats.map((stat) => (
        <Card
          key={stat.label}
          className="rounded-[24px] border-border/70 bg-[linear-gradient(180deg,oklch(var(--card)/0.98),oklch(var(--card)/0.9))]"
        >
          <CardHeader className="space-y-2 px-5 py-4">
            <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
              {stat.label}
            </p>
            <CardTitle
              className={`text-[1.85rem] ${stat.tone ?? "text-foreground"}`}
            >
              {stat.value}
            </CardTitle>
          </CardHeader>
        </Card>
      ))}
    </div>
  );
}

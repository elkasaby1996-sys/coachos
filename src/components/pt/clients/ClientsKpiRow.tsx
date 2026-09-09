import { Card, CardHeader, CardTitle } from "../../ui/card";

export function ClientsKpiRow({
  stats,
}: {
  stats: Array<{ label: string; value: number; tone?: string }>;
}) {
  return (
    <div className="page-kpi-block grid gap-4 md:grid-cols-2 xl:grid-cols-5">
      {stats.map((stat) => (
        <Card
          key={stat.label}
          className="kpi-card border-border/70 bg-[linear-gradient(180deg,oklch(var(--card)/0.98),oklch(var(--card)/0.9))]"
        >
          <CardHeader className="kpi-card-content space-y-2 p-4 sm:p-4">
            <p className="kpi-label text-muted-foreground">{stat.label}</p>
            <CardTitle
              className={`kpi-value ${stat.tone ?? "text-foreground"}`}
            >
              {stat.value}
            </CardTitle>
          </CardHeader>
        </Card>
      ))}
    </div>
  );
}

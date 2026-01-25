import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { KpiTile } from "../../components/common/kpi-tile";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";

const chartData = [
  { day: "Mon", value: 12 },
  { day: "Tue", value: 18 },
  { day: "Wed", value: 15 },
  { day: "Thu", value: 22 },
  { day: "Fri", value: 27 },
  { day: "Sat", value: 19 },
  { day: "Sun", value: 25 },
];

const attentionList = [
  { name: "Avery Johnson", status: "Check-in due" },
  { name: "Morgan Lee", status: "Workout feedback" },
  { name: "Jordan Patel", status: "Streak" },
];

export function PtDashboardPage() {
  return (
    <div className="space-y-6">
      <section className="grid gap-4 md:grid-cols-4">
        <KpiTile label="Active clients" value="24" accent />
        <KpiTile label="Workouts (7 days)" value="68" />
        <KpiTile label="Check-ins due" value="9" />
        <KpiTile label="Needs review" value="5" />
      </section>

      <section className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Performance momentum</CardTitle>
            <p className="text-sm text-muted-foreground">
              Completed workouts over the last seven days.
            </p>
          </CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <XAxis dataKey="day" stroke="hsl(var(--muted-foreground))" />
                <YAxis stroke="hsl(var(--muted-foreground))" />
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--card))",
                    borderColor: "hsl(var(--border))",
                    borderRadius: 12,
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke="hsl(var(--chart-1))"
                  strokeWidth={2}
                  dot={{ fill: "hsl(var(--chart-1))" }}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Clients needing attention</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {attentionList.map((client) => (
              <div key={client.name} className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">{client.name}</p>
                  <p className="text-xs text-muted-foreground">{client.status}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="muted">Open</Badge>
                  <Button size="sm" variant="secondary">
                    Message
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

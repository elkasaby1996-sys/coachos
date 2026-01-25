import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Button } from "../../components/ui/button";

const data = [
  { date: "Jan", weight: 185 },
  { date: "Feb", weight: 182 },
  { date: "Mar", weight: 180 },
  { date: "Apr", weight: 178 },
  { date: "May", weight: 176 },
];

export function ClientProgressPage() {
  return (
    <div className="space-y-6 pb-16 md:pb-0">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Progress</h2>
          <p className="text-sm text-muted-foreground">Track your body metrics over time.</p>
        </div>
        <Button>Add entry</Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Weight trend</CardTitle>
        </CardHeader>
        <CardContent className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data}>
              <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" />
              <YAxis stroke="hsl(var(--muted-foreground))" />
              <Tooltip
                contentStyle={{
                  background: "hsl(var(--card))",
                  borderColor: "hsl(var(--border))",
                  borderRadius: 12,
                }}
              />
              <Area
                type="monotone"
                dataKey="weight"
                stroke="hsl(var(--chart-1))"
                fill="hsl(var(--chart-1))"
                fillOpacity={0.2}
              />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}

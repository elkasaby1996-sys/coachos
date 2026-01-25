import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { KpiTile } from "../../components/common/kpi-tile";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Skeleton } from "../../components/ui/skeleton";

const chartData = [
  { day: "Mon", value: 12 },
  { day: "Tue", value: 18 },
  { day: "Wed", value: 15 },
  { day: "Thu", value: 22 },
  { day: "Fri", value: 27 },
  { day: "Sat", value: 19 },
  { day: "Sun", value: 25 },
];

const kpiData = [
  {
    label: "Active clients",
    value: "24",
    delta: "+8% vs last week",
    sparkline: [12, 18, 14, 20, 26, 24, 30],
    accent: true,
  },
  {
    label: "Workouts (7 days)",
    value: "68",
    delta: "+12% vs last week",
    sparkline: [32, 28, 30, 35, 40, 38, 44],
  },
  {
    label: "Check-ins due",
    value: "9",
    delta: "-3 vs last week",
    sparkline: [11, 9, 8, 10, 9, 7, 9],
  },
  {
    label: "Needs review",
    value: "5",
    delta: "+2 flagged",
    sparkline: [2, 3, 4, 4, 5, 4, 5],
  },
];

const queueSections = [
  {
    title: "Check-ins due today (Saturday)",
    items: [
      {
        name: "Avery Johnson",
        status: "Due 6pm",
        lastActivity: "Last check-in: 7 days ago",
        badge: "warning",
      },
      {
        name: "Elena Suarez",
        status: "Due 8pm",
        lastActivity: "Last check-in: 6 days ago",
        badge: "warning",
      },
    ],
  },
  {
    title: "Workouts completed (needs feedback)",
    items: [
      {
        name: "Morgan Lee",
        status: "Deadlift session",
        lastActivity: "Completed 2h ago",
        badge: "default",
      },
      {
        name: "Jordan Patel",
        status: "Tempo run",
        lastActivity: "Completed 5h ago",
        badge: "default",
      },
    ],
  },
  {
    title: "Inactive clients (3+ days)",
    items: [
      {
        name: "Samira Khan",
        status: "No workouts logged",
        lastActivity: "Last active: 4 days ago",
        badge: "danger",
      },
    ],
  },
];

const weekOverview = [
  { day: "Mon", assigned: 12, completed: 9 },
  { day: "Tue", assigned: 14, completed: 12 },
  { day: "Wed", assigned: 13, completed: 11 },
  { day: "Thu", assigned: 15, completed: 13 },
  { day: "Fri", assigned: 16, completed: 14 },
  { day: "Sat", assigned: 10, completed: 7 },
  { day: "Sun", assigned: 8, completed: 6 },
];

export function PtDashboardPage() {
  const isQueueLoading = false;
  return (
    <div className="space-y-8">
      <section className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">Action Center</p>
          <h2 className="text-2xl font-semibold tracking-tight">Today’s coaching priorities</h2>
        </div>
        <Button variant="secondary">Review highlights</Button>
      </section>

      <section className="grid gap-4 md:grid-cols-4">
        {kpiData.map((kpi) => (
          <KpiTile key={kpi.label} {...kpi} />
        ))}
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-4">
            <div>
              <CardTitle>Today’s queue</CardTitle>
              <p className="text-sm text-muted-foreground">
                Prioritize check-ins, feedback, and outreach.
              </p>
            </div>
            <Button variant="secondary" size="sm">
              View all
            </Button>
          </CardHeader>
          <CardContent className="space-y-6">
            {isQueueLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, index) => (
                  <Skeleton key={index} className="h-16 w-full" />
                ))}
              </div>
            ) : (
              queueSections.map((section) => (
                <div key={section.title} className="space-y-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {section.title}
                  </p>
                  <div className="space-y-3">
                    {section.items.map((item) => (
                      <div
                        key={item.name}
                        className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-background p-3 transition hover:-translate-y-0.5 hover:shadow-lg"
                      >
                        <div>
                          <p className="text-sm font-medium">{item.name}</p>
                          <p className="text-xs text-muted-foreground">{item.lastActivity}</p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant={item.badge as "warning" | "danger" | "default"}>
                            {item.status}
                          </Badge>
                          <Button size="sm" variant="secondary">
                            Open
                          </Button>
                          <Button size="sm">Message</Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-4">
            <div>
              <CardTitle>Weekly momentum</CardTitle>
              <p className="text-sm text-muted-foreground">
                Completed workouts over the last seven days.
              </p>
            </div>
            <Button variant="secondary" size="sm">
              Export
            </Button>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="h-56">
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
            </div>
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Week overview
              </p>
              <div className="grid grid-cols-7 gap-2">
                {weekOverview.map((day) => (
                  <div
                    key={day.day}
                    className="rounded-lg border border-border bg-background p-2 text-center text-xs transition hover:-translate-y-0.5 hover:shadow-md"
                  >
                    <p className="text-muted-foreground">{day.day}</p>
                    <p className="mt-1 text-sm font-semibold text-foreground">{day.completed}</p>
                    <p className="text-[10px] text-muted-foreground">/{day.assigned}</p>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

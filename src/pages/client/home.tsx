import { Link } from "react-router-dom";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";

const workouts = [
  { id: "w1", name: "Upper Power", type: "Bodybuilding", status: "Assigned" },
  { id: "w2", name: "AMRAP 16", type: "CrossFit", status: "Completed" },
];

export function ClientHomePage() {
  return (
    <div className="space-y-6 pb-16 md:pb-0">
      <section className="rounded-xl border border-border bg-card p-4 shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs text-muted-foreground">Weekly focus</p>
            <h2 className="text-lg font-semibold tracking-tight">Strength + Conditioning</h2>
          </div>
          <Badge variant="success">Streak 3</Badge>
        </div>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Assigned workouts</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {workouts.map((workout) => (
            <div
              key={workout.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-background p-3"
            >
              <div>
                <p className="text-sm font-medium">{workout.name}</p>
                <p className="text-xs text-muted-foreground">{workout.type}</p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={workout.status === "Completed" ? "success" : "muted"}>
                  {workout.status}
                </Badge>
                <Button asChild size="sm" variant="secondary">
                  <Link to={`/app/workouts/${workout.id}`}>Open</Link>
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

import { useParams } from "react-router-dom";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Input } from "../../components/ui/input";

export function ClientWorkoutDetailPage() {
  const { assignedWorkoutId } = useParams();

  return (
    <div className="space-y-6 pb-16 md:pb-0">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">Assigned workout</p>
          <h2 className="text-xl font-semibold tracking-tight">Workout {assignedWorkoutId}</h2>
        </div>
        <Badge variant="muted">Bodybuilding</Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Bench Press</CardTitle>
          <p className="text-sm text-muted-foreground">4 sets · 6 reps · RPE 8</p>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3">
          <Input placeholder="Weight" />
          <Input placeholder="Reps" />
          <Input placeholder="RPE" />
          <Button className="md:col-span-3">Save set</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Session notes</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input placeholder="How did it feel?" />
          <Button variant="secondary">Complete workout</Button>
        </CardContent>
      </Card>
    </div>
  );
}

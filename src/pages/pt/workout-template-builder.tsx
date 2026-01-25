import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Input } from "../../components/ui/input";

export function PtWorkoutTemplateBuilderPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Template builder</h2>
          <p className="text-sm text-muted-foreground">Configure bodybuilding or CrossFit sessions.</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="muted">Bodybuilding</Badge>
          <Button>Assign to client</Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Details</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <label className="text-sm font-medium">Template name</label>
            <Input defaultValue="Upper Power" />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Workout type</label>
            <Input defaultValue="Bodybuilding" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Exercises</CardTitle>
          <p className="text-sm text-muted-foreground">
            Add exercises with sets, reps, RPE, tempo, and notes.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="rounded-lg border border-border bg-muted/50 p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Bench Press</p>
                <p className="text-xs text-muted-foreground">4 sets · 6 reps · RPE 8</p>
              </div>
              <Button variant="secondary" size="sm">
                Edit
              </Button>
            </div>
          </div>
          <Button variant="secondary">Add exercise</Button>
        </CardContent>
      </Card>
    </div>
  );
}

import { Link } from "react-router-dom";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";

const templates = [
  { id: "bb-1", name: "Upper Power", type: "Bodybuilding" },
  { id: "cf-1", name: "AMRAP 16", type: "CrossFit" },
];

export function PtWorkoutTemplatesPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Workout templates</h2>
          <p className="text-sm text-muted-foreground">Create and manage training templates.</p>
        </div>
        <Button>Create template</Button>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Saved templates</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {templates.map((template) => (
            <div
              key={template.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-background p-3"
            >
              <div>
                <p className="text-sm font-medium">{template.name}</p>
                <p className="text-xs text-muted-foreground">{template.type}</p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="muted">{template.type}</Badge>
                <Button asChild size="sm" variant="secondary">
                  <Link to={`/pt/templates/workouts/${template.id}`}>Edit</Link>
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

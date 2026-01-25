import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";

const questions = [
  "Sleep quality (1-10)",
  "Steps",
  "Adherence %",
  "Stress (1-10)",
  "Energy (1-10)",
  "Notes",
];

export function PtCheckinTemplatesPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Check-in templates</h2>
          <p className="text-sm text-muted-foreground">Create weekly check-in questions.</p>
        </div>
        <Button>Create template</Button>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Default weekly template</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {questions.map((question) => (
            <div
              key={question}
              className="flex items-center justify-between rounded-lg border border-border bg-background p-3"
            >
              <p className="text-sm">{question}</p>
              <Badge variant="muted">Required</Badge>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

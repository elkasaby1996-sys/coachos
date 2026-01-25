import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import { Input } from "../../components/ui/input";
import { Skeleton } from "../../components/ui/skeleton";

const questions = [
  "Sleep quality (1-10)",
  "Steps",
  "Adherence %",
  "Stress (1-10)",
  "Energy (1-10)",
  "Notes",
];

const insights = [
  { label: "Check-ins due today", value: "14", delta: "+3 vs yesterday" },
  { label: "Avg adherence", value: "84%", delta: "+5% this week" },
  { label: "Avg sleep score", value: "7.6", delta: "+0.4 this week" },
];

export function PtCheckinTemplatesPage() {
  const isLoading = false;
  const additionalTemplates: string[] = [];
  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Check-in templates</h2>
          <p className="text-sm text-muted-foreground">Create weekly check-in questions.</p>
        </div>
        <Button>Create template</Button>
      </div>

      <section className="grid gap-4 md:grid-cols-3">
        {insights.map((insight) => (
          <Card key={insight.label} className="p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">{insight.label}</p>
            <p className="mt-2 text-2xl font-semibold">{insight.value}</p>
            <p className="text-xs text-muted-foreground">{insight.delta}</p>
          </Card>
        ))}
      </section>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle>Default weekly template</CardTitle>
            <p className="text-sm text-muted-foreground">
              Standardized questions to keep clients consistent.
            </p>
          </div>
          <Button variant="secondary" size="sm">
            Duplicate
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, index) => (
                <Skeleton key={index} className="h-12 w-full" />
              ))}
            </div>
          ) : (
            questions.map((question) => (
              <div
                key={question}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-background p-3"
              >
                <p className="text-sm">{question}</p>
                <div className="flex items-center gap-2">
                  <Badge variant="muted">Required</Badge>
                  <Button size="sm" variant="secondary">
                    Edit
                  </Button>
                </div>
              </div>
            ))
          )}
          <div className="rounded-xl border border-dashed border-border bg-muted/40 p-4">
            <p className="text-sm font-semibold">Add a new question</p>
            <p className="text-xs text-muted-foreground">
              Collect custom metrics like HRV, soreness, or nutrition.
            </p>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <Input placeholder="Question prompt" />
              <Button size="sm">Add question</Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle>Additional templates</CardTitle>
            <p className="text-sm text-muted-foreground">
              Build specialized check-ins for sports or recovery blocks.
            </p>
          </div>
        </CardHeader>
        <CardContent>
          {additionalTemplates.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-muted/40 p-8 text-center">
              <p className="text-sm font-semibold">No extra templates yet.</p>
              <p className="mt-2 text-xs text-muted-foreground">
                Create a new check-in template to scale your programs.
              </p>
              <Button className="mt-4" size="sm">
                Create template
              </Button>
            </div>
          ) : (
            <div>Template list</div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

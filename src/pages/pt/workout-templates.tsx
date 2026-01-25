import { Link } from "react-router-dom";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../../components/ui/dialog";
import { Input } from "../../components/ui/input";
import { Skeleton } from "../../components/ui/skeleton";

const templates = [
  {
    id: "bb-1",
    name: "Upper Power",
    type: "Bodybuilding",
    focus: "Strength",
    duration: "55 min",
    updated: "2 days ago",
  },
  {
    id: "cf-1",
    name: "AMRAP 16",
    type: "CrossFit",
    focus: "Metcon",
    duration: "35 min",
    updated: "5 days ago",
  },
  {
    id: "hy-2",
    name: "Lower Hypertrophy",
    type: "Bodybuilding",
    focus: "Hypertrophy",
    duration: "60 min",
    updated: "1 week ago",
  },
];

const calendarWeek = [
  {
    day: "Mon",
    workouts: ["Upper Power · Avery", "Run Tempo · Jordan"],
  },
  {
    day: "Tue",
    workouts: ["AMRAP 16 · Morgan"],
  },
  {
    day: "Wed",
    workouts: ["Lower Hypertrophy · Samira"],
  },
  {
    day: "Thu",
    workouts: ["Mobility Reset · Elena"],
  },
  {
    day: "Fri",
    workouts: ["Upper Power · Avery"],
  },
  {
    day: "Sat",
    workouts: [],
  },
  {
    day: "Sun",
    workouts: [],
  },
];

export function PtWorkoutTemplatesPage() {
  const isLoading = false;
  const sharedTemplates: string[] = [];
  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Workout templates</h2>
          <p className="text-sm text-muted-foreground">
            Build reusable sessions and assign them fast.
          </p>
        </div>
        <Button>Create template</Button>
      </div>

      <Tabs defaultValue="templates">
        <TabsList className="flex w-full flex-wrap justify-start gap-2 bg-transparent p-0">
          <TabsTrigger value="templates" className="border border-border bg-muted/50">
            Templates
          </TabsTrigger>
          <TabsTrigger value="calendar" className="border border-border bg-muted/50">
            Calendar
          </TabsTrigger>
        </TabsList>

        <TabsContent value="templates">
          <Card>
            <CardHeader className="flex flex-row items-start justify-between gap-4">
              <div>
                <CardTitle>Saved templates</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Keep your core sessions in one premium library.
                </p>
              </div>
              <Button variant="secondary" size="sm">
                New folder
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              {isLoading ? (
                <div className="space-y-3">
                  {Array.from({ length: 3 }).map((_, index) => (
                    <Skeleton key={index} className="h-20 w-full" />
                  ))}
                </div>
              ) : templates.length > 0 ? (
                templates.map((template) => (
                  <div
                    key={template.id}
                    className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border bg-background p-4 transition hover:-translate-y-0.5 hover:shadow-lg"
                  >
                    <div>
                      <p className="text-sm font-semibold">{template.name}</p>
                      <p className="text-xs text-muted-foreground">
                        Focus: {template.focus} · Est. {template.duration}
                      </p>
                      <p className="text-xs text-muted-foreground">Last edited {template.updated}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="muted">{template.type}</Badge>
                      <Button asChild size="sm" variant="secondary">
                        <Link to={`/pt/templates/workouts/${template.id}`}>Edit</Link>
                      </Button>
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button size="sm">Assign</Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>Assign {template.name}</DialogTitle>
                            <DialogDescription>Select a client and date to assign.</DialogDescription>
                          </DialogHeader>
                          <div className="space-y-3">
                            <Input placeholder="Search client" />
                            <Input type="date" />
                          </div>
                          <DialogFooter>
                            <Button variant="secondary">Cancel</Button>
                            <Button>Assign workout</Button>
                          </DialogFooter>
                        </DialogContent>
                      </Dialog>
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-xl border border-dashed border-border bg-muted/40 p-8 text-center">
                  <p className="text-sm font-semibold">No templates yet.</p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Create your first template to speed up programming.
                  </p>
                  <Button className="mt-4" size="sm">
                    Create template
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
          <Card className="mt-6">
            <CardHeader>
              <CardTitle>Shared template packs</CardTitle>
              <p className="text-sm text-muted-foreground">
                Import curated templates or build your own pack.
              </p>
            </CardHeader>
            <CardContent>
              {sharedTemplates.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border bg-muted/40 p-8 text-center">
                  <p className="text-sm font-semibold">No shared templates yet.</p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Create a new pack to streamline programming.
                  </p>
                  <Button className="mt-4" size="sm">
                    Create pack
                  </Button>
                </div>
              ) : (
                <div>Template packs</div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="calendar">
          <Card>
            <CardHeader className="flex flex-row items-start justify-between gap-4">
              <div>
                <CardTitle>Weekly calendar</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Visualize assigned workouts across the week.
                </p>
              </div>
              <Button variant="secondary" size="sm">
                Sync calendar
              </Button>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 md:grid-cols-7">
                {calendarWeek.map((day) => (
                  <div
                    key={day.day}
                    className="rounded-xl border border-border bg-background p-3 transition hover:-translate-y-0.5 hover:shadow-lg"
                  >
                    <p className="text-xs font-semibold uppercase text-muted-foreground">{day.day}</p>
                    <div className="mt-2 space-y-2">
                      {day.workouts.length > 0 ? (
                        day.workouts.map((workout) => (
                          <div key={workout} className="rounded-lg border border-border bg-muted/60 px-2 py-1 text-xs">
                            {workout}
                          </div>
                        ))
                      ) : (
                        <div className="rounded-lg border border-dashed border-border p-2 text-center text-xs text-muted-foreground">
                          No assignments
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

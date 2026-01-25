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
import { Skeleton } from "../../components/ui/skeleton";

const clients = [
  {
    id: "1",
    name: "Avery Johnson",
    status: "Active",
    tags: ["Strength", "Power"],
    lastWorkout: "Yesterday",
    lastCheckIn: "6 days ago",
    adherence: "92%",
  },
  {
    id: "2",
    name: "Morgan Lee",
    status: "Onboarding",
    tags: ["CrossFit"],
    lastWorkout: "2 days ago",
    lastCheckIn: "Today",
    adherence: "76%",
  },
  {
    id: "3",
    name: "Jordan Patel",
    status: "At Risk",
    tags: ["Bodybuilding", "Hypertrophy"],
    lastWorkout: "4 days ago",
    lastCheckIn: "8 days ago",
    adherence: "62%",
  },
  {
    id: "4",
    name: "Samira Khan",
    status: "Active",
    tags: ["Endurance"],
    lastWorkout: "Today",
    lastCheckIn: "5 days ago",
    adherence: "88%",
  },
];

const stages = ["All", "Onboarding", "Active", "At Risk", "Paused"];

const statusDot: Record<string, string> = {
  Active: "bg-success",
  "At Risk": "bg-danger",
  Onboarding: "bg-warning",
  Paused: "bg-muted-foreground",
};

export function PtClientsPage() {
  const isLoading = false;
  const inviteLink = "https://coachos.app/invite/velocity-pt-lab";
  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Clients pipeline</h2>
          <p className="text-sm text-muted-foreground">
            Track onboarding, adherence, and at-risk athletes.
          </p>
        </div>
        <Dialog>
          <DialogTrigger asChild>
            <Button>Create invite code</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Invite a new client</DialogTitle>
              <DialogDescription>Share this link to onboard a new athlete.</DialogDescription>
            </DialogHeader>
            <div className="rounded-lg border border-border bg-muted/40 p-3 text-sm">{inviteLink}</div>
            <DialogFooter>
              <Button variant="secondary">Copy link</Button>
              <Button>Done</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Tabs defaultValue="All">
        <TabsList className="flex w-full flex-wrap justify-start gap-2 bg-transparent p-0">
          {stages.map((stage) => (
            <TabsTrigger key={stage} value={stage} className="border border-border bg-muted/50">
              {stage}
            </TabsTrigger>
          ))}
        </TabsList>

        {stages.map((stage) => {
          const filtered = stage === "All" ? clients : clients.filter((client) => client.status === stage);
          return (
            <TabsContent key={stage} value={stage}>
              <Card>
                <CardHeader className="flex flex-row items-start justify-between gap-4">
                  <div>
                    <CardTitle>{stage === "All" ? "All clients" : `${stage} clients`}</CardTitle>
                    <p className="text-sm text-muted-foreground">
                      {stage === "All"
                        ? "Keep an eye on adherence and outreach."
                        : `Clients currently tagged as ${stage.toLowerCase()}.`}
                    </p>
                  </div>
                  <Button variant="secondary" size="sm">
                    Export list
                  </Button>
                </CardHeader>
                <CardContent className="space-y-4">
                  {isLoading ? (
                    <div className="space-y-3">
                      {Array.from({ length: 4 }).map((_, index) => (
                        <Skeleton key={index} className="h-20 w-full" />
                      ))}
                    </div>
                  ) : filtered.length > 0 ? (
                    filtered.map((client) => (
                      <div
                        key={client.id}
                        className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border bg-background p-4 transition hover:-translate-y-0.5 hover:shadow-lg"
                      >
                        <div className="min-w-[220px]">
                          <div className="flex items-center gap-2">
                            <span
                              className={`h-2.5 w-2.5 rounded-full ${statusDot[client.status] ?? "bg-muted"}`}
                            />
                            <p className="text-sm font-semibold">{client.name}</p>
                          </div>
                          <p className="text-xs text-muted-foreground">{client.status}</p>
                        </div>
                        <div className="flex flex-1 flex-wrap items-center gap-2">
                          {client.tags.map((tag) => (
                            <Badge key={tag} variant="muted">
                              {tag}
                            </Badge>
                          ))}
                        </div>
                        <div className="min-w-[160px] text-xs text-muted-foreground">
                          <p>Last workout: {client.lastWorkout}</p>
                          <p>Last check-in: {client.lastCheckIn}</p>
                        </div>
                        <div className="min-w-[120px] text-right">
                          <p className="text-xs text-muted-foreground">Adherence</p>
                          <p className="text-sm font-semibold text-accent">{client.adherence}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button asChild size="sm" variant="secondary">
                            <Link to={`/pt/clients/${client.id}`}>Open profile</Link>
                          </Button>
                          <Button size="sm">Message</Button>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-xl border border-dashed border-border bg-muted/40 p-8 text-center">
                      <p className="text-sm font-semibold">No clients in this stage yet.</p>
                      <p className="mt-2 text-xs text-muted-foreground">
                        Invite a new client or adjust their status.
                      </p>
                      <Button className="mt-4" size="sm">
                        Invite client
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          );
        })}
      </Tabs>
    </div>
  );
}

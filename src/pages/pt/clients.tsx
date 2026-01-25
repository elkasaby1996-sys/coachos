import { Link } from "react-router-dom";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";

const clients = [
  { id: "1", name: "Avery Johnson", status: "Active", tag: "Strength" },
  { id: "2", name: "Morgan Lee", status: "Onboarding", tag: "CrossFit" },
  { id: "3", name: "Jordan Patel", status: "Active", tag: "Bodybuilding" },
];

export function PtClientsPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Clients</h2>
          <p className="text-sm text-muted-foreground">Manage invite codes and client tags.</p>
        </div>
        <Button>Create invite code</Button>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Client roster</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {clients.map((client) => (
            <div
              key={client.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-background p-3"
            >
              <div>
                <p className="text-sm font-medium">{client.name}</p>
                <p className="text-xs text-muted-foreground">{client.status}</p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="muted">{client.tag}</Badge>
                <Button asChild size="sm" variant="secondary">
                  <Link to={`/pt/clients/${client.id}`}>Open profile</Link>
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

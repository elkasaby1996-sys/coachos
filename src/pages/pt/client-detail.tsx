import { useState } from "react";
import { Badge } from "../../components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { cn } from "../../lib/utils";

const tabs = ["overview", "plan", "logs", "progress", "checkins", "messages", "notes"] as const;

export function PtClientDetailPage() {
  const [active, setActive] = useState<(typeof tabs)[number]>("overview");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Avery Johnson</h2>
          <p className="text-sm text-muted-foreground">Strength + Hypertrophy block</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="success">Active</Badge>
          <Button variant="secondary">Message</Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 border-b border-border pb-2">
        {tabs.map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActive(tab)}
            className={cn(
              "rounded-md px-3 py-2 text-sm font-medium capitalize",
              active === tab
                ? "border-b-2 border-accent text-foreground"
                : "text-muted-foreground"
            )}
          >
            {tab}
          </button>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="capitalize">{active}</CardTitle>
          <p className="text-sm text-muted-foreground">
            {active === "overview"
              ? "Latest entries, streaks, and momentum."
              : "Section details coming soon."}
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          {active === "overview" ? (
            <>
              <div className="flex items-center justify-between rounded-lg border border-border bg-muted/50 p-3">
                <div>
                  <p className="text-sm font-medium">Weekly check-in</p>
                  <p className="text-xs text-muted-foreground">Due Saturday</p>
                </div>
                <Badge variant="warning">Due</Badge>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-border bg-muted/50 p-3">
                <div>
                  <p className="text-sm font-medium">Last workout</p>
                  <p className="text-xs text-muted-foreground">Completed yesterday</p>
                </div>
                <Badge variant="success">Completed</Badge>
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">No data yet for this tab.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

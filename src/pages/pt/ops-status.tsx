import { useEffect, useState } from "react";
import { AlertTriangle, RefreshCcw } from "lucide-react";
import { Button } from "../../components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import { WorkspacePageHeader } from "../../components/pt/workspace-page-header";
import { useBootstrapAuth, useSessionAuth } from "../../lib/auth";
import { supabaseConfigured } from "../../lib/supabase";

type HealthState = "loading" | "ok" | "error";

export function PtOpsStatusPage() {
  const { session } = useSessionAuth();
  const { role } = useBootstrapAuth();
  const [healthState, setHealthState] = useState<HealthState>("loading");
  const [healthMessage, setHealthMessage] = useState<string>(
    "Checking /health...",
  );
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();

    const checkHealth = async () => {
      try {
        const response = await fetch("/health", {
          signal: controller.signal,
          cache: "no-store",
        });
        if (!active) return;
        if (!response.ok) {
          setHealthState("error");
          setHealthMessage(`GET /health returned ${response.status}`);
          return;
        }
        const text = await response.text();
        if (!active) return;
        setHealthState("ok");
        setHealthMessage(text || "ok");
      } catch (error) {
        if (!active) return;
        setHealthState("error");
        setHealthMessage(
          error instanceof Error ? error.message : "Health check failed.",
        );
      }
    };

    setHealthState("loading");
    setHealthMessage("Checking /health...");
    void checkHealth();
    return () => {
      active = false;
      controller.abort();
    };
  }, [refreshKey]);

  const nowIso = new Date().toISOString();

  return (
    <div className="space-y-6">
      <WorkspacePageHeader
        title="Ops Status"
        description="Diagnostics and support signals for local or staging verification. This page is for environment health, not daily coaching workflow."
        actions={
          <Button
            variant="secondary"
            onClick={() => setRefreshKey((value) => value + 1)}
          >
            <RefreshCcw className="mr-2 h-4 w-4" />
            Refresh checks
          </Button>
        }
      />

      <div className="rounded-[24px] border border-warning/30 bg-warning/10 px-5 py-4">
        <div className="flex items-start gap-3">
          <div className="flex h-8 w-8 items-center justify-center text-warning">
            <AlertTriangle className="h-4 w-4" />
          </div>
          <div>
            <div className="text-sm font-semibold text-foreground">
              Admin diagnostics only
            </div>
            <div className="mt-1 text-sm text-muted-foreground">
              Use this page to verify runtime and environment health quickly. It
              should stay secondary to client and planning workflows.
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-[24px] border border-border/70 bg-background/35 px-4 py-4">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Supabase config
          </div>
          <div className="mt-2">
            <Badge variant={supabaseConfigured ? "default" : "danger"}>
              {supabaseConfigured ? "Configured" : "Missing env"}
            </Badge>
          </div>
        </div>
        <div className="rounded-[24px] border border-border/70 bg-background/35 px-4 py-4">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Auth role
          </div>
          <div className="mt-2">
            <Badge variant="secondary">{role ?? "none"}</Badge>
          </div>
        </div>
        <div className="rounded-[24px] border border-border/70 bg-background/35 px-4 py-4">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            User session
          </div>
          <div className="mt-2">
            <Badge variant={session ? "default" : "secondary"}>
              {session ? "Active" : "Signed out"}
            </Badge>
          </div>
        </div>
        <div className="rounded-[24px] border border-border/70 bg-background/35 px-4 py-4">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Health endpoint
          </div>
          <div className="mt-2">
            <Badge
              variant={
                healthState === "ok"
                  ? "default"
                  : healthState === "error"
                    ? "danger"
                    : "secondary"
              }
            >
              {healthState}
            </Badge>
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
        <Card className="border-border/70 bg-background/35">
          <CardHeader>
            <CardTitle>Runtime health</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div className="rounded-[18px] border border-border/70 bg-background/45 px-4 py-3">
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Health response
              </div>
              <div className="mt-2 text-sm text-foreground">
                {healthMessage}
              </div>
            </div>
            <div className="rounded-[18px] border border-border/70 bg-background/45 px-4 py-3">
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Last rendered
              </div>
              <div className="mt-2 text-sm text-foreground">{nowIso}</div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/70 bg-background/35">
          <CardHeader>
            <CardTitle>How to use this page</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <div className="rounded-[18px] border border-border/70 bg-background/45 px-4 py-3">
              Check this page when auth, env wiring, or health probes look
              suspicious.
            </div>
            <div className="rounded-[18px] border border-border/70 bg-background/45 px-4 py-3">
              If the workspace feels broken but coaching data is fine, start
              with the health endpoint and session state here.
            </div>
            <div className="rounded-[18px] border border-border/70 bg-background/45 px-4 py-3">
              Keep client work on the main PT pages. This page is deliberately
              scoped to diagnostics.
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

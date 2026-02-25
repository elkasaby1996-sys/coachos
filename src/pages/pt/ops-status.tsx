import { useEffect, useMemo, useState } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import { useAuth } from "../../lib/auth";
import { supabaseConfigured } from "../../lib/supabase";

type HealthState = "loading" | "ok" | "error";

export function PtOpsStatusPage() {
  const { session, role } = useAuth();
  const [healthState, setHealthState] = useState<HealthState>("loading");
  const [healthMessage, setHealthMessage] = useState<string>(
    "Checking /health...",
  );

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

    void checkHealth();
    return () => {
      active = false;
      controller.abort();
    };
  }, []);

  const nowIso = useMemo(() => new Date().toISOString(), []);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Ops Status</h1>
        <p className="text-sm text-muted-foreground">
          Quick support signals for local/staging verification.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Runtime</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex items-center justify-between">
            <span>Supabase config</span>
            <Badge variant={supabaseConfigured ? "default" : "danger"}>
              {supabaseConfigured ? "Configured" : "Missing env"}
            </Badge>
          </div>
          <div className="flex items-center justify-between">
            <span>Auth role</span>
            <Badge variant="secondary">{role ?? "none"}</Badge>
          </div>
          <div className="flex items-center justify-between">
            <span>User session</span>
            <Badge variant={session ? "default" : "secondary"}>
              {session ? "Active" : "Signed out"}
            </Badge>
          </div>
          <div className="flex items-center justify-between">
            <span>Health endpoint</span>
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
          <p className="text-muted-foreground">{healthMessage}</p>
          <div className="text-xs text-muted-foreground">
            Rendered: {nowIso}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

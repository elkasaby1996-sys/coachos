import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260510120000_add_wearables_module.sql",
  "utf8",
);

describe("wearables SQL contract", () => {
  it("creates the required wearable tables", () => {
    for (const table of [
      "workspace_wearable_settings",
      "client_wearable_connections",
      "client_wearable_daily_metrics",
      "client_wearable_sleep_sessions",
      "client_wearable_health_scores",
      "client_wearable_activities",
      "client_wearable_sync_runs",
    ]) {
      expect(migration).toContain(`create table if not exists public.${table}`);
    }
  });

  it("keeps wearable data separate from habits and lifecycle", () => {
    expect(migration).not.toMatch(/insert\s+into\s+public\.habit_logs/i);
    expect(migration).not.toMatch(/update\s+public\.habit_logs/i);
    expect(migration).not.toMatch(
      /update\s+public\.clients\s+set\s+lifecycle_state/i,
    );
  });

  it("enforces source attribution and PT visibility constraints", () => {
    expect(migration).toContain("provider text not null");
    expect(migration).toContain("pt_visibility_mode");
    expect(migration).toContain("summary_only");
    expect(migration).toContain("full_metrics");
    expect(migration).toContain("public.can_view_client_wearables");
  });

  it("defines idempotent unique indexes for provider records", () => {
    expect(migration).toContain(
      "client_wearable_daily_metrics_workspace_id_client_id_provider_metric_date_key",
    );
    expect(migration).toContain(
      "client_wearable_sleep_sessions_workspace_id_client_id_provider_provider_record_id_key",
    );
    expect(migration).toContain(
      "client_wearable_health_scores_workspace_id_client_id_provider_provider_record_id_score_type_key",
    );
    expect(migration).toContain(
      "client_wearable_activities_workspace_id_client_id_provider_provider_record_id_key",
    );
  });
});

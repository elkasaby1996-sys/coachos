import { describe, expect, it } from "vitest";
import {
  getProviderCapability,
  getWearableMetricState,
  normalizeActivity,
  normalizeDailyMetric,
  normalizeHealthScore,
  normalizeSleepSession,
} from "../../src/features/wearables/normalization";

describe("wearable provider capabilities and normalization", () => {
  it("marks WHOOP steps as unsupported while Garmin supports activity metrics", () => {
    expect(getProviderCapability("whoop", "steps")).toBe("unsupported");
    expect(getProviderCapability("garmin", "steps")).toBe("supported");
  });

  it("does not render missing values as zero", () => {
    expect(
      normalizeDailyMetric({
        workspaceId: "workspace-1",
        clientId: "client-1",
        provider: "garmin",
        metricDate: "2026-05-10",
        source: {},
      }).steps,
    ).toBeNull();
  });

  it("builds stable idempotency keys for daily metrics, sleep, scores, and activities", () => {
    expect(
      normalizeDailyMetric({
        workspaceId: "workspace-1",
        clientId: "client-1",
        provider: "garmin",
        metricDate: "2026-05-10",
        source: { steps: 1200 },
      }).upsertKey,
    ).toBe("workspace-1:client-1:garmin:2026-05-10");

    expect(
      normalizeSleepSession({
        workspaceId: "workspace-1",
        clientId: "client-1",
        provider: "whoop",
        source: { id: "sleep-1", start_at: "2026-05-09T22:00:00Z" },
      }).upsertKey,
    ).toBe("workspace-1:client-1:whoop:sleep-1");

    expect(
      normalizeHealthScore({
        workspaceId: "workspace-1",
        clientId: "client-1",
        provider: "whoop",
        source: {
          id: "recovery-1",
          type: "recovery",
          value: 82,
          recorded_at: "2026-05-10T05:00:00Z",
        },
      }).label,
    ).toBe("WHOOP recovery");

    expect(
      normalizeActivity({
        workspaceId: "workspace-1",
        clientId: "client-1",
        provider: "garmin",
        source: { id: "run-1", activity_type: "run" },
      }).upsertKey,
    ).toBe("workspace-1:client-1:garmin:run-1");
  });

  it("distinguishes unsupported, no data, stale, sync failed, and connected states", () => {
    expect(
      getWearableMetricState({
        supported: false,
        value: null,
        status: "connected",
        lastSyncAt: "2026-05-10T00:00:00Z",
        now: "2026-05-10T01:00:00Z",
        freshnessThresholdHours: 24,
      }),
    ).toBe("unsupported");
    expect(
      getWearableMetricState({
        supported: true,
        value: null,
        status: "connected",
        lastSyncAt: "2026-05-10T00:00:00Z",
        now: "2026-05-10T01:00:00Z",
        freshnessThresholdHours: 24,
      }),
    ).toBe("no_data");
    expect(
      getWearableMetricState({
        supported: true,
        value: 10,
        status: "sync_failed",
        lastSyncAt: "2026-05-10T00:00:00Z",
        now: "2026-05-10T01:00:00Z",
        freshnessThresholdHours: 24,
      }),
    ).toBe("sync_failed");
    expect(
      getWearableMetricState({
        supported: true,
        value: 10,
        status: "connected",
        lastSyncAt: "2026-05-08T00:00:00Z",
        now: "2026-05-10T01:00:00Z",
        freshnessThresholdHours: 24,
      }),
    ).toBe("stale");
    expect(
      getWearableMetricState({
        supported: true,
        value: 10,
        status: "connected",
        lastSyncAt: "2026-05-10T00:00:00Z",
        now: "2026-05-10T01:00:00Z",
        freshnessThresholdHours: 24,
      }),
    ).toBe("connected");
  });
});

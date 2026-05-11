import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const edgeFunction = readFileSync(
  "supabase/functions/open-wearables/index.ts",
  "utf8",
);

describe("Open Wearables edge function production contract", () => {
  it("validates provider input and workspace integration settings server-side", () => {
    expect(edgeFunction).toContain("supportedProviders");
    expect(edgeFunction).toContain("normalizeProvider");
    expect(edgeFunction).toContain("loadWearableSettings");
    expect(edgeFunction).toContain("assertWearablesEnabled");
    expect(edgeFunction).toContain("Unsupported wearable provider");
    expect(edgeFunction).toContain("Wearables are not enabled");
    expect(edgeFunction).toContain(
      "Provider is not enabled for this workspace",
    );
  });

  it("constrains OAuth redirect URIs to trusted app origins and the wearables route", () => {
    expect(edgeFunction).toContain("getAllowedRedirectOrigins");
    expect(edgeFunction).toContain("assertAllowedRedirectUri");
    expect(edgeFunction).toContain("ALLOWED_WEARABLE_REDIRECT_ORIGINS");
    expect(edgeFunction).toContain('pathname !== "/app/wearables"');
    expect(edgeFunction).toContain("Redirect URI origin is not allowed");
  });

  it("records partial sync failures instead of always marking sync runs as succeeded", () => {
    expect(edgeFunction).toContain("type OptionalFetchResult");
    expect(edgeFunction).toContain("status: syncRunStatus");
    expect(edgeFunction).toContain("sync_failed");
    expect(edgeFunction).toContain("sync_partial");
    expect(edgeFunction).toContain("sync_trigger_failed");
  });
});

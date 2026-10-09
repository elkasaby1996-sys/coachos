// Offline fixture only. Each response is a fresh clone; no remote credentials.
import { expect, vi } from "vitest";
import {
  baselineFixture,
  emptyDatabaseFixture,
} from "./staging-timing-fixture";
import { replacementPolicy } from "../../scripts/staging-replacement-target.mjs";
import { CAPTURE_ORGANIZATION } from "../../scripts/staging-bootstrap-observation.mjs";
import {
  bootstrapDatabaseProfiles,
  BOOTSTRAP_CATALOG_QUERY,
  BOOTSTRAP_EMPTY_DATABASE_QUERY,
  BOOTSTRAP_EMPTY_LEDGER_QUERY,
  SQL_CONTEXT,
} from "../../scripts/staging-bootstrap-database.mjs";
import {
  normalizeAuth,
  normalizeSecrets,
} from "../../scripts/staging-release-observation.mjs";
import { evidenceDigest } from "../../scripts/staging-release-webhook-history.mjs";

export const captureClock = Date.parse("2026-10-09T10:00:00Z");
export const captureContext = {
  commit: "c".repeat(40),
  tree: "d".repeat(40),
  project: "exmrksgdikfprtfeltzu",
  organization: CAPTURE_ORGANIZATION,
  origin: "https://repsync-staging-replacement.netlify.app",
  expectedProject: "exmrksgdikfprtfeltzu",
  expectedOrigin: "https://repsync-staging-replacement.netlify.app",
  productionProject: "btrfmxjpjzbyowtvncnc",
  productionOrigin: "https://repsync-production.netlify.app",
  clean: true,
};
export function captureFixture(identity: any = { source: "offline" }) {
  const p = bootstrapDatabaseProfiles();
  const state: any = {
    facts: {
      sqlContext: SQL_CONTEXT,
      ledgerPresent: false,
      versions: [],
      applicationRelations: 0,
      applicationFunctions: 0,
      customSchemas: 0,
      authUsers: 0,
      storageObjects: 0,
      storageBuckets: 0,
      databaseProof: emptyDatabaseFixture(),
    },
    project: {
      id: captureContext.project,
      organization_id: CAPTURE_ORGANIZATION,
      status: "ACTIVE_HEALTHY",
      created_at: new Date(captureClock - 30_000).toISOString(),
    },
    functions: [],
    secrets: [{ name: "CONFIG_A", value: "d".repeat(64) }],
    auth: {
      site_url: captureContext.origin,
      uri_allow_list: captureContext.origin + "/auth/callback",
      disable_signup: false,
      mailer_autoconfirm: false,
      ...Object.fromEntries(p.authBooleanFields.map((k: string) => [k, false])),
      ...Object.fromEntries(
        p.authEmptyStringFields.map((k: string) => [k, ""]),
      ),
    },
    sso: { items: [] },
    integrations: [],
  };
  const secrets = normalizeSecrets(state.secrets),
    auth = normalizeAuth(state.auth);
  const snapshot = {
    facts: state.facts,
    project: state.project,
    projectDigest: evidenceDigest(state.project),
    functions: [],
    secretNames: secrets.names,
    secretDigest: secrets.digest,
    authConfig: auth.fields,
    authDigest: auth.digest,
    authCustomerState: {
      complete: true,
      unapprovedIntegrations: 0,
      integrationDigest: evidenceDigest({
        sso: state.sso,
        integrations: state.integrations,
      }),
    },
  };
  const baseline = baselineFixture(
    identity,
    captureContext,
    replacementPolicy(),
    captureClock,
    snapshot,
  );
  let reads = 0;
  const harness = {
    state,
    baseline,
    identity,
    snapshot,
    before: undefined as undefined | ((url: string, read: number) => void),
    time: captureClock,
    mutation: vi.fn(),
    transport: vi.fn(async (url: string, init: any) => {
      const suffix = url.slice(
        `https://api.supabase.com/v1/projects/${captureContext.project}`.length,
      );
      expect(url).toBe(
        `https://api.supabase.com/v1/projects/${captureContext.project}${suffix}`,
      );
      expect(init.redirect).toBe("error");
      if (suffix === "/database/query/read-only") {
        expect(init.method).toBe("POST");
        const query = JSON.parse(init.body).query;
        expect([
          BOOTSTRAP_CATALOG_QUERY,
          BOOTSTRAP_EMPTY_DATABASE_QUERY,
          BOOTSTRAP_EMPTY_LEDGER_QUERY,
        ]).toContain(query);
        if (query === BOOTSTRAP_CATALOG_QUERY) reads++;
        harness.before?.(suffix, reads);
        const value =
          query === BOOTSTRAP_CATALOG_QUERY
            ? [{ proof: state.facts.databaseProof }]
            : query === BOOTSTRAP_EMPTY_DATABASE_QUERY
              ? [{ facts: state.facts }]
              : [
                  {
                    ledger: {
                      sqlContext: SQL_CONTEXT,
                      versions: state.facts.versions,
                    },
                  },
                ];
        return new Response(JSON.stringify(value));
      }
      expect(init.method).toBe("GET");
      harness.before?.(suffix, reads);
      const map: any = {
        "": state.project,
        "/functions": state.functions,
        "/secrets": state.secrets,
        "/config/auth": state.auth,
        "/config/auth/sso/providers": state.sso,
        "/config/auth/third-party-auth": state.integrations,
      };
      expect(Object.hasOwn(map, suffix)).toBe(true);
      return new Response(JSON.stringify(map[suffix]));
    }),
    options: {
      identity,
      context: { ...captureContext },
      env: {
        SUPABASE_ACCESS_TOKEN: "synthetic-offline-token",
        STAGING_SUPABASE_PROJECT_REF: captureContext.project,
        PRODUCTION_SUPABASE_PROJECT_REF: captureContext.productionProject,
      },
      operator: structuredClone(baseline.creation),
      expiresAt: baseline.capture.expiresAt,
    },
    dependencies: {} as any,
    reads: () => reads,
  };
  harness.dependencies = {
    now: () => harness.time,
    transport: harness.transport,
    assertSource: vi.fn(),
  };
  return harness;
}

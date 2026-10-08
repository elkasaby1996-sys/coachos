import { describe, it, expect } from "vitest";
import {
  baselineFixture,
  emptyDatabaseFixture,
  checkpointDatabaseFixture,
  signBaselineFixture,
  signTimingFixture,
  timingTestReviewPolicy,
} from "../helpers/staging-timing-fixture";
import {
  validateVirginBaseline,
  validateBaselineCandidate,
  readBaselineEvidence,
} from "../../scripts/staging-bootstrap-baseline.mjs";
import {
  assertDatabaseProof,
  databaseProof,
  SQL_CONTEXT,
  bootstrapDatabaseProfiles,
  BOOTSTRAP_CATALOG_QUERY,
} from "../../scripts/staging-bootstrap-database.mjs";
import { evidenceDigest } from "../../scripts/staging-release-webhook-history.mjs";
import { replacementPolicy } from "../../scripts/staging-replacement-target.mjs";
import { observeBootstrapRelease } from "../../scripts/staging-bootstrap-observation.mjs";
const clock = Date.parse("2026-10-08T09:00:00Z"),
  stamp = (offset = 0) => new Date(clock + offset).toISOString();
const policy = replacementPolicy(),
  context = {
    commit: "c".repeat(40),
    tree: "d".repeat(40),
    project: policy.replacement.project,
    origin: policy.replacement.origin,
  },
  identity = { source: "synthetic-local-test" };
function fixture() {
  const proof = emptyDatabaseFixture(),
    project = {
      id: context.project,
      organization_id: "test-org",
      status: "ACTIVE_HEALTHY",
      created_at: stamp(-1000),
    };
  const snapshot = {
    facts: {
      databaseProof: proof,
      sqlContext: SQL_CONTEXT,
      ledgerPresent: false,
      versions: [],
      applicationRelations: 0,
      applicationFunctions: 0,
      customSchemas: 0,
      authUsers: 0,
      storageObjects: 0,
      storageBuckets: 0,
    },
    project,
    projectDigest: evidenceDigest(project),
    functions: [],
    secretNames: [],
    secretDigest: "a".repeat(64),
    authConfig: {
      site_url: context.origin,
      uri_allow_list: context.origin + "/auth/callback",
      disable_signup: false,
      mailer_autoconfirm: false,
    },
    authDigest: "b".repeat(64),
    authCustomerState: {
      complete: true,
      unapprovedIntegrations: 0,
      integrationDigest: evidenceDigest({
        sso: { items: [] },
        integrations: [],
      }),
    },
  };
  const baseline = baselineFixture(identity, context, policy, clock, snapshot);
  return {
    baseline,
    proof,
    run: (now = clock) =>
      validateVirginBaseline(
        baseline,
        identity,
        context,
        policy,
        now,
        timingTestReviewPolicy(),
      ),
  };
}
function revise(proof: any, change: (p: any) => void) {
  const p = structuredClone(proof);
  change(p);
  delete p.catalogDigest;
  delete p.platformDigest;
  p.catalogCount = p.catalog.length;
  p.platformCount = p.platform.length;
  return databaseProof(p, p.seedDigest);
}
describe("independent target-specific virgin baseline", () => {
  it.each([
    ["anon", "SET", false],
    ["authenticated", "SET", true],
    ["PUBLIC", "ALTER SYSTEM", false],
    ["service_role", "ALTER SYSTEM", true],
  ])(
    "rejects signed matching baseline with %s %s parameter grant (grantable=%s)",
    (role, privilege, grantable) => {
      const f = fixture();
      expect(f.run().target.project).toBe(context.project);
      const proof = revise(f.proof, (p) => {
        p.catalog.push([
          "parameter_acl",
          "session_replication_role",
          {
            isNull: false,
            privileges: [
              [
                "supabase_admin",
                role === "PUBLIC" ? ["PUBLIC"] : ["role", role],
                privilege,
                grantable,
              ],
            ],
          },
        ]);
        p.securityCatalogs.parameterAcls++;
      });
      f.baseline.databaseProof = proof;
      for (const key of ["opening", "closing", "confirmation"])
        f.baseline.capture[key].facts.databaseProof = structuredClone(proof);
      signBaselineFixture(f.baseline);
      expect(f.run).toThrow("BOOTSTRAP_CUSTOMER_PARAMETER_ACL_MISMATCH");
      expect(() => assertDatabaseProof(proof, 0, f.baseline)).toThrow(
        "BOOTSTRAP_CUSTOMER_PARAMETER_ACL_MISMATCH",
      );
    },
  );
  it.each([
    "grant option",
    "plain public grant",
    "column grant",
    "schema create",
    "default grant",
    "customer owner",
    "RLS disabled",
    "FORCE RLS changed",
    "inherited privilege",
    "role bypass",
    "duplicate tuple",
  ])("rejects a signed matching baseline with unsafe %s", (kind) => {
    const f = fixture();
    expect(f.run().target.project).toBe(context.project);
    const proof = structuredClone(f.proof);
    const records = proof.customerSecurity;
    const storage = records.find(
      (r: any) =>
        r[0] === "relation_security" &&
        r[1] === "storage" &&
        r[2] === "objects",
    );
    if (kind === "grant option")
      records.find(
        (r: any) =>
          r[0] === "acl" &&
          r[1].join(".") === "relation.storage.objects" &&
          r[3][1] === "anon" &&
          r[4] === "UPDATE",
      )[5] = true;
    if (kind === "plain public grant")
      records.push([
        "acl",
        ["relation", "storage", "objects"],
        "supabase_storage_admin",
        ["PUBLIC"],
        "UPDATE",
        false,
      ]);
    if (kind === "column grant")
      records.push([
        "acl",
        ["column", "auth", "users", "email"],
        "supabase_auth_admin",
        ["role", "anon"],
        "SELECT",
        false,
      ]);
    if (kind === "schema create")
      records.push([
        "acl",
        ["schema", "storage"],
        "supabase_admin",
        ["role", "anon"],
        "CREATE",
        false,
      ]);
    if (kind === "default grant")
      records.push([
        "acl",
        ["default", "postgres", "auth", "r"],
        "postgres",
        ["role", "anon"],
        "SELECT",
        false,
      ]);
    if (kind === "customer owner") storage[3] = "authenticated";
    if (kind === "RLS disabled") storage[4] = false;
    if (kind === "FORCE RLS changed") storage[5] = true;
    if (kind === "inherited privilege")
      records.push([
        "membership",
        "anon",
        "supabase_storage_admin",
        true,
        true,
      ]);
    if (kind === "role bypass")
      records.find((r: any) => r[0] === "role" && r[1] === "anon")[8] = true;
    if (kind === "duplicate tuple") records.push(structuredClone(records[0]));
    proof.customerSecurityCount = records.length;
    f.baseline.databaseProof = databaseProof(proof);
    for (const key of ["opening", "closing", "confirmation"])
      f.baseline.capture[key].facts.databaseProof = structuredClone(
        f.baseline.databaseProof,
      );
    signBaselineFixture(f.baseline);
    expect(f.run).toThrow("BOOTSTRAP_CUSTOMER_SECURITY_MISMATCH");
    expect(() =>
      assertDatabaseProof(f.baseline.databaseProof, 0, f.baseline),
    ).toThrow("BOOTSTRAP_CUSTOMER_SECURITY_MISMATCH");
  });
  it.each(["role_setting", "parameter_acl"])(
    "pins %s at both checkpoints and rejects missing extraction",
    (kind) => {
      const base = fixture().baseline;
      const record =
        kind === "role_setting"
          ? [
              kind,
              '["postgres", "authenticated"]',
              ["postgres", "authenticated", ["search_path=public, auth"]],
            ]
          : [
              kind,
              "session_replication_role",
              {
                isNull: false,
                privileges: [
                  ["supabase_admin", ["role", "pgbouncer"], "SET", false],
                ],
              },
            ];
      for (const count of [0, 180]) {
        const original =
          count === 0 ? base.databaseProof : checkpointDatabaseFixture(base);
        expect(() => assertDatabaseProof(original, count, base)).not.toThrow();
        const changed = revise(original, (p) => {
          p.catalog.push(record);
          p.securityCatalogs[
            kind === "role_setting" ? "roleSettings" : "parameterAcls"
          ]++;
        });
        expect(changed.catalogDigest).not.toBe(original.catalogDigest);
        expect(() => assertDatabaseProof(changed, count, base)).toThrow(
          "BOOTSTRAP_DATABASE_PROFILE_MISMATCH",
        );
        const missing = structuredClone(changed);
        missing.catalog = missing.catalog.filter((r: any) => r[0] !== kind);
        missing.catalogCount = missing.catalog.length;
        expect(() => databaseProof(missing)).toThrow(
          "BOOTSTRAP_SECURITY_CATALOG_INCOMPLETE",
        );
      }
    },
  );
  it.each([
    "securityCatalogs",
    "customerSecurity",
    "customerSecurityComplete",
    "customerSecurityCount",
  ])("rejects missing mandatory %s", (field) => {
    const proof = structuredClone(fixture().proof);
    delete proof[field];
    expect(() => databaseProof(proof)).toThrow(
      /BOOTSTRAP_(SECURITY_CATALOG|CUSTOMER_SECURITY)_INCOMPLETE/,
    );
  });
  it("validates an unsigned candidate without enrolling or authorizing it", () => {
    const f = fixture();
    const {
      completeEvidenceReviewed: _e,
      creationHistoryReviewed: _h,
      reviewEvidenceSha256: _d,
      review: _r,
      ...candidate
    } = f.baseline;
    expect(
      validateBaselineCandidate(candidate, identity, context, policy, clock)
        .operational,
    ).toBe(false);
    expect(() =>
      validateVirginBaseline(
        candidate,
        identity,
        context,
        policy,
        clock,
        timingTestReviewPolicy(),
      ),
    ).toThrow("BOOTSTRAP_BASELINE_INVALID");
  });
  it("accepts independently signed complete synthetic evidence only with explicit test trust", () => {
    const f = fixture();
    expect(f.run().target.project).toBe(context.project);
    expect(() =>
      validateVirginBaseline(f.baseline, identity, context, policy, clock),
    ).toThrow("BOOTSTRAP_BASELINE_REVIEW_REQUIRED");
    expect(() => readBaselineEvidence(context.project)).toThrow(
      "BOOTSTRAP_BASELINE_NOT_REGISTERED",
    );
    expect(() => readBaselineEvidence("../secrets")).toThrow(
      "BOOTSTRAP_BASELINE_TARGET_INVALID",
    );
  });
  it.each([
    "missing attestation",
    "false attestation",
    "known pre-capture unique index",
    "unreviewed history",
    "missing creation evidence",
  ])("rejects %s even with a new test signature", (kind) => {
    const f = fixture(),
      b: any = f.baseline;
    if (kind === "missing attestation")
      delete b.creation.noManagedSchemaCustomizationSinceProjectCreation;
    if (kind === "false attestation")
      b.creation.noManagedSchemaCustomizationSinceProjectCreation = false;
    if (kind === "known pre-capture unique index")
      b.creation.knownCustomerCustomizations = [
        "customer unique index on storage.objects with inherited managed owner",
      ];
    if (kind === "unreviewed history") b.creationHistoryReviewed = false;
    if (kind === "missing creation evidence")
      b.creation.provenanceEvidenceSha256 = [];
    signBaselineFixture(b);
    expect(f.run).toThrow("BOOTSTRAP_BASELINE_INVALID");
  });
  it.each([
    "hash only",
    "altered evidence",
    "copied project",
    "copied organization",
    "different source",
    "different tree",
    "different observer",
    "different policy",
    "different query",
    "missing closing",
    "incomplete metadata",
  ])("rejects %s", (kind) => {
    const f = fixture(),
      b: any = f.baseline;
    if (kind === "hash only") b.review.signature = "A".repeat(86) + "==";
    if (kind === "altered evidence")
      b.capture.opening.project.region = "unreviewed";
    if (kind === "copied project") b.target.project = "z".repeat(20);
    if (kind === "copied organization") b.target.organization = "another-org";
    const sourceFields: any = {
      "different source": "sha",
      "different tree": "tree",
      "different observer": "observerSha256",
      "different policy": "policyDigest",
      "different query": "querySha256",
    };
    if (sourceFields[kind])
      b.source[sourceFields[kind]] = "f".repeat(
        ["sha", "tree"].includes(sourceFields[kind]) ? 40 : 64,
      );
    if (kind === "missing closing") b.capture.closing = {};
    if (kind === "incomplete metadata")
      delete b.capture.confirmation.authDigest;
    if (!["hash only", "altered evidence"].includes(kind))
      signBaselineFixture(b);
    expect(f.run).toThrow();
  });
  it("rejects source-approved signature replay from timing's domain", () => {
    const f = fixture();
    signTimingFixture(f.baseline);
    expect(f.run).toThrow("BOOTSTRAP_BASELINE_REVIEW_REQUIRED");
  });
  it.each([15 * 60_000 + 1, 30 * 60_000])(
    "cannot reuse stale baseline at %s ms",
    (offset) => {
      expect(() => fixture().run(clock + offset)).toThrow(
        "BOOTSTRAP_BASELINE_STALE",
      );
    },
  );
  it("retains the exact 60-second capture limit", () => {
    const f = fixture();
    f.baseline.capture.startedAt = stamp(-60_001);
    f.baseline.creation.createdAt = stamp(-61_000);
    for (const s of Object.values(f.baseline.capture).filter(
      (v: any) => v?.project,
    ) as any[]) {
      s.project.created_at = stamp(-61_000);
      s.projectDigest = evidenceDigest(s.project);
    }
    signBaselineFixture(f.baseline);
    expect(f.run).toThrow();
  });
});
describe("genuine terminal database confirmation", () => {
  async function terminal(
    change?: (count: number, value: any) => void,
    elapsed = 0,
  ) {
    const baseline = fixture().baseline;
    const metadata = {
      projectDigest: baseline.capture.confirmation.projectDigest,
      secretDigest: "a".repeat(64),
      authDigest: "b".repeat(64),
      functions: [],
    };
    const surface = {
      DATABASE_DRIFT: "a".repeat(64),
      FUNCTION_INVENTORY_DRIFT: "b".repeat(64),
      CONFIGURATION_DRIFT: "c".repeat(64),
      AUTH_CONFIGURATION_DRIFT: "d".repeat(64),
    };
    let reads = 0,
      now = clock;
    const empty = {
      metadata: async () => structuredClone(metadata),
      databaseProof: async () => {
        reads++;
        const value = { actualRead: reads, content: "stable" };
        change?.(reads, value);
        if (reads === 3) now += elapsed;
        return { content: value.content };
      },
    };
    const release = {
      observe: async () => ({
        facts: {},
        functions: [],
        secretDigest: metadata.secretDigest,
        authDigest: metadata.authDigest,
        digest: "e".repeat(64),
        observedAt: stamp(),
        stability: {
          stable: true,
          categories: [],
          startedAt: stamp(),
          completedAt: stamp(),
          proof: { opening: surface, closing: surface, confirmation: surface },
        },
      }),
    };
    const result = await observeBootstrapRelease(
      empty,
      release,
      baseline,
      () => now,
    );
    return { result, reads };
  }
  it("performs three independent reads and binds the final read into its receipt proof", async () => {
    const { result, reads } = await terminal();
    expect(reads).toBe(3);
    expect(result.facts.databaseProof).toEqual({ content: "stable" });
    expect(result.stability.proof.opening).toEqual(
      result.stability.proof.confirmation,
    );
  });
  it("rejects drift introduced only for the NEW final confirmation", async () => {
    await expect(
      terminal((n, v) => {
        if (n === 3) v.content = "drift";
      }),
    ).rejects.toThrow("DATABASE_DRIFT");
  });
  it("retains 60 seconds inclusive and rejects the next millisecond", async () => {
    expect((await terminal(undefined, 60_000)).reads).toBe(3);
    await expect(terminal(undefined, 60_001)).rejects.toThrow();
  });
});
describe("PAY-05AP fourteen attacks and full managed multiset", () => {
  const attacks: any[] = [
    [
      "customer role membership",
      [
        "role_membership",
        "supabase_admin.authenticated.postgres",
        [true, true, true],
      ],
    ],
    ["customer temporary object", ["temporary_object_count", "*", 1]],
    [
      "post-capture inherited-owner Storage unique index",
      [
        "relation",
        "storage.provider_looking_unique",
        [
          "i",
          "p",
          "supabase_storage_admin",
          null,
          false,
          false,
          null,
          "CREATE UNIQUE INDEX provider_looking_unique ON storage.objects (bucket_id)",
          null,
        ],
      ],
    ],
    [
      "custom auth.users trigger",
      ["trigger", "auth.users.provider_trigger", ["unexpected body", "O"]],
    ],
    [
      "custom Storage policy",
      [
        "policy",
        "storage.objects.provider_policy",
        ["*", true, ["public"], "true", null],
      ],
    ],
    [
      "custom Realtime policy",
      [
        "policy",
        "realtime.messages.provider_policy",
        ["*", true, ["public"], "true", null],
      ],
    ],
    [
      "function hidden in auth",
      [
        "routine",
        "auth.provider_function()",
        ["f", "supabase_auth_admin", null, null, false, "unexpected body"],
      ],
    ],
    [
      "type hidden in realtime",
      [
        "type",
        "realtime.provider_type",
        ["e", "supabase_realtime_admin", null],
      ],
    ],
    [
      "managed owner/name camouflage",
      [
        "index_security",
        "storage.objects_pkey_provider",
        [true, true, false, true, false, true, false, true, true, false, false],
      ],
    ],
    [
      "extension membership camouflage",
      ["dependency", "function auth.camouflage()", ["e", "extension pgcrypto"]],
    ],
    ["altered built-in cast", ["cast", "text->uuid", ["i", "i", "-"]]],
    [
      "cross-boundary dependency",
      [
        "dependency",
        "function auth.customer()",
        ["n", "table public.billing_accounts"],
      ],
    ],
    [
      "provider migration",
      [
        "extension",
        "provider_extension",
        ["unexpected-version", "extensions", false, "supabase_admin"],
      ],
    ],
    [
      "provider Realtime partition rotation",
      [
        "relation_security",
        "realtime.messages_new",
        ["d", true, "unexpected bound", null],
      ],
    ],
  ];
  it.each(attacks)(
    "blocks %s independently of owner and schema",
    (_name, record) => {
      const f = fixture(),
        altered = revise(f.proof, (p) => p.catalog.push(record));
      expect(() => assertDatabaseProof(altered, 0, f.baseline)).toThrow();
    },
  );
  it("pins provider diagnostics instead of learning them", () => {
    const f = fixture();
    const altered = revise(
      f.proof,
      (p) => (p.platform[0].digest = "f".repeat(64)),
    );
    expect(() => assertDatabaseProof(altered, 0, f.baseline)).toThrow();
  });
  it.each([
    "catalog omitted",
    "component omitted",
    "permission filtered",
    "wrong SQL context",
    "incomplete flag",
    "duplicate component",
  ])("rejects %s extraction", (kind) => {
    const f = fixture(),
      p: any = structuredClone(f.proof);
    if (kind === "catalog omitted") p.catalog.pop();
    if (kind === "component omitted") p.platform.pop();
    if (kind === "permission filtered") p.platform[0].unfiltered = false;
    if (kind === "wrong SQL context") p.sqlContext.DateStyle = "SQL, DMY";
    if (kind === "incomplete flag") p.platformComplete = false;
    if (kind === "duplicate component") p.platform.push(p.platform[0]);
    expect(() => databaseProof(p)).toThrow();
  });
  it("source SQL sets and observes context in the same materialized request", () => {
    for (const [key, value] of Object.entries(SQL_CONTEXT)) {
      expect(BOOTSTRAP_CATALOG_QUERY).toContain(key);
      expect(BOOTSTRAP_CATALOG_QUERY).toContain(value);
    }
    expect(BOOTSTRAP_CATALOG_QUERY).toContain("context as materialized");
    expect(BOOTSTRAP_CATALOG_QUERY).toContain("pg_catalog.set_config");
    expect(BOOTSTRAP_CATALOG_QUERY).toContain("pg_catalog.query_to_xml");
    expect(BOOTSTRAP_CATALOG_QUERY).toContain("pg_catalog.xpath");
    expect(BOOTSTRAP_CATALOG_QUERY).toContain("pg_catalog.current_setting");
    expect(BOOTSTRAP_CATALOG_QUERY).toContain("OPERATOR(pg_catalog.=)");
    expect(BOOTSTRAP_CATALOG_QUERY).toContain("OPERATOR(pg_catalog.||)");
    expect(BOOTSTRAP_CATALOG_QUERY).toContain("$repsync_fixed$");
    expect(BOOTSTRAP_CATALOG_QUERY).toContain("indisready");
  });
});
describe("exact baseline plus canonical checkpoint-180 delta", () => {
  it("admits canonical records and only the exact five buckets, 20 policies, nine publication members and 84 RI triggers", () => {
    const f = fixture(),
      p = bootstrapDatabaseProfiles(),
      proof = checkpointDatabaseFixture(f.baseline);
    assertDatabaseProof(proof, 180, f.baseline);
    expect([...p.delta180.storageBuckets].sort()).toEqual(
      [
        "baseline_photos",
        "checkin-photos",
        "medical_documents",
        "pt_profile_media",
        "workspace_branding",
      ].sort(),
    );
    expect(p.delta180.storagePolicies).toHaveLength(20);
    expect(p.delta180.publicationMembers).toHaveLength(9);
    expect(p.delta180.authForeignKeyTriggers).toHaveLength(84);
  });
  it.each([
    "additional unique index",
    "duplicate catalog identity",
    "removed policy",
    "extra policy",
    "removed publication member",
    "extra publication member",
    "trigger function",
    "trigger enabled",
    "trigger deferrability",
    "trigger multiplicity",
    "changed owner",
    "changed ACL",
    "changed RLS",
    "index readiness",
    "wrong bucket configuration",
    "changed seed",
  ])("rejects %s while preserving every legitimate table change", (kind) => {
    const f = fixture(),
      proof = checkpointDatabaseFixture(f.baseline);
    const altered = revise(proof, (p) => {
      const find = (type: string, prefix: string) =>
        p.catalog.find((r: any) => r[0] === type && r[1].startsWith(prefix));
      if (kind === "additional unique index")
        p.catalog.push([
          "index_security",
          "storage.provider_unique",
          [
            true,
            false,
            false,
            true,
            false,
            true,
            false,
            true,
            true,
            false,
            false,
          ],
        ]);
      if (kind === "duplicate catalog identity")
        p.catalog.push(structuredClone(find("policy", "storage.objects.")));
      if (kind === "removed policy")
        p.catalog.splice(
          p.catalog.indexOf(find("policy", "storage.objects.")),
          1,
        );
      if (kind === "extra policy")
        p.catalog.push([
          "policy",
          "storage.objects.extra",
          ["*", true, ["public"], "true", null],
        ]);
      if (kind === "removed publication member")
        p.catalog.splice(
          p.catalog.indexOf(find("publication_relation", "supabase_realtime.")),
          1,
        );
      if (kind === "extra publication member")
        p.catalog.push([
          "publication_relation",
          "supabase_realtime.public.extra",
          [null, null],
        ]);
      if (kind.startsWith("trigger")) {
        const r = find("trigger_security", "auth.users.");
        if (kind === "trigger function") r[2][0] = "pg_catalog.unexpected()";
        if (kind === "trigger enabled") r[2][5] = "D";
        if (kind === "trigger deferrability") r[2][3] = !r[2][3];
        if (kind === "trigger multiplicity") p.catalog.push(structuredClone(r));
      }
      if (["changed owner", "changed ACL", "changed RLS"].includes(kind)) {
        const r = find("relation", "public.");
        const i = { "changed owner": 2, "changed ACL": 3, "changed RLS": 4 }[
          kind
        ];
        r[2][i] = kind === "changed RLS" ? !r[2][i] : "unexpected";
      }
      if (kind === "index readiness")
        find("index_security", "public.")[2][7] = false;
      if (kind === "wrong bucket configuration")
        p.platform.find(
          (c: any) => c.name === "storage.buckets",
        ).rows[0].public = true;
      if (kind === "changed seed") p.seedDigest = "f".repeat(64);
    });
    expect(() => assertDatabaseProof(altered, 180, f.baseline)).toThrow();
  });
});

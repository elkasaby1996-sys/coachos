import { z } from "zod";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

export const BILLING_FUNCTIONS = [
  "billing-create-lemon-squeezy-checkout",
  "billing-create-paddle-checkout",
  "billing-lemon-squeezy-webhook",
  "billing-create-customer-portal-link",
  "billing-preview-plan-change",
  "billing-change-subscription-plan",
  "billing-cancel-scheduled-plan-change",
  "billing-refresh-plan-change",
  "billing-preview-coach-seat-change",
  "billing-change-coach-seat-quantity",
  "billing-cancel-scheduled-seat-change",
  "billing-refresh-coach-seat-change",
];
export const NONBILLING_FUNCTIONS = [
  "open-wearables",
  "exercise-dataset-search",
];
export const SCENARIO_IDS = [
  "CERT-DEPLOY-001",
  "CERT-DEPLOY-002",
  "CERT-AUTH-001",
  "CERT-CATALOGUE-001",
  "CERT-CHECKOUT-001",
  "CERT-CHECKOUT-002",
  "CERT-WEBHOOK-001",
  "CERT-WEBHOOK-002",
  "CERT-WEBHOOK-003",
  "CERT-PORTAL-001",
  "CERT-PORTAL-002",
  "CERT-RECOVERY-001",
  "CERT-PLAN-001",
  "CERT-PLAN-002",
  "CERT-PLAN-003",
  "CERT-SEAT-001",
  "CERT-SEAT-002",
  "CERT-SEAT-003",
  "CERT-ACCESS-001",
  "CERT-ACCESS-002",
  "CERT-ACCESS-003",
  "CERT-SECURITY-001",
  "CERT-ROLLBACK-001",
];
export const SECRET_NAMES = [
  "SUPABASE_ACCESS_TOKEN",
  "SUPABASE_DB_PASSWORD",
  "SUPABASE_URL",
  "SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "LEMONSQUEEZY_API_KEY",
  "LEMONSQUEEZY_WEBHOOK_SECRET",
  "BILLING_PROVIDER_ENVIRONMENT",
  "BILLING_APP_BASE_URL",
  "BILLING_PORTAL_ALLOWED_HOSTS",
  "OPEN_WEARABLES_API_URL",
  "OPEN_WEARABLES_API_KEY",
  "ALLOWED_WEARABLE_REDIRECT_ORIGINS",
  "EXERCISE_DATASET_BASE_URL",
  "EXERCISE_DATASET_API_KEY",
  "EXERCISE_DATASET_API_KEY_HEADER",
];
export const ROLLBACK_IDS = [
  "application",
  "edge-functions",
  "compensating-migration",
  "mapping-retirement",
  "webhook-disablement",
  "secret-rotation",
  "pending-retries",
  "synthetic-users",
  "provider-test-resources",
  "evidence-retention",
];
export const sha256 = (value) =>
  createHash("sha256").update(value).digest("hex");
export const sha = z.string().regex(/^[a-f0-9]{40}$/);
export const digest = z.string().regex(/^[a-f0-9]{64}$/);
const exactList = (expected) =>
  z
    .array(z.string())
    .refine(
      (values) => JSON.stringify(values) === JSON.stringify(expected),
      "EXACT_LIST_REQUIRED",
    );
export const migrationSchema = z.strictObject({
  filename: z.string().regex(/^\d{14}_[a-z0-9_]+\.sql$/),
  sha256: digest,
});
const policy = z.strictObject({
  format: z.literal("allowlisted-json"),
  retentionDays: z.literal(7),
  rawArtifacts: z.literal(false),
  identifierPolicy: z.literal("sha256-with-private-run-salt"),
});
export const manifestSchema = z.strictObject({
  schemaVersion: z.literal(1),
  environment: z.literal("staging"),
  providerEnvironment: z.literal("test"),
  requiredBaseCommit: sha,
  reviewedCommit: z.literal("input:confirm_commit_sha"),
  requiredApplicationOrigin: z.literal("input:STAGING_APPLICATION_ORIGIN"),
  requiredSupabaseProjectRef: z.literal("input:STAGING_SUPABASE_PROJECT_REF"),
  migrations: z.strictObject({
    directory: z.literal("supabase/migrations"),
    approved: z.array(migrationSchema).min(1),
    expectedLatestMigration: migrationSchema.shape.filename,
  }),
  functions: z.strictObject({
    billing: exactList(BILLING_FUNCTIONS),
    nonbilling: exactList(NONBILLING_FUNCTIONS),
  }),
  jwtContracts: z.strictObject(
    Object.fromEntries(
      [...BILLING_FUNCTIONS, ...NONBILLING_FUNCTIONS].map((name) => [
        name,
        z.literal(name !== "billing-lemon-squeezy-webhook"),
      ]),
    ),
  ),
  requiredSecretNames: exactList(SECRET_NAMES),
  publicCatalogue: z.strictObject({
    expectedSchemaVersion: z.literal(2),
    expectedPlanCount: z.literal(3),
    expectedPublicFeatureCount: z.literal(2),
    expectedPublicAddonCount: z.literal(0),
  }),
  scenarioIds: exactList(SCENARIO_IDS),
  evidence: policy,
  unitGate: z.literal("full-suite-green-before-apply"),
});
export function requireCheck(condition, code) {
  if (!condition) throw new Error(code);
}
export function parseSafe(schema, value, code) {
  const result = schema.safeParse(value);
  requireCheck(result.success, code);
  return result.data;
}
export const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
export function validateMigrations(approved, actual, latest) {
  requireCheck(approved.length > 0, "MIGRATIONS_EMPTY");
  const names = approved.map((m) => m.filename);
  requireCheck(
    names.join() === [...names].sort().join() &&
      new Set(names.map((n) => n.slice(0, 14))).size === names.length,
    "MIGRATION_ORDER_MISMATCH",
  );
  requireCheck(names.at(-1) === latest, "MIGRATION_LATEST_MISMATCH");
  requireCheck(
    JSON.stringify(approved) === JSON.stringify(actual),
    "MIGRATION_CONTENT_DRIFT",
  );
}
export function validateJwt(toml, contracts) {
  for (const [name, expected] of Object.entries(contracts)) {
    const matches = [
      ...toml.matchAll(
        new RegExp(`^\\[functions\\.${name}\\]\\s*\\r?\\n([^\\[]*)`, "gm"),
      ),
    ];
    requireCheck(matches.length === 1, "FUNCTION_CONFIG_MISSING_OR_DUPLICATE");
    const flags = [
      ...matches[0][1].matchAll(/^verify_jwt\s*=\s*(true|false)\s*$/gm),
    ];
    requireCheck(
      flags.length === 1 && (flags[0][1] === "true") === expected,
      "JWT_CONTRACT_MISMATCH",
    );
  }
}
export function validateRepository(root, input) {
  const manifest = parseSafe(manifestSchema, input, "MANIFEST_INVALID");
  const directory = join(root, manifest.migrations.directory);
  const actual = readdirSync(directory)
    .sort()
    .map((filename) => ({
      filename,
      sha256: sha256(
        readFileSync(join(directory, filename), "utf8").replace(/\r\n/g, "\n"),
      ),
    }));
  validateMigrations(
    manifest.migrations.approved,
    actual,
    manifest.migrations.expectedLatestMigration,
  );
  for (const name of [
    ...manifest.functions.billing,
    ...manifest.functions.nonbilling,
  ]) {
    requireCheck(
      readFileSync(join(root, "supabase/functions", name, "index.ts"), "utf8")
        .length > 0,
      "FUNCTION_ENTRYPOINT_MISSING",
    );
  }
  validateJwt(
    readFileSync(join(root, "supabase/config.toml"), "utf8"),
    manifest.jwtContracts,
  );
  return manifest;
}
export function validateOrigin(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("ORIGIN_INVALID");
  }
  requireCheck(
    url.protocol === "https:" &&
      url.origin === value &&
      !url.username &&
      !url.password &&
      !url.port &&
      /^(?:[a-z0-9-]+\.)*[a-z0-9-]+\.[a-z]{2,}$/.test(url.hostname) &&
      !/(localhost|\.local$|\.internal$|\.test$|\.invalid$)/.test(
        url.hostname,
      ) &&
      /(^|[.-])staging([.-]|$)/.test(url.hostname) &&
      !/(^|[.-])(prod|production)([.-]|$)/.test(url.hostname),
    "STAGING_ORIGIN_REQUIRED",
  );
  return url;
}
export function validateConfirmations(input, git) {
  parseSafe(sha, input.commit, "COMMIT_REQUIRED");
  requireCheck(input.commit === git.commit, "COMMIT_MISMATCH");
  requireCheck(git.clean, "DIRTY_WORKTREE");
  requireCheck(
    git.containsBase &&
      git.descendsMain &&
      [
        "main",
        "feat/pr-price-11-staging-commercial-certification",
        "HEAD",
      ].includes(git.branch),
    "COMMIT_SOURCE_MISMATCH",
  );
  requireCheck(
    git.branch !== "HEAD" || input.githubRef === "refs/heads/main",
    "DETACHED_SOURCE_MISMATCH",
  );
  requireCheck(
    /^[a-z]{20}$/.test(input.project ?? "") &&
      input.project === input.expectedProject,
    "PROJECT_MISMATCH",
  );
  requireCheck(
    /^[a-z]{20}$/.test(input.productionProject ?? "") &&
      input.project !== input.productionProject,
    "PRODUCTION_PROJECT_BLOCKED",
  );
  requireCheck(
    Boolean(input.productionOrigin) && input.origin !== input.productionOrigin,
    "PRODUCTION_ORIGIN_BLOCKED",
  );
  validateOrigin(input.origin);
  requireCheck(input.origin === input.expectedOrigin, "ORIGIN_MISMATCH");
}
export function validateRemoteHistory(approved, remote, expectedRemote) {
  // The separately reviewed ledger must be an exact prefix. Missing, extra,
  // divergent or reordered versions stop before db push; never auto-repair.
  requireCheck(
    Array.isArray(remote) && Array.isArray(expectedRemote),
    "MIGRATION_HISTORY_REQUIRED",
  );
  const versions = approved.map((m) => m.filename.slice(0, 14));
  requireCheck(
    JSON.stringify(remote) === JSON.stringify(expectedRemote) &&
      JSON.stringify(remote) ===
        JSON.stringify(versions.slice(0, remote.length)),
    "REMOTE_MIGRATION_DRIFT",
  );
}
const textList = z.array(z.string().min(1)).min(1);
export const scenarioSchema = z.strictObject({
  id: z.enum(SCENARIO_IDS),
  title: z.string().min(1),
  criticality: z.enum(["critical", "required"]),
  prerequisites: textList,
  safeInputs: textList,
  steps: textList,
  expectedLocalOutcome: z.string().min(1),
  expectedProviderOutcome: z.string().min(1),
  requiredEvidence: textList,
  cleanup: textList,
  status: z.enum(["not_run", "pass", "fail", "blocked", "not_applicable"]),
});
export const scenariosSchema = z
  .array(scenarioSchema)
  .refine(
    (v) => v.map((s) => s.id).join() === SCENARIO_IDS.join(),
    "SCENARIO_SET_MISMATCH",
  );
export const rollbackSchema = z
  .array(
    z.strictObject({
      id: z.enum(ROLLBACK_IDS),
      trigger: z.string().min(1),
      owner: z.literal("input:release_owner"),
      prerequisites: textList,
      steps: textList,
      verification: textList,
      preservesCommercialHistory: z.literal(true),
      requiresSeparateAuthorization: z.literal(true),
    }),
  )
  .refine(
    (v) => v.map((s) => s.id).join() === ROLLBACK_IDS.join(),
    "ROLLBACK_INCOMPLETE",
  );

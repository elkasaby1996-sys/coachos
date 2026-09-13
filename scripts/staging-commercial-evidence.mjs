import { z } from "zod";
import { pathToFileURL } from "node:url";
import { writeFileSync } from "node:fs";
import {
  BILLING_FUNCTIONS,
  NONBILLING_FUNCTIONS,
  SCENARIO_IDS,
  digest,
  sha,
  sha256,
  parseSafe,
  requireCheck,
  readJson,
} from "./staging-commercial-contracts.mjs";

export const ASSERTION_CODES = [
  "MIGRATION_HISTORY_MATCH",
  "FUNCTION_DEPLOYED",
  "AUTH_REDIRECT_MATCH",
  "CATALOGUE_MATCH",
  "SUBSCRIPTION_ACTIVE",
  "INVALID_SIGNATURE_REJECTED",
  "REPLAY_IDEMPOTENT",
  "CREATION_RECONCILED",
  "PORTAL_URL_VALIDATED",
  "CANCELLATION_RESUMED",
  "PAYMENT_RECOVERED",
  "PLAN_UPGRADED",
  "PLAN_SCHEDULED",
  "PLAN_SCHEDULE_CANCELLED",
  "SEAT_PAYMENT_APPLIED",
  "SEAT_REDUCTION_SCHEDULED",
  "SEAT_REDUCTION_CANCELLED",
  "ACCESS_FULL",
  "ACCESS_EXISTING_DELIVERY",
  "ACCESS_RECOVERY_ONLY",
  "REDACTION_PASSED",
  "ROLLBACK_VERIFIED",
];
const recordSchema = z
  .strictObject({
    scenarioId: z.enum(SCENARIO_IDS),
    status: z.enum(["not_run", "pass", "fail", "blocked", "not_applicable"]),
    scope: z.enum(["local_fixture", "staging_test"]),
    timestamp: z.iso.datetime(),
    commitSha: sha,
    workflowRunId: z
      .string()
      .regex(/^[0-9]{1,20}$/)
      .optional(),
    functionName: z
      .enum([...BILLING_FUNCTIONS, ...NONBILLING_FUNCTIONS])
      .optional(),
    deployedFunctions: z
      .array(z.enum([...BILLING_FUNCTIONS, ...NONBILLING_FUNCTIONS]))
      .optional(),
    migrationFilename: z
      .string()
      .regex(/^\d{14}_[a-z0-9_]+\.sql$/)
      .optional(),
    errorCode: z
      .enum([
        "PREREQUISITE_MISSING",
        "ASSERTION_FAILED",
        "REMOTE_EXECUTION_FAILED",
        "DRIFT_DETECTED",
      ])
      .optional(),
    identifierHashes: z.array(
      z.strictObject({
        kind: z.enum(["project", "store", "subscription", "customer", "run"]),
        hash: digest,
      }),
    ),
    assertions: z.array(
      z.strictObject({ code: z.enum(ASSERTION_CODES), passed: z.boolean() }),
    ),
  })
  .superRefine((v, ctx) => {
    if (
      v.status === "pass" &&
      (!v.assertions.length || v.assertions.some((a) => !a.passed))
    )
      ctx.addIssue({ code: "custom", message: "PASS_REQUIRES_ASSERTIONS" });
  });
export const evidenceSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    environment: z.literal("staging"),
    providerEnvironment: z.literal("test"),
    commitSha: sha,
    fullUnitSuiteGreen: z.boolean(),
    records: z.array(recordSchema),
  })
  .superRefine((v, ctx) => {
    if (
      new Set(v.records.map((r) => r.scenarioId)).size !== v.records.length ||
      v.records.some((r) => r.commitSha !== v.commitSha)
    )
      ctx.addIssue({ code: "custom", message: "EVIDENCE_IDENTITY_MISMATCH" });
  });
const sensitiveKey =
  /authorization|cookie|api.?key|password|secret|token|signature|raw|payload|body|email|address|card|payment.details|customer.name|service.role|provider.object/i;
const identifierKey =
  /^(?:provider|store|variant|price|product|customer|subscription|project)[_-]?id$|^projectRef$/i;
const unsafeString =
  /https?:\/\/|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+|\bBearer\s+\S+|\b(?:authorization|cookie|x-signature|apikey)\s*[:=]|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}|\b(?:sub|cus|var|pri|prod)_[A-Za-z0-9]+/i;
export function scanRedaction(value) {
  const codes = new Set();
  function visit(item) {
    if (typeof item === "string" && unsafeString.test(item))
      codes.add("SENSITIVE_TEXT");
    else if (Array.isArray(item)) item.forEach(visit);
    else if (item && typeof item === "object")
      for (const [key, v] of Object.entries(item)) {
        if (sensitiveKey.test(key) || identifierKey.test(key))
          codes.add("SENSITIVE_FIELD");
        visit(v);
      }
  }
  visit(value);
  return [...codes]; // Never echo untrusted keys, paths or values.
}
export function redact(value, privateRunSalt) {
  requireCheck(
    typeof privateRunSalt === "string" && privateRunSalt.length >= 32,
    "PRIVATE_SALT_REQUIRED",
  );
  if (typeof value === "string")
    return unsafeString.test(value) ? "[REDACTED]" : value;
  if (Array.isArray(value)) return value.map((v) => redact(v, privateRunSalt));
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) =>
        identifierKey.test(k)
          ? ["redactedIdentifier", sha256(`${privateRunSalt}\n${v}`)]
          : sensitiveKey.test(k)
            ? ["redactedField", "[REDACTED]"]
            : [k, redact(v, privateRunSalt)],
      ),
    );
  return value;
}
export function validateEvidence(value) {
  requireCheck(scanRedaction(value).length === 0, "EVIDENCE_REDACTION_FAILED");
  return parseSafe(evidenceSchema, value, "EVIDENCE_INVALID");
}
export function verdict(input) {
  const value = validateEvidence(input);
  if (
    !value.fullUnitSuiteGreen ||
    SCENARIO_IDS.some(
      (id) => !value.records.some((r) => r.scenarioId === id),
    ) ||
    value.records.some((r) => ["fail", "blocked", "not_run"].includes(r.status))
  )
    return "blocked";
  if (
    value.records.some(
      (r) => r.status === "not_applicable" || r.scope !== "staging_test",
    )
  )
    return "conditional";
  // Every scenario has a specific assertion; an unrelated assertion cannot certify it.
  if (
    value.records.some(
      (r) =>
        !r.assertions.some(
          (a) =>
            a.code ===
              ASSERTION_CODES[
                SCENARIO_IDS.indexOf(r.scenarioId) === 5
                  ? 4
                  : SCENARIO_IDS.indexOf(r.scenarioId) > 5
                    ? SCENARIO_IDS.indexOf(r.scenarioId) - 1
                    : SCENARIO_IDS.indexOf(r.scenarioId)
              ] && a.passed,
        ),
    )
  )
    return "blocked";
  return "pass";
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    const value = validateEvidence(
      readJson(
        process.argv[2] ?? "config/staging-commercial-evidence.template.json",
      ),
    );
    const result = { verdict: verdict(value), evidence: value };
    if (process.argv[3])
      writeFileSync(process.argv[3], JSON.stringify(result, null, 2) + "\n");
    console.log(
      JSON.stringify({
        verdict: result.verdict,
        records: value.records.length,
      }),
    );
    if (result.verdict !== "pass") process.exitCode = 1;
  } catch {
    console.error("EVIDENCE_VALIDATION_FAILED");
    process.exitCode = 1;
  }
}

import { z } from "zod";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  FUNCTION_CONTRACTS,
  RETIREMENT_MIGRATION,
  ACTIVATION_MIGRATION,
  ACTIVATION_SHA,
  RETIREMENT_SHA,
} from "./billing-deployment-contract.mjs";

const sha = z.string().regex(/^[a-f0-9]{40}$/);
const digest = z.string().regex(/^[a-f0-9]{64}$/);
export const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const fail = (code) => {
  throw new Error(code);
};
export const retirementEvidenceSchema = z.strictObject({
  environment: z.enum(["staging", "production"]),
  providerMode: z.enum(["sandbox", "disabled"]),
  observedAt: z.iso.datetime(),
  inventorySha256: digest,
  functionArtifactSha256: digest,
  expectedPendingMigrations: z
    .array(z.enum([RETIREMENT_MIGRATION, ACTIVATION_MIGRATION]))
    .max(2),
  backupCreatedAt: z.iso.datetime(),
  backupEnvironment: z.enum(["staging", "production"]),
  backupCommitSha: sha,
  backupProjectSha256: digest,
  backupRestoreProofSha256: digest,
  classificationEvidenceSha256: digest,
  classificationResult: z.enum(["synthetic_only", "zero_obligation"]),
  schemaDriftReviewed: z.literal(true),
  paddleSalesDisabled: z.literal(true),
  paddleReconciliationDisabled: z.literal(true),
  checkoutAccessMode: z.literal("disabled"),
});
export function functionArtifactDigest(root) {
  const walk = (directory) =>
    readdirSync(join(root, directory), { withFileTypes: true }).flatMap(
      (entry) => {
        const relative = `${directory}/${entry.name}`;
        if (entry.name.startsWith(".") || entry.name === "node_modules")
          return [];
        return entry.isDirectory()
          ? walk(relative)
          : /\.(?:tsx?|jsx?|json|toml)$/.test(relative)
            ? [
                {
                  path: relative,
                  sha256: hash(
                    readFileSync(join(root, relative), "utf8").replace(
                      /\r\n/g,
                      "\n",
                    ),
                  ),
                },
              ]
            : [];
      },
    );
  return hash(
    JSON.stringify(
      walk("supabase/functions").sort((a, b) => a.path.localeCompare(b.path)),
    ),
  );
}
export function validateRetirementEvidence(
  raw,
  {
    environment,
    commit,
    project,
    approvedRemoteVersions,
    manifest,
    functionArtifactSha256,
  },
  now = Date.now(),
) {
  const result = retirementEvidenceSchema.safeParse(raw);
  if (!result.success) fail("RETIREMENT_EVIDENCE_INVALID");
  const e = result.data;
  const age = (timestamp) => now - Date.parse(timestamp);
  if (
    e.environment !== environment ||
    e.backupEnvironment !== environment ||
    e.providerMode !== (environment === "staging" ? "sandbox" : "disabled") ||
    e.classificationResult !==
      (environment === "staging" ? "synthetic_only" : "zero_obligation") ||
    e.backupCommitSha !== commit ||
    e.backupProjectSha256 !== hash(project) ||
    e.functionArtifactSha256 !== functionArtifactSha256
  )
    fail("RETIREMENT_ENVIRONMENT_BINDING_MISMATCH");
  if (
    age(e.observedAt) < 0 ||
    age(e.observedAt) > 15 * 60_000 ||
    age(e.backupCreatedAt) < 0 ||
    age(e.backupCreatedAt) > 24 * 60 * 60_000
  )
    fail("RETIREMENT_EVIDENCE_STALE");
  const versions = manifest.migrations.approved.map((m) =>
    m.filename.slice(0, 14),
  );
  if (
    versions.length !== 186 ||
    manifest.migrations.approved[184].sha256 !== RETIREMENT_SHA ||
    manifest.migrations.approved[185].sha256 !== ACTIVATION_SHA ||
    ![184, 185, 186].includes(approvedRemoteVersions.length) ||
    JSON.stringify(approvedRemoteVersions) !==
      JSON.stringify(versions.slice(0, approvedRemoteVersions.length)) ||
    JSON.stringify(e.expectedPendingMigrations) !==
      JSON.stringify(
        manifest.migrations.approved
          .slice(approvedRemoteVersions.length)
          .map((m) => m.filename),
      )
  )
    fail("RETIREMENT_PENDING_MIGRATIONS_MISMATCH");
  return e;
}
export function validateDryRun(output, expected) {
  // Pinned CLI output is private. Parse only complete SQL filenames; never echo it.
  if (typeof output !== "string") fail("RETIREMENT_DRY_RUN_MISMATCH");
  const files = [...new Set(output.match(/\b\d{14}_[a-z0-9_]+\.sql\b/g) ?? [])];
  if (
    JSON.stringify(files) !== JSON.stringify(expected) ||
    (expected.length === 0 &&
      !/up to date|no (?:pending |new )?migrations/i.test(output))
  )
    fail("RETIREMENT_DRY_RUN_MISMATCH");
}
export function assertFunctionInventory(functions, after = false) {
  if (
    !Array.isArray(functions) ||
    new Set(functions.map((f) => f.name)).size !== functions.length
  )
    fail("RETIREMENT_FUNCTION_INVENTORY_INVALID");
  for (const item of functions) {
    if (
      typeof item.name !== "string" ||
      !/^[a-z0-9-]+$/.test(item.name) ||
      typeof item.verify_jwt !== "boolean" ||
      !Number.isInteger(item.version) ||
      item.version < 1
    )
      fail("RETIREMENT_FUNCTION_INVENTORY_INVALID");
    if (
      /billing|lemon|squeezy|portal/.test(item.name) &&
      !FUNCTION_CONTRACTS.some((f) => f.name === item.name)
    )
      fail("UNEXPECTED_REMOTE_BILLING_FUNCTION");
  }
  if (after)
    for (const contract of FUNCTION_CONTRACTS) {
      if (
        !functions.some(
          (f) =>
            f.name === contract.name && f.verify_jwt === contract.verifyJwt,
        )
      )
        fail("RETIREMENT_DEPLOYED_FUNCTION_CONTRACT_MISMATCH");
    }
}
export function assertRetiredDatabaseAuthority(functions, signatures) {
  if (!Array.isArray(functions) || signatures.length !== 28)
    fail("RETIREMENT_DATABASE_AUTHORITY_INVALID");
  const normalize = (value) =>
    value
      .replace(/^public\./, "")
      .replace(/timestamp with time zone/g, "timestamptz")
      .replace(/\s/g, "");
  const native = new Set(signatures.map(normalize));
  const names = new Set([...native].map((s) => s.split("(")[0]));
  const definitions = new Map();
  for (const f of functions) {
    if (
      typeof f.signature !== "string" ||
      typeof f.definition !== "string" ||
      typeof f.applicationExecutable !== "boolean" ||
      typeof f.publicExecutable !== "boolean"
    )
      fail("RETIREMENT_DATABASE_AUTHORITY_INVALID");
    const signature = normalize(f.signature),
      name = signature.split("(")[0];
    if (
      native.has(signature) &&
      (f.applicationExecutable || f.publicExecutable)
    )
      fail("LS_DATABASE_AUTHORITY_PRESENT");
    if (name === "inspect_lemon_squeezy_retirement_disposition_v1")
      fail("FORENSIC_CLASSIFIER_PRESENT");
    const calls = [
      ...f.definition.matchAll(/\b(?:public\.)?([a-z_][a-z_0-9]*)\s*\(/gi),
    ].map((m) => m[1].toLowerCase());
    const prior = definitions.get(name) ?? {
      calls: new Set(),
      accessible: false,
    };
    calls.forEach((c) => prior.calls.add(c));
    prior.accessible ||= f.applicationExecutable || f.publicExecutable;
    definitions.set(name, prior);
  }
  if (
    [...native].some(
      (s) => !functions.some((f) => normalize(f.signature) === s),
    )
  )
    fail("RETIREMENT_DATABASE_AUTHORITY_INVALID");
  for (const [name, definition] of definitions)
    if (definition.accessible) {
      const queue = [name],
        seen = new Set();
      while (queue.length) {
        const current = queue.pop();
        if (seen.has(current)) continue;
        seen.add(current);
        if (names.has(current)) fail("INDIRECT_LS_DATABASE_AUTHORITY_PRESENT");
        queue.push(...(definitions.get(current)?.calls ?? []));
      }
    }
}
export function assertOverwriteVersions(before, after) {
  for (const f of FUNCTION_CONTRACTS) {
    const previous = before.find((v) => v.name === f.name),
      current = after.find((v) => v.name === f.name);
    if (!current || (previous && current.version <= previous.version))
      fail("RETIREMENT_FUNCTION_OVERWRITE_NOT_PROVEN");
  }
}

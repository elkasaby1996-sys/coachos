// Compatibility with the exact installed staging baseline inspected in runs
// 42702256586 and 42707688666. No grants or schema objects are changed here.
import { databaseContract } from "./staging-release-observation.mjs";
import { verifySchemaReference } from "./staging-schema-diagnostics.mjs";
import { STAGING_PROJECT } from "./staging-billing-status.mjs";

export const REVIEWED_STAGING_SCHEMA =
  "6aa4239a1d821543e7cd762e09223b1247061c193d5e9ab4333eb6e38f9c1ab5";
export const PRESERVED_GRANT_TABLES = Object.freeze([
  "_archive_workout_log_items",
  "_archive_workout_template_items",
  "notification_preferences",
  "notifications",
]);
const qualifiedConstraints = new Set([
  "billing_catalogue_evidence_v1_check1",
  "billing_paddle_event_observations_check",
  "billing_verified_evidence_v2_check7",
]);
const requireSchema = (condition) => {
  if (!condition) throw new Error("UPGRADE_DATABASE_SCHEMA_NOT_REVIEWED");
};

function qualifySource(facts) {
  const copy = structuredClone(facts);
  for (const column of copy.schema.columns)
    if (column.default === "uuid_generate_v4()")
      column.default = "extensions.uuid_generate_v4()";
  for (const constraint of copy.schema.constraints)
    if (qualifiedConstraints.has(constraint.name))
      constraint.definition = constraint.definition.replaceAll(
        "digest(",
        "extensions.digest(",
      );
  return copy;
}

function normalizeRendering(observed, expected) {
  const result = structuredClone(observed);
  for (const column of result.schema.columns) {
    const source = expected.schema.columns.find(
      (item) => item.table === column.table && item.column === column.column,
    );
    if (
      source?.default === "uuid_generate_v4()" &&
      column.default === "extensions.uuid_generate_v4()"
    )
      column.default = source.default;
  }
  for (const constraint of result.schema.constraints) {
    const source = expected.schema.constraints.find(
      (item) =>
        item.table === constraint.table && item.name === constraint.name,
    );
    if (
      source &&
      qualifiedConstraints.has(source.name) &&
      constraint.definition ===
        source.definition.replaceAll("digest(", "extensions.digest(")
    )
      constraint.definition = source.definition;
  }
  return result;
}

export function verifyUpgradeSchema(
  facts,
  reference,
  identity,
  checkpoints,
  project,
) {
  requireSchema(project === STAGING_PROJECT);
  const count = facts?.versions?.length;
  const expected = verifySchemaReference(
    reference,
    identity,
    checkpoints,
    count,
  );
  requireSchema(
    JSON.stringify(facts.versions) === JSON.stringify(expected.versions),
  );
  const normalized = normalizeRendering(facts, expected);
  const expectedDigest = databaseContract(expected);
  let profile = "canonical";
  if (databaseContract(normalized) !== expectedDigest) {
    // Reconstruct the reviewed 180 baseline using just these four CURRENT ACLs.
    // Its full digest must equal the recorded hosted baseline. This does not
    // accept arbitrary ACL differences or dynamically enroll a changed target.
    const baseline = qualifySource(
      verifySchemaReference(reference, identity, checkpoints, 180),
    );
    for (const name of PRESERVED_GRANT_TABLES) {
      const actual = normalized.tables.find((table) => table.name === name);
      const original = baseline.tables.find((table) => table.name === name);
      const source = expected.tables.find((table) => table.name === name);
      requireSchema(actual && original && source);
      original.acl = actual.acl;
      actual.acl = source.acl;
    }
    requireSchema(databaseContract(baseline) === REVIEWED_STAGING_SCHEMA);
    requireSchema(databaseContract(normalized) === expectedDigest);
    profile = "reviewed_staging_180_grants_preserved";
  }
  return {
    profile,
    count,
    canonicalDigest: expectedDigest,
    observedDigest: databaseContract(facts),
    // Private backup/verification data, never spread into a public report.
    grants: Object.fromEntries(
      PRESERVED_GRANT_TABLES.map((name) => [
        name,
        facts.tables.find((table) => table.name === name).acl,
      ]),
    ),
  };
}

export function safeSchemaResult(result) {
  return {
    profile: result.profile,
    count: result.count,
    canonicalDigest: result.canonicalDigest,
    observedDigest: result.observedDigest,
    preservedGrantTables: PRESERVED_GRANT_TABLES,
  };
}

const permissions = {
  a: "INSERT",
  r: "SELECT",
  w: "UPDATE",
  d: "DELETE",
  D: "TRUNCATE",
  x: "REFERENCES",
  t: "TRIGGER",
  m: "MAINTAIN",
};
export function restoreLocalGrantSql(grants) {
  const statements = [];
  for (const table of PRESERVED_GRANT_TABLES) {
    const acl = grants[table];
    requireSchema(typeof acl === "string" && /^\{.*\}$/.test(acl));
    const seen = new Set();
    const entries = acl
      .slice(1, -1)
      .split(",")
      .map((entry) => {
        const match =
          /^(postgres|anon|authenticated|service_role)=([arwdDxtm]+)\/postgres$/.exec(
            entry,
          );
        requireSchema(
          match &&
            !seen.has(match[1]) &&
            new Set(match[2]).size === match[2].length,
        );
        seen.add(match[1]);
        return {
          role: match[1],
          privileges: [...match[2]].map((key) => permissions[key]),
        };
      });
    statements.push(
      `revoke all on table public."${table}" from public,postgres,anon,authenticated,service_role;`,
    );
    for (const entry of entries)
      statements.push(
        `grant ${entry.privileges.join(",")} on table public."${table}" to "${entry.role}";`,
      );
  }
  return statements.join("\n");
}

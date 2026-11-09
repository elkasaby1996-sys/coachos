// Diagnostic comparison only. The existing exact database checkpoint remains
// authoritative; names come from the local source and values are never reported.
import { databaseContract } from "./staging-release-observation.mjs";
import { hash } from "./billing-retirement-release.mjs";

const check = (condition) => {
  if (!condition) throw new Error("UPGRADE_SCHEMA_REFERENCE_INVALID");
};
const fields = {
  functions: ["definition", "applicationExecutable", "publicExecutable", "acl"],
  tables: ["acl", "rls"],
  columns: ["type", "notNull", "default"],
  constraints: ["definition"],
  indexes: ["definition"],
  triggers: ["definition", "enabled"],
  policies: ["permissive", "roles", "cmd", "qual", "with_check"],
};
const digest = (value) => hash(JSON.stringify(value));

function objectName(kind, row) {
  if (kind === "functions") return row.signature.replace(/^public\./, "");
  if (kind === "tables") return row.name;
  if (kind === "columns") return `${row.table}.${row.column}`;
  if (kind === "constraints") return `${row.table}.${row.name}`;
  if (kind === "policies") return `${row.tablename}.${row.policyname}`;
  // PostgreSQL emits a quoted identifier only when required. These names are
  // comparison keys, never SQL or output from an unrecognized remote object.
  const match = row.definition.match(
    kind === "indexes"
      ? /^CREATE (?:UNIQUE )?INDEX ("(?:[^"]|"")+"|\S+) ON /i
      : /^CREATE (?:CONSTRAINT )?TRIGGER ("(?:[^"]|"")+"|\S+) /i,
  );
  check(match);
  return `${row.table}.${match[1]}`;
}

function objects(facts, kind) {
  const rows = facts[kind] ?? facts.schema?.[kind];
  check(Array.isArray(rows));
  const entries = rows.map((row) => {
    const name = objectName(kind, row);
    check(typeof name === "string" && name.length > 0);
    const value = Object.fromEntries(
      fields[kind].map((field) => {
        check(Object.hasOwn(row, field));
        return [
          field,
          kind === "functions" && field === "definition"
            ? row[field].replace(/\r\n/g, "\n")
            : row[field],
        ];
      }),
    );
    return [name, value];
  });
  check(new Set(entries.map(([name]) => name)).size === entries.length);
  return new Map(entries);
}

export function verifySchemaReference(reference, identity, checkpoints, count) {
  check(
    Number.isSafeInteger(count) &&
      count >= 180 &&
      count <= 188 &&
      reference?.schemaVersion === 1 &&
      reference.frozenPayloadCommit === identity.payload.frozenCommit &&
      reference.manifestDigest === digest(identity.manifest) &&
      checkpoints.frozenPayloadCommit === reference.frozenPayloadCommit &&
      checkpoints.manifestDigest === reference.manifestDigest,
  );
  const facts = reference.checkpoints?.[String(count)];
  check(
    facts &&
      JSON.stringify(facts.versions) ===
        JSON.stringify(
          identity.manifest.migrations.approved
            .slice(0, count)
            .map((m) => m.filename.slice(0, 14)),
        ) &&
      databaseContract(facts) ===
        checkpoints.checkpoints[String(count)]?.digest,
  );
  return facts;
}

export function compareSchemaObjects(expected, observed, limit = 200) {
  check(Number.isSafeInteger(limit) && limit >= 1 && limit <= 200);
  const changes = [];
  const sections = {};
  let total = 0;
  for (const kind of Object.keys(fields)) {
    const before = objects(expected, kind),
      after = objects(observed, kind);
    const summary = { changed: 0, missing: 0, added: 0, orderChanged: false };
    const record = (change) => {
      total++;
      if (changes.length < limit) changes.push({ kind, ...change });
    };
    for (const [name, value] of before) {
      if (!after.has(name)) {
        summary.missing++;
        record({ object: name, change: "missing" });
        continue;
      }
      const different = fields[kind].filter(
        (field) => digest(value[field]) !== digest(after.get(name)[field]),
      );
      if (different.length) {
        summary.changed++;
        record({ object: name, change: "changed", fields: different });
      }
    }
    for (const name of after.keys()) {
      if (!before.has(name)) {
        summary.added++;
        // A remote identifier may itself contain private data or annotation
        // control characters. Unknown identifiers are represented by a hash.
        record({ objectSha256: hash(name), change: "added" });
      }
    }
    // The database contract sorts functions/tables, but retains schema order.
    summary.orderChanged =
      !["functions", "tables"].includes(kind) &&
      summary.missing === 0 &&
      summary.added === 0 &&
      JSON.stringify([...before.keys()]) !== JSON.stringify([...after.keys()]);
    sections[kind] = summary;
  }
  return {
    status: "compared",
    exactMatch: databaseContract(expected) === databaseContract(observed),
    changedObjectCount: total,
    sections,
    changes,
    truncated: total > changes.length,
  };
}

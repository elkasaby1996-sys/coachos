import { describe, expect, it } from "vitest";
import {
  compareSchemaObjects,
  verifySchemaReference,
} from "../../scripts/staging-schema-diagnostics.mjs";
import { localReferenceEnvironment } from "../../scripts/staging-schema-reference.mjs";
import { databaseContract } from "../../scripts/staging-release-observation.mjs";
import { hash } from "../../scripts/billing-retirement-release.mjs";

const privateValue = "private-definition-or-row-value";
function facts() {
  return {
    versions: Array.from({ length: 180 }, (_, i) => String(20260000000000 + i)),
    functions: [
      {
        signature: "public.example(uuid)",
        definition: "CREATE FUNCTION example ...",
        applicationExecutable: false,
        publicExecutable: false,
        acl: null,
      },
    ],
    tables: [{ name: "example", acl: null, rls: true }],
    schema: {
      columns: [
        {
          table: "example",
          column: "id",
          type: "uuid",
          notNull: true,
          default: null,
        },
        {
          table: "example",
          column: "other",
          type: "text",
          notNull: false,
          default: null,
        },
      ],
      constraints: [
        {
          table: "example",
          name: "example_pkey",
          definition: "PRIMARY KEY (id)",
        },
      ],
      indexes: [
        {
          table: "example",
          definition:
            "CREATE UNIQUE INDEX example_pkey ON public.example USING btree (id)",
        },
      ],
      triggers: [
        {
          table: "example",
          definition:
            "CREATE TRIGGER on_update BEFORE UPDATE ON public.example FOR EACH ROW EXECUTE FUNCTION example()",
          enabled: "O",
        },
      ],
      policies: [
        {
          schemaname: "public",
          tablename: "example",
          policyname: "only_owner",
          permissive: "PERMISSIVE",
          roles: ["authenticated"],
          cmd: "SELECT",
          qual: "owner_id = auth.uid()",
          with_check: null,
        },
      ],
    },
  };
}

describe("source-bound schema diagnosis without publishing remote definitions", () => {
  it("compares identical schemas and retains the exact checkpoint result", () => {
    const expected = facts();
    expect(
      compareSchemaObjects(expected, structuredClone(expected)),
    ).toMatchObject({
      status: "compared",
      exactMatch: true,
      changedObjectCount: 0,
      changes: [],
      truncated: false,
    });
  });
  it.each([
    ["functions", "definition"],
    ["functions", "acl"],
    ["functions", "applicationExecutable"],
    ["functions", "publicExecutable"],
    ["tables", "acl"],
    ["tables", "rls"],
    ["columns", "type"],
    ["columns", "default"],
    ["columns", "notNull"],
    ["constraints", "definition"],
    ["indexes", "definition"],
    ["triggers", "definition"],
    ["triggers", "enabled"],
    ["policies", "roles"],
    ["policies", "qual"],
    ["policies", "with_check"],
    ["policies", "cmd"],
    ["policies", "permissive"],
  ])(
    "identifies changed %s.%s without exposing either value",
    (kind, field) => {
      const expected = facts(),
        observed: any = structuredClone(expected);
      const row = (observed[kind] ?? observed.schema[kind])[0];
      row[field] =
        ["indexes", "triggers"].includes(kind) && field === "definition"
          ? `${row[field]} ${privateValue}`
          : privateValue;
      const result = compareSchemaObjects(expected, observed);
      expect(result.exactMatch).toBe(false);
      expect(result.changedObjectCount).toBe(1);
      expect(result.changes[0]).toMatchObject({
        kind,
        change: "changed",
        fields: [field],
      });
      expect(JSON.stringify(result)).not.toContain(privateValue);
    },
  );
  it("shows source names for missing objects and only hashes unknown remote names", () => {
    const expected = facts(),
      observed = structuredClone(expected);
    observed.tables[0].name = `secret\n::error::${privateValue}`;
    const result = compareSchemaObjects(expected, observed);
    expect(result.changes).toEqual([
      { kind: "tables", object: "example", change: "missing" },
      {
        kind: "tables",
        objectSha256: hash(observed.tables[0].name),
        change: "added",
      },
    ]);
    expect(JSON.stringify(result)).not.toContain(privateValue);
    expect(JSON.stringify(result)).not.toContain("::error::");
  });
  it("distinguishes schema ordering from altered objects without accepting a different checkpoint", () => {
    const expected = facts(),
      observed = structuredClone(expected);
    observed.schema.columns.reverse();
    expect(compareSchemaObjects(expected, observed)).toMatchObject({
      exactMatch: false,
      changedObjectCount: 0,
      sections: { columns: { orderChanged: true } },
    });
  });
  it("recognizes quoted index/trigger names without exposing new definitions", () => {
    const expected = facts();
    expected.schema.indexes[0].definition =
      'CREATE UNIQUE INDEX "key with spaces" ON public.example USING btree (id)';
    expected.schema.triggers[0].definition =
      'CREATE CONSTRAINT TRIGGER "trigger with spaces" AFTER UPDATE ON public.example FOR EACH ROW EXECUTE FUNCTION example()';
    const observed = structuredClone(expected);
    observed.schema.indexes[0].definition += privateValue;
    observed.schema.triggers[0].enabled = "D";
    expect(
      compareSchemaObjects(expected, observed).changes.map(
        (row: any) => row.object,
      ),
    ).toEqual(['example."key with spaces"', 'example."trigger with spaces"']);
  });
  it("counts all differences when diagnostic output is capped", () => {
    const expected = facts(),
      observed = structuredClone(expected);
    observed.tables = [];
    observed.functions = [];
    expect(compareSchemaObjects(expected, observed, 1)).toMatchObject({
      changedObjectCount: 2,
      truncated: true,
      changes: [
        { kind: "functions", object: "example(uuid)", change: "missing" },
      ],
    });
  });
  it("rejects duplicate object identities instead of hiding a difference", () => {
    const expected = facts(),
      observed = structuredClone(expected);
    observed.functions.push(observed.functions[0]);
    expect(() => compareSchemaObjects(expected, observed)).toThrow(
      "UPGRADE_SCHEMA_REFERENCE_INVALID",
    );
  });
  function referenceFixture() {
    const schema = facts();
    const identity = {
      payload: { frozenCommit: "a".repeat(40) },
      manifest: {
        migrations: {
          approved: schema.versions.map((v) => ({ filename: `${v}_test.sql` })),
        },
      },
    };
    const reference = {
      schemaVersion: 1,
      frozenPayloadCommit: identity.payload.frozenCommit,
      manifestDigest: hash(JSON.stringify(identity.manifest)),
      checkpoints: { "180": schema },
    };
    const checkpoints = {
      frozenPayloadCommit: reference.frozenPayloadCommit,
      manifestDigest: reference.manifestDigest,
      checkpoints: { "180": { digest: databaseContract(schema) } },
    };
    return { schema, identity, reference, checkpoints };
  }
  it("verifies the full reference against frozen source and the installed checkpoint", () => {
    const f = referenceFixture();
    expect(
      verifySchemaReference(f.reference, f.identity, f.checkpoints, 180),
    ).toEqual(f.schema);
  });
  it.each(["payload", "manifest", "schema", "ledger", "checkpoint"])(
    "rejects a tampered %s reference",
    (kind) => {
      const f = referenceFixture();
      if (kind === "payload") f.reference.frozenPayloadCommit = "b".repeat(40);
      if (kind === "manifest") f.reference.manifestDigest = "b".repeat(64);
      if (kind === "schema") f.schema.tables[0].rls = false;
      if (kind === "ledger") f.schema.versions.reverse();
      if (kind === "checkpoint")
        f.checkpoints.checkpoints["180"].digest = "b".repeat(64);
      expect(() =>
        verifySchemaReference(f.reference, f.identity, f.checkpoints, 180),
      ).toThrow("UPGRADE_SCHEMA_REFERENCE_INVALID");
    },
  );
  it("strips hosted credentials and remote Docker/database routing from local reconstruction", () => {
    const env = localReferenceEnvironment({
      PATH: "/bin",
      HOME: "/home/local",
      HTTPS_PROXY: "http://proxy.local",
      SUPABASE_ACCESS_TOKEN: privateValue,
      SUPABASE_DB_PASSWORD: privateValue,
      SUPABASE_PROJECT_REF: privateValue,
      ALLOW_REMOTE_SUPABASE: privateValue,
      PGHOST: privateValue,
      PGHOSTADDR: privateValue,
      PGSERVICE: privateValue,
      PGSERVICEFILE: privateValue,
      DOCKER_HOST: privateValue,
      DOCKER_CONTEXT: privateValue,
      SUPABASE_API_URL: privateValue,
    });
    expect(env.PATH).toBe("/bin");
    expect(env.HTTPS_PROXY).toBe("http://proxy.local");
    expect(env.DOCKER_HOST).toBe("unix:///var/run/docker.sock");
    expect(JSON.stringify(env)).not.toContain(privateValue);
  });
});

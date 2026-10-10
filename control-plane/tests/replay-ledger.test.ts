import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  DisposablePostgres,
  rejectDatabaseUrl,
  TEST_IMAGE,
} from "./disposable-postgres.mjs";
import {
  fixture,
  SyntheticAuthority,
  operation,
  jsonSql,
  literal,
} from "./synthetic-authority";
import { createReplayLedger, verifyAuditChain } from "../src/replay-ledger.mjs";
import {
  digestV2,
  validateReferenceGraphV2,
  validateSignedV2,
} from "../../scripts/staging-founder-authorization-v2.mjs";
import { stampV2 } from "../../tests/helpers/staging-founder-v2-fixture";

let db: DisposablePostgres, authority: SyntheticAuthority;
beforeAll(async () => {
  // Warm frozen identity outside individual deadlines; uses no credentials.
  fixture();
  db = new DisposablePostgres();
  await db.start();
});
afterAll(() => db?.close());
beforeEach(() => {
  db.resetData();
  authority = new SyntheticAuthority(db);
});
const identity = (f: any) => {
  authority.install(f);
  return authority.repository();
};
const count = (table: string) =>
  Number(db.admin(`SELECT count(*) FROM ledger_private.${table};`));
const command = {
  sequence: 1,
  commandDigest: "a".repeat(64),
  artifactDigest: "b".repeat(64),
};
const writer = (run = "1", nonce?: string) =>
  fixture(
    { kind: "PREPARE_INITIAL_NONBILLING_184", mode: "apply" },
    run,
    nonce,
  );

const epochActions = ["claim", "retention", "running", "reserve"] as const;
async function epochAction(kind: (typeof epochActions)[number]) {
  const f = writer();
  const repo = identity(f);
  const p = authority.permit(f, [command]);
  if (kind === "claim") {
    const binding = JSON.parse(
      db.admin(
        `SELECT binding FROM ledger_private.admission_permits WHERE permit_id=${literal(p.permitId)};`,
      ),
    );
    return `ledger_api.claim(${jsonSql({ permitId: p.permitId, binding, authority: authority.head })})`;
  }
  await repo.claim(p, f.context);
  if (kind !== "retention")
    await repo.advance(authority.transition(f, "RETENTION_CONFIRMED", 0));
  if (kind === "reserve") {
    await repo.advance(authority.transition(f, "RUNNING", 1));
    return `ledger_api.reserve_command(${jsonSql({ ...operation(f), ...command, authority: authority.head })})`;
  }
  const nextState = kind === "retention" ? "RETENTION_CONFIRMED" : "RUNNING";
  const t = authority.transition(f, nextState, kind === "retention" ? 0 : 1);
  const proof = validateReferenceGraphV2(f.graph, f.context);
  return `ledger_api.advance(${jsonSql({ ...operation(f), authority: authority.head, permitId: t.permitId, nextState, retentionAckDigest: proof.retentionAckDigest, verifiedPackageDigest: digestV2(f.graph.retention) })})`;
}

// Assert a server-observed barrier, not a guessed delay. All sessions belong to
// this disposable database; termination releases only the synthetic gate owner.
async function waitForSession(name: string, predicate: string) {
  const until = Date.now() + 2_000;
  while (Date.now() < until) {
    if (
      db.admin(
        `SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() AND application_name=${literal(name)} AND ${predicate};`,
      ) === "1"
    )
      return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("LEDGER_TEST_BARRIER_NOT_REACHED");
}
async function snapshotGate() {
  const name = `epoch_gate_${randomUUID()}`;
  const key = Math.floor(Math.random() * 2_000_000_000);
  const holder = db
    .sql(
      `SET application_name=${literal(name)}; SELECT pg_advisory_lock(${key}); SELECT pg_sleep(8);`,
      "postgres",
    )
    .catch(() => undefined);
  const release = async () => {
    db.admin(
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=current_database() AND application_name=${literal(name)};`,
    );
    await holder;
  };
  try {
    await waitForSession(name, "wait_event='PgSleep'");
    return { key, release };
  } catch (error) {
    await release();
    throw error;
  }
}
const ledgerEffects = () =>
  db.admin(
    [
      "consumptions",
      "operation_states",
      "target_ownership",
      "command_reservations",
      "audit_events",
    ]
      .map(
        (table) =>
          `SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]'::jsonb) FROM ledger_private.${table} t;`,
      )
      .join("\n"),
  );

describe.each(["READ COMMITTED", "REPEATABLE READ", "SERIALIZABLE"])(
  "epoch revocation at %s",
  (isolation) => {
    it.each(epochActions)("preserves valid %s authority", async (kind) => {
      const call = await epochAction(kind);
      const result = JSON.parse(
        await db.sql(
          `BEGIN ISOLATION LEVEL ${isolation}; SELECT ${call}; COMMIT;`,
        ),
      );
      expect(result).toMatchObject({
        operational: false,
        executionEligible: false,
      });
      expect(result.state ?? result.reserved).toBe(
        {
          claim: "CLAIMED_PENDING_RETENTION",
          retention: "RETENTION_CONFIRMED",
          running: "RUNNING",
          reserve: true,
        }[kind],
      );
    });
    it.each(epochActions)(
      "rejects %s after revocation of its transaction snapshot",
      async (kind) => {
        const call = await epochAction(kind);
        const before = ledgerEffects();
        const gate = await snapshotGate();
        const name = `epoch_reader_${randomUUID()}`;
        // The test-only exception maps precisely SQLSTATE 40001, rather than
        // accepting any generic database failure as evidence of this correction.
        const pending = db
          .sql(
            `BEGIN ISOLATION LEVEL ${isolation}; SET LOCAL application_name=${literal(name)}; SELECT txid_current_snapshot(); SELECT pg_advisory_xact_lock(${gate.key}); DO $probe$ BEGIN PERFORM ${call}; EXCEPTION WHEN serialization_failure THEN RAISE EXCEPTION 'LEDGER_TEST_SERIALIZATION_REJECTED'; END $probe$; COMMIT;`,
          )
          .then(
            () => "ACCEPTED",
            (error) => error.message,
          );
        try {
          await waitForSession(
            name,
            "wait_event_type='Lock' AND wait_event='advisory'",
          );
          db.admin("UPDATE ledger_private.epochs SET revoked=true;");
        } finally {
          await gate.release();
        }
        expect(await pending).toBe(
          isolation === "READ COMMITTED"
            ? "LEDGER_EPOCH_REJECTED"
            : "LEDGER_TEST_SERIALIZATION_REJECTED",
        );
        expect(ledgerEffects()).toEqual(before);
        await expect(db.sql(`SELECT ${call};`)).rejects.toThrow(
          "LEDGER_EPOCH_REJECTED",
        );
      },
    );
  },
);

it("holds the epoch against revocation until the protected transaction ends", async () => {
  const call = await epochAction("reserve");
  const before = ledgerEffects();
  const gate = await snapshotGate();
  const reader = `epoch_owner_${randomUUID()}`;
  const revoker = `epoch_revoker_${randomUUID()}`;
  // Roll back after observing the blocking relation, proving no reservation or
  // audit survives the aborted transaction and revocation can then complete.
  const pending = db
    .sql(
      `BEGIN; SET LOCAL application_name=${literal(reader)}; SELECT ${call}; SELECT pg_advisory_xact_lock(${gate.key}); ROLLBACK;`,
    )
    .then(
      () => "ROLLED_BACK",
      (error) => error.message,
    );
  let revoked: Promise<unknown> | undefined;
  try {
    await waitForSession(
      reader,
      "wait_event_type='Lock' AND wait_event='advisory'",
    );
    revoked = db
      .sql(
        `SET application_name=${literal(revoker)}; UPDATE ledger_private.epochs SET revoked=true;`,
        "postgres",
      )
      .then(
        () => "REVOKED",
        (error) => error.message,
      );
    await waitForSession(
      revoker,
      `wait_event_type='Lock' AND EXISTS (SELECT 1 FROM pg_stat_activity owner WHERE owner.application_name=${literal(reader)} AND owner.pid=ANY(pg_blocking_pids(pg_stat_activity.pid)))`,
    );
    expect(db.admin("SELECT revoked FROM ledger_private.epochs;")).toBe("f");
  } finally {
    await gate.release();
  }
  expect(await pending).toBe("ROLLED_BACK");
  expect(await revoked).toBe("REVOKED");
  expect(ledgerEffects()).toEqual(before);
  await expect(db.sql(`SELECT ${call};`)).rejects.toThrow(
    "LEDGER_EPOCH_REJECTED",
  );
});

describe("real isolated PostgreSQL replay ledger", () => {
  it("starts disarmed; requires external synthetic authority and a private exact permit", async () => {
    const f = fixture();
    const repo = authority.repository();
    await expect(
      repo.claim(
        {
          intent: f.graph.intent,
          action: f.graph.action,
          claimId: f.graph.claim.claimId,
          permitId: randomUUID(),
        },
        f.context,
      ),
    ).rejects.toThrow();
    expect(db.admin("SELECT disposition FROM ledger_private.control;")).toBe(
      "DISARMED",
    );
    identity(f);
    await expect(
      authority.repository().claim(
        {
          intent: f.graph.intent,
          action: f.graph.action,
          claimId: f.graph.claim.claimId,
          permitId: randomUUID(),
        },
        f.context,
      ),
    ).rejects.toThrow("LEDGER_ADMISSION_PERMIT_REJECTED");
    expect(count("consumptions")).toBe(0);
    expect(count("audit_events")).toBe(0);
  });
  it("consumes exactly one simultaneous same-nonce claim across independent sessions", async () => {
    const nonce = randomUUID(),
      a = fixture(undefined, "1", nonce),
      b = fixture(undefined, "2", nonce);
    const repo = identity(a),
      pa = authority.permit(a),
      pb = authority.permit(b);
    const outcomes = await Promise.allSettled([
      repo.claim(pa, a.context),
      repo.claim(pb, b.context),
    ]);
    expect(outcomes.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect(
      outcomes
        .filter((x) => x.status === "rejected")
        .map((x: any) => x.reason.message),
    ).toEqual(["LEDGER_REPLAY_OR_TARGET_CONFLICT"]);
    expect(count("consumptions")).toBe(1);
    expect(count("audit_events")).toBe(1);
  });
  it("consumes exactly one slot despite different nonces and action signatures", async () => {
    const a = fixture(),
      b = fixture();
    const repo = identity(a);
    const pa = authority.permit(a),
      pb = authority.permit(b);
    const outcomes = await Promise.allSettled([
      repo.claim(pa, a.context),
      repo.claim(pb, b.context),
    ]);
    expect(outcomes.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect(count("consumptions")).toBe(1);
  });
  it("rejects the same action digest under a new claim ID", async () => {
    const f = fixture(),
      repo = identity(f),
      p = authority.permit(f);
    await repo.claim(p, f.context);
    f.graph.claim.claimId = randomUUID();
    await expect(repo.claim(authority.permit(f), f.context)).rejects.toThrow(
      "LEDGER_REPLAY_OR_TARGET_CONFLICT",
    );
    expect(count("consumptions")).toBe(1);
  });
  it("has globally unique nonce tombstones independent of signing key or epoch", async () => {
    const f = fixture(),
      repo = identity(f);
    await repo.claim(authority.permit(f), f.context);
    // Storage constraints are probed directly as test owner, independently of JS.
    await expect(
      db.sql(
        `INSERT INTO ledger_private.consumptions SELECT '${randomUUID()}'::uuid,nonce,repeat('f',64),intent_digest,permit_id,epoch,policy_digest,target_key,target,claim_document,repository_id,environment,run_id,run_attempt,phase,mode,category,blocked_operation_id,claimed_at,expires_at FROM ledger_private.consumptions;`,
        "postgres",
      ),
    ).rejects.toThrow("LEDGER_DATABASE_REJECTED");
    const definition = db.admin(
      "SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid='ledger_private.consumptions'::regclass AND conname='consumptions_nonce_key';",
    );
    expect(definition).toBe("UNIQUE (nonce)");
  });
  it("admits at most one simultaneous writer for the same target", async () => {
    const a = writer("1"),
      b = writer("2"),
      repo = identity(a),
      pa = authority.permit(a),
      pb = authority.permit(b);
    const outcomes = await Promise.allSettled([
      repo.claim(pa, a.context),
      repo.claim(pb, b.context),
    ]);
    expect(outcomes.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect(count("target_ownership")).toBe(1);
    expect(count("consumptions")).toBe(1);
  });
  it("keeps failure consumed and quarantined across repository/process restart", async () => {
    const a = writer(),
      repo = identity(a),
      p = authority.permit(a);
    await repo.claim(p, a.context);
    await repo.stop({ ...operation(a), outcome: "FAILED" });
    const restarted = authority.repository();
    expect(await restarted.status(operation(a))).toMatchObject({
      consumed: true,
      state: "FAILED",
      targetOwnership: "QUARANTINED",
      operational: false,
      executionEligible: false,
    });
    await expect(restarted.claim(p, a.context)).rejects.toThrow(
      "LEDGER_REPLAY_OR_TARGET_CONFLICT",
    );
    const b = writer("2");
    await expect(
      restarted.claim(authority.permit(b), b.context),
    ).rejects.toThrow("LEDGER_REPLAY_OR_TARGET_CONFLICT");
  });
  it("does not release quarantine when the worker lease expires", async () => {
    const a = writer(),
      repo = identity(a);
    await repo.claim(authority.permit(a), a.context);
    await repo.stop({ ...operation(a), outcome: "OUTCOME_UNKNOWN" });
    db.admin(
      "UPDATE ledger_private.target_ownership SET worker_lease_until='2000-01-01';",
    );
    const b = writer("2");
    await expect(repo.claim(authority.permit(b), b.context)).rejects.toThrow(
      "LEDGER_REPLAY_OR_TARGET_CONFLICT",
    );
    expect((await repo.status(operation(a))).targetOwnership).toBe(
      "QUARANTINED",
    );
  });
  it("permits separately consumed fenced inspection without a writer or release", async () => {
    const a = writer(),
      repo = identity(a);
    await repo.claim(authority.permit(a), a.context);
    await repo.stop({ ...operation(a), outcome: "OUTCOME_UNKNOWN" });
    const i = fixture(
      {
        kind: "RECOVERY_INSPECT",
        mode: "preflight",
        blockedOperationId: operation(a).operationId,
        blockedActionDigest: operation(a).actionDigest,
      },
      "2",
    );
    validateReferenceGraphV2(i.graph, i.context);
    await expect(repo.claim(authority.permit(i), i.context)).rejects.toThrow(
      "LEDGER_INSPECTION_FENCING_REQUIRED",
    );
    const result = await repo.claim(
      authority.permit(i, [], "f".repeat(64)),
      i.context,
    );
    expect(result).toMatchObject({
      targetOwnership: "INSPECTION",
      operational: false,
      executionEligible: false,
    });
    await repo.advance(authority.transition(i, "RETENTION_CONFIRMED", 0));
    await repo.advance(authority.transition(i, "RUNNING", 1));
    expect(await repo.status(operation(i))).toMatchObject({
      state: "RUNNING",
      targetOwnership: "INSPECTION",
    });
    await expect(
      repo.reserveCommand({ ...operation(i), ...command }),
    ).rejects.toThrow("LEDGER_COMMAND_STATE_REJECTED");
    expect(count("target_ownership")).toBe(1);
    expect((await repo.status(operation(a))).targetOwnership).toBe(
      "QUARANTINED",
    );
  });
  it("rolls back every claim/ownership/audit write when its transaction aborts", async () => {
    const f = fixture();
    identity(f);
    const p = authority.permit(f);
    const binding = db.admin(
      `SELECT binding FROM ledger_private.admission_permits WHERE permit_id=${literal(p.permitId)};`,
    );
    await expect(
      db.sql(
        `BEGIN; SELECT ledger_api.claim(${jsonSql({ permitId: p.permitId, binding: JSON.parse(binding), authority: authority.head })}); SELECT 1/0; COMMIT;`,
      ),
    ).rejects.toThrow("LEDGER_DATABASE_REJECTED");
    expect(count("consumptions")).toBe(0);
    expect(count("operation_states")).toBe(0);
    expect(count("audit_events")).toBe(0);
    expect(count("target_ownership")).toBe(0);
    expect(await authority.repository().claim(p, f.context)).toMatchObject({
      consumed: true,
    });
  });
  it("lost commit acknowledgement is queried and cannot cause replacement admission", async () => {
    const f = fixture();
    identity(f);
    const p = authority.permit(f);
    let lost = true;
    const repo = authority.repository(async (s: string, v: string[]) => {
      const result = await db.query(s, v);
      if (lost) {
        lost = false;
        throw new Error("synthetic acknowledgement lost");
      }
      return result;
    });
    await expect(repo.claim(p, f.context)).rejects.toThrow(
      "LEDGER_DATABASE_REJECTED",
    );
    expect(await authority.repository().status(operation(f))).toMatchObject({
      consumed: true,
      state: "CLAIMED_PENDING_RETENTION",
    });
    await expect(authority.repository().claim(p, f.context)).rejects.toThrow(
      "LEDGER_REPLAY_OR_TARGET_CONFLICT",
    );
  });
  it("allows no command reservation before independent retained RUNNING", async () => {
    const f = writer(),
      repo = identity(f);
    await repo.claim(authority.permit(f, [command]), f.context);
    await expect(
      repo.reserveCommand({ ...operation(f), ...command }),
    ).rejects.toThrow("LEDGER_COMMAND_STATE_REJECTED");
    await expect(
      repo.advance({
        graph: f.graph,
        context: f.context,
        permitId: randomUUID(),
        nextState: "RUNNING",
      }),
    ).rejects.toThrow("LEDGER_RETENTION_OR_TRANSITION_REJECTED");
    expect(count("command_reservations")).toBe(0);
    expect((await repo.status(operation(f))).reservationCount).toBe(0);
  });
  it("requires exact retained claim identity, package, acknowledgement and transition", async () => {
    const f = writer(),
      repo = identity(f);
    await repo.claim(authority.permit(f), f.context);
    const p = authority.transition(f, "RETENTION_CONFIRMED", 0);
    await expect(repo.advance({ ...p, nextState: "RUNNING" })).rejects.toThrow(
      "LEDGER_RETENTION_OR_TRANSITION_REJECTED",
    );
    const bad = structuredClone(f.graph);
    bad.claim.claimedAt = stampV2(9000);
    bad.retention.claimDigest = digestV2(bad.claim);
    bad.acknowledgement.packageManifestDigest = digestV2(bad.retention);
    f.signDocument(bad.acknowledgement, "retention");
    await expect(repo.advance({ ...p, graph: bad })).rejects.toThrow(
      "LEDGER_RETAINED_CLAIM_MISMATCH",
    );
    expect(await repo.advance(p)).toMatchObject({
      state: "RETENTION_CONFIRMED",
    });
  });
  it("reserves a fixed command exactly once across concurrent independent sessions", async () => {
    const f = writer();
    identity(f);
    const repo = await authority.running(f, [command]);
    const outcomes = await Promise.allSettled([
      repo.reserveCommand({ ...operation(f), ...command }),
      repo.reserveCommand({ ...operation(f), ...command }),
    ]);
    expect(outcomes.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect(count("command_reservations")).toBe(1);
    expect((await repo.status(operation(f))).reservationCount).toBe(1);
  });
  it("rejects wrong sequence, command or artifact without reserving anything", async () => {
    const f = writer();
    identity(f);
    const repo = await authority.running(f, [command]);
    for (const change of [
      { sequence: 2 },
      { commandDigest: "f".repeat(64) },
      { artifactDigest: "f".repeat(64) },
    ])
      await expect(
        repo.reserveCommand({ ...operation(f), ...command, ...change }),
      ).rejects.toThrow("LEDGER_COMMAND_PLAN_OR_SEQUENCE_REJECTED");
    expect(count("command_reservations")).toBe(0);
  });
  it("crash after reservation and post-dispatch revocation never permit redispatch", async () => {
    const f = writer();
    identity(f);
    const repo = await authority.running(f, [command]);
    await repo.reserveCommand({ ...operation(f), ...command });
    const restarted = authority.repository();
    await expect(
      restarted.reserveCommand({ ...operation(f), ...command }),
    ).rejects.toThrow("LEDGER_COMMAND_PLAN_OR_SEQUENCE_REJECTED");
    await restarted.stop({ ...operation(f), outcome: "REVOKED" });
    expect(await restarted.status(operation(f))).toMatchObject({
      targetOwnership: "QUARANTINED",
      reservationCount: 1,
      redispatchAllowed: false,
    });
    await expect(
      restarted.reserveCommand({ ...operation(f), ...command }),
    ).rejects.toThrow("LEDGER_COMMAND_STATE_REJECTED");
  });
  it.each(["FAILED", "REVOKED", "OUTCOME_UNKNOWN", "BLOCKED_RETENTION"])(
    "%s before dispatch remains consumed; late acknowledgement cannot reactivate",
    async (outcome: any) => {
      const f = writer(),
        repo = identity(f);
      await repo.claim(authority.permit(f, [command]), f.context);
      const late = authority.transition(f, "RETENTION_CONFIRMED", 0);
      await repo.stop({ ...operation(f), outcome });
      await expect(repo.advance(late)).rejects.toThrow(
        "LEDGER_RETENTION_OR_TRANSITION_REJECTED",
      );
      expect(await repo.status(operation(f))).toMatchObject({
        consumed: true,
        targetOwnership: "QUARANTINED",
        reservationCount: 0,
      });
      expect(count("command_reservations")).toBe(0);
    },
  );
  it("quarantines post-RUNNING failure and refuses a claimed safe-to-release boolean", async () => {
    const f = writer();
    identity(f);
    const repo = await authority.running(f, [command]);
    await repo.reserveCommand({ ...operation(f), ...command });
    await expect(
      repo.stop({ ...operation(f), outcome: "FAILED", safeToRelease: true }),
    ).rejects.toThrow();
    await repo.stop({ ...operation(f), outcome: "FAILED" });
    expect((await repo.status(operation(f))).targetOwnership).toBe(
      "QUARANTINED",
    );
    expect((repo as any).releaseTarget).toBeUndefined();
  });
  it("restoration starts disarmed and a stale external epoch head cannot revive old approval", async () => {
    const f = fixture(),
      repo = identity(f),
      p = authority.permit(f),
      snapshot = db.snapshot();
    await repo.claim(p, f.context);
    await repo.disarm();
    authority.head = {
      ...authority.head,
      epoch: randomUUID(),
      bootChallenge: "e".repeat(64),
      headDigest: "f".repeat(64),
    };
    db.restore(snapshot);
    expect(db.admin("SELECT disposition FROM ledger_private.control;")).toBe(
      "DISARMED",
    );
    await expect(authority.repository().claim(p, f.context)).rejects.toThrow(
      "LEDGER_AUTHORITY_UNAVAILABLE",
    );
    // Even a restored test-only activation flag cannot match outside authority.
    db.admin(
      "UPDATE ledger_private.control SET disposition='SYNTHETIC_LOCAL_ONLY';",
    );
    await expect(authority.repository().claim(p, f.context)).rejects.toThrow(
      "LEDGER_AUTHORITY_UNAVAILABLE",
    );
    expect(count("consumptions")).toBe(0);
    expect(count("command_reservations")).toBe(0);
  });
  it("disarms existing operations without erasing tombstones or unresolved quarantine", async () => {
    const f = writer(),
      repo = identity(f);
    await repo.claim(authority.permit(f), f.context);
    await repo.disarm();
    expect(await repo.status(operation(f))).toMatchObject({
      state: "OUTCOME_UNKNOWN",
      targetOwnership: "QUARANTINED",
      consumed: true,
    });
    expect(count("consumptions")).toBe(1);
    expect(count("audit_events")).toBe(2);
    const next = randomUUID();
    db.admin(
      `UPDATE ledger_private.epochs SET revoked=true; INSERT INTO ledger_private.epochs VALUES(${literal(next)},repeat('f',64),repeat('e',64),repeat('d',64),clock_timestamp(),false);`,
    );
    expect(count("consumptions")).toBe(1);
    expect(count("target_ownership")).toBe(1);
    await expect(
      repo.claim(authority.permit(writer("2")), f.context),
    ).rejects.toThrow();
  });
  it("retired epochs and expired action/permit deadlines fail before claim or command", async () => {
    const f = writer(),
      repo = identity(f),
      p = authority.permit(f);
    db.admin("UPDATE ledger_private.epochs SET revoked=true;");
    await expect(repo.claim(p, f.context)).rejects.toThrow(
      "LEDGER_EPOCH_REJECTED",
    );
    db.admin(
      `UPDATE ledger_private.epochs SET revoked=false; UPDATE ledger_private.control SET test_now=${literal(stampV2(600_000))};`,
    );
    await expect(repo.claim(p, f.context)).rejects.toThrow(
      "LEDGER_ADMISSION_PERMIT_REJECTED",
    );
    expect(count("consumptions")).toBe(0);
  });
  it("restricted runtime cannot mutate private tables, enroll authority or rewrite audit", async () => {
    const f = fixture(),
      repo = identity(f);
    await repo.claim(authority.permit(f), f.context);
    for (const sql of [
      "DELETE FROM ledger_private.consumptions;",
      "TRUNCATE ledger_private.consumptions CASCADE;",
      "UPDATE ledger_private.target_ownership SET disposition='RELEASED';",
      "UPDATE ledger_private.audit_events SET event_hash=repeat('f',64);",
      "DELETE FROM ledger_private.audit_events;",
      "UPDATE ledger_private.control SET disposition='SYNTHETIC_LOCAL_ONLY';",
      "INSERT INTO ledger_private.admission_permits VALUES(gen_random_uuid(),'{}',now(),'[]',NULL);",
      "SET ROLE bill04c_owner;",
      "SELECT ledger_private.append_event(gen_random_uuid(),'CLAIMED',now());",
    ])
      await expect(db.sql(sql)).rejects.toThrow("LEDGER_DATABASE_REJECTED");
    const status = await repo.status(operation(f));
    expect(verifyAuditChain(status.audit).eventCount).toBe(1);
  });
  it("append-only history is ordered/hash-bound and immutable even through ordinary owner DML", async () => {
    const f = writer();
    identity(f);
    const repo = await authority.running(f, [command]);
    await repo.reserveCommand({ ...operation(f), ...command });
    await repo.stop({ ...operation(f), outcome: "OUTCOME_UNKNOWN" });
    const s = await repo.status(operation(f));
    expect(verifyAuditChain(s.audit)).toMatchObject({
      eventCount: 5,
      independentRetention: false,
    });
    for (const sql of [
      "UPDATE ledger_private.audit_events SET event_hash=repeat('f',64);",
      "DELETE FROM ledger_private.audit_events;",
      "DELETE FROM ledger_private.consumptions;",
      "DELETE FROM ledger_private.command_reservations;",
    ])
      await expect(db.sql(sql, "postgres")).rejects.toThrow("LEDGER_IMMUTABLE");
    const broken = structuredClone(s.audit);
    broken[1].previousHash = "f".repeat(64);
    expect(() => verifyAuditChain(broken)).toThrow("LEDGER_AUDIT_INVALID");
  });
  it("key rotation and a fresh epoch cannot make a previously consumed nonce reusable", async () => {
    const nonce = randomUUID(),
      old = fixture(undefined, "1", nonce),
      repo = identity(old);
    await repo.claim(authority.permit(old), old.context);
    await repo.stop({ ...operation(old), outcome: "OUTCOME_UNKNOWN" });
    const next = fixture(undefined, "2", nonce),
      timingKey = next.policy.keys.find((k: any) => k.purpose === "timing");
    next.policy.epoch = randomUUID();
    next.policy.activatedAt = stampV2(0);
    next.policy.keys = [{ ...timingKey, purpose: "action" }];
    next.graph.intent.epoch = next.policy.epoch;
    next.graph.intent.policyDigest = digestV2(next.policy);
    next.graph.intent.workflow.runCreatedAt = stampV2(30_000);
    next.graph.intent.workflow.jobStartedAt = stampV2(31_000);
    next.context.intent = structuredClone(next.graph.intent);
    next.context.now = Date.parse(stampV2(40_000));
    Object.assign(next.graph.action.governance, {
      epoch: next.policy.epoch,
      policyDigest: digestV2(next.policy),
      createdAt: stampV2(32_000),
    });
    next.graph.action.intentDigest = digestV2(next.graph.intent);
    next.signDocument(next.graph.action, "action", "timing");
    validateSignedV2(next.graph.action, "action", next.context);
    expect(next.graph.action.signature.keyId).not.toBe(
      old.graph.action.signature.keyId,
    );
    db.admin("UPDATE ledger_private.epochs SET revoked=true;");
    authority.install(next);
    db.admin(
      `UPDATE ledger_private.control SET test_now=${literal(stampV2(40_000))};`,
    );
    await expect(
      authority.repository().claim(authority.permit(next), next.context),
    ).rejects.toThrow("LEDGER_REPLAY_OR_TARGET_CONFLICT");
    await expect(
      authority.repository().claim(authority.permit(old), old.context),
    ).rejects.toThrow("LEDGER_EPOCH_OR_DEADLINE_REJECTED");
    expect(count("epochs")).toBe(2);
    expect(count("consumptions")).toBe(1);
    expect((await repo.status(operation(old))).targetOwnership).toBe(
      "QUARANTINED",
    );
  });
  it("requires a run created strictly after activation independently of nonce freshness", async () => {
    const f = fixture(),
      repo = identity(f);
    f.graph.intent.workflow.runCreatedAt = f.policy.activatedAt;
    f.context.intent = structuredClone(f.graph.intent);
    f.graph.action.intentDigest = digestV2(f.graph.intent);
    f.signDocument(f.graph.action, "action");
    validateSignedV2(f.graph.action, "action", f.context);
    await expect(repo.claim(authority.permit(f), f.context)).rejects.toThrow(
      "LEDGER_EPOCH_OR_DEADLINE_REJECTED",
    );
    expect(count("consumptions")).toBe(0);
  });
  it("lost reservation acknowledgement never produces a second reservation", async () => {
    const f = writer();
    identity(f);
    await authority.running(f, [command]);
    const repo = authority.repository(async (s: string, v: string[]) => {
      await db.query(s, v);
      throw new Error("lost acknowledgement");
    });
    await expect(
      repo.reserveCommand({ ...operation(f), ...command }),
    ).rejects.toThrow("LEDGER_DATABASE_REJECTED");
    const status = await authority.repository().status(operation(f));
    expect(status).toMatchObject({
      reservationCount: 1,
      redispatchAllowed: false,
    });
    await expect(
      authority.repository().reserveCommand({ ...operation(f), ...command }),
    ).rejects.toThrow("LEDGER_COMMAND_PLAN_OR_SEQUENCE_REJECTED");
    expect(count("command_reservations")).toBe(1);
  });
  it("command reservation and its audit event roll back together", async () => {
    const f = writer();
    identity(f);
    const repo = await authority.running(f, [command]);
    await expect(
      db.sql(
        `BEGIN; SELECT ledger_api.reserve_command(${jsonSql({ ...operation(f), ...command, authority: authority.head })}); SELECT 1/0; COMMIT;`,
      ),
    ).rejects.toThrow("LEDGER_DATABASE_REJECTED");
    expect(count("command_reservations")).toBe(0);
    expect(count("audit_events")).toBe(3);
    expect(
      await repo.reserveCommand({ ...operation(f), ...command }),
    ).toMatchObject({
      reserved: true,
      operational: false,
      executionEligible: false,
    });
  });
  it("a fully retained RUNNING status capability still cannot reserve a command", async () => {
    const f = fixture();
    identity(f);
    const repo = await authority.running(f, [command]);
    expect((await repo.status(operation(f))).state).toBe("RUNNING");
    await expect(
      repo.reserveCommand({ ...operation(f), ...command }),
    ).rejects.toThrow("LEDGER_COMMAND_STATE_REJECTED");
    expect(count("command_reservations")).toBe(0);
  });
  it("PUBLIC has neither private-schema access nor definer-function execution", async () => {
    db.admin("CREATE ROLE bill04c_unprivileged LOGIN;");
    await expect(
      db.sql("SELECT ledger_api.disarm();", "bill04c_unprivileged"),
    ).rejects.toThrow("LEDGER_DATABASE_REJECTED");
    expect(
      db.admin(
        "SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('ledger_api','ledger_private') AND has_function_privilege('bill04c_unprivileged',p.oid,'EXECUTE');",
      ),
    ).toBe("0");
  });
  it("requires synchronous commit for a consumption even from an asynchronous session", async () => {
    const f = fixture();
    identity(f);
    const p = authority.permit(f);
    const binding = JSON.parse(
      db.admin(
        `SELECT binding FROM ledger_private.admission_permits WHERE permit_id=${literal(p.permitId)};`,
      ),
    );
    const output = await db.sql(
      `BEGIN; SET LOCAL synchronous_commit=off; SELECT ledger_api.claim(${jsonSql({ permitId: p.permitId, binding, authority: authority.head })}); SHOW synchronous_commit; COMMIT;`,
    );
    expect(output.split("\n").at(-1)).toBe("on");
    expect(count("consumptions")).toBe(1);
    expect(db.admin("SHOW fsync; SHOW full_page_writes;")).toBe("on\non");
  });
  it("test target is owned, network-isolated, pinned and cannot use a caller URL", () => {
    db.assertOwned();
    expect(TEST_IMAGE).toMatch(/^postgres@sha256:[a-f0-9]{64}$/);
    for (const input of [
      "postgres://localhost/app",
      "postgres://exmrksgdikfprtfeltzu.supabase.co/postgres",
      "postgres://production/app",
    ])
      expect(() => rejectDatabaseUrl(input)).toThrow(
        "LEDGER_TEST_DATABASE_SELECTION_DENIED",
      );
    expect(
      () => new DisposablePostgres({ url: "postgres://localhost/app" }),
    ).toThrow();
    expect(() => createReplayLedger({ query: db.query } as any)).toThrow(
      "LEDGER_AUTHORITY_UNAVAILABLE",
    );
    expect(
      JSON.parse(
        readFileSync("config/staging-founder-governance.json", "utf8"),
      ),
    ).toMatchObject({ enabled: false, keys: [] });
    expect(
      JSON.parse(readFileSync("config/staging-timing-review.json", "utf8"))
        .reviewKeys,
    ).toEqual([]);
  });
});

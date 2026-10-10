// Explicitly synthetic, database-owner test fixture. Never imported by src/.
// No operational credentials, keys, arming or authenticated epoch service.
import { randomUUID, randomBytes } from "node:crypto";
import {
  v2Fixture,
  stampV2,
} from "../../tests/helpers/staging-founder-v2-fixture";
import {
  digestV2,
  validateReferenceGraphV2,
} from "../../scripts/staging-founder-authorization-v2.mjs";
import { claimBindingV2, createReplayLedger } from "../src/replay-ledger.mjs";

export const jsonSql = (value: unknown) =>
  `convert_from(decode('${Buffer.from(JSON.stringify(value)).toString("hex")}','hex'),'UTF8')::jsonb`;
export const literal = (value: string) => `'${value.replaceAll("'", "''")}'`;
export function fixture(
  capability: any = { kind: "STATUS", mode: "preflight" },
  run = "1",
  nonce: string = randomUUID(),
) {
  const f = v2Fixture(capability);
  f.graph.intent.workflow.runId = run;
  f.context.intent = structuredClone(f.graph.intent);
  if (Object.hasOwn(f.graph.authorization, "intentDigest"))
    f.graph.authorization.intentDigest = digestV2(f.graph.intent);
  f.seal();
  f.graph.action.nonce = nonce;
  f.signDocument(f.graph.action, "action");
  f.graph.claim.claimId = randomUUID();
  f.graph.claim.nonce = nonce;
  f.graph.claim.actionDigest = digestV2(f.graph.action);
  f.graph.delivery.actionDigest = digestV2(f.graph.action);
  f.signDocument(f.graph.delivery, "delivery");
  f.graph.retention.actionDigest = digestV2(f.graph.action);
  f.graph.retention.deliveryManifestDigest = digestV2(f.graph.delivery);
  f.graph.retention.claimDigest = digestV2(f.graph.claim);
  f.graph.acknowledgement.actionDigest = digestV2(f.graph.action);
  f.graph.acknowledgement.claimId = f.graph.claim.claimId;
  f.graph.acknowledgement.packageManifestDigest = digestV2(f.graph.retention);
  f.signDocument(f.graph.acknowledgement, "retention");
  return f;
}
export class SyntheticAuthority {
  db: any;
  head: any;
  constructor(db: any) {
    this.db = db;
  }
  install(f: any) {
    this.head = {
      kind: "SYNTHETIC_LOCAL_ONLY",
      epoch: f.graph.intent.epoch,
      bootChallenge: randomBytes(32).toString("hex"),
      headDigest: randomBytes(32).toString("hex"),
    };
    this.db
      .admin(`INSERT INTO ledger_private.epochs VALUES (${literal(this.head.epoch)},${literal(f.graph.intent.policyDigest)},${literal(this.head.bootChallenge)},${literal(this.head.headDigest)},${literal(f.policy.activatedAt)},false);
      UPDATE ledger_private.control SET disposition='SYNTHETIC_LOCAL_ONLY',epoch=${literal(this.head.epoch)},policy_digest=${literal(f.graph.intent.policyDigest)},boot_challenge=${literal(this.head.bootChallenge)},authoritative_head=${literal(this.head.headDigest)},activated_at=${literal(f.policy.activatedAt)},test_now=${literal(stampV2(10_000))};`);
  }
  repository(query = this.db.query) {
    return createReplayLedger({
      query,
      syntheticAuthority: async () => structuredClone(this.head),
    });
  }
  permit(f: any, commands: any[] = [], fence: string | null = null) {
    const permitId = randomUUID();
    const binding = claimBindingV2(
      f.graph.intent,
      f.graph.action,
      f.graph.claim.claimId,
      f.context,
    );
    this.db.admin(
      `INSERT INTO ledger_private.admission_permits VALUES (${literal(permitId)},${jsonSql(binding)},${literal(binding.expiresAt)},${jsonSql(commands)},${fence ? literal(fence) : "NULL"});`,
    );
    return {
      permitId,
      intent: f.graph.intent,
      action: f.graph.action,
      claimId: f.graph.claim.claimId,
    };
  }
  transition(f: any, nextState: string, revision: number) {
    const proof = validateReferenceGraphV2(f.graph, f.context);
    const permitId = randomUUID();
    this.db.admin(
      `INSERT INTO ledger_private.transition_permits VALUES(${literal(permitId)},${literal(proof.claimId)},${revision},${literal(nextState)},${literal(proof.retentionAckDigest)},${literal(digestV2(f.graph.retention))},${literal(f.graph.action.governance.expiresAt)});`,
    );
    return { graph: f.graph, context: f.context, permitId, nextState };
  }
  async running(f: any, commands: any[] = []) {
    const repo = this.repository();
    await repo.claim(this.permit(f, commands), f.context);
    await repo.advance(this.transition(f, "RETENTION_CONFIRMED", 0));
    await repo.advance(this.transition(f, "RUNNING", 1));
    return repo;
  }
}
export const operation = (f: any) => ({
  operationId: f.graph.claim.claimId,
  actionDigest: digestV2(f.graph.action),
});

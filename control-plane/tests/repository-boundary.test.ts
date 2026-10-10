import { beforeAll, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { fixture, operation } from "./synthetic-authority";
import { claimBindingV2, createReplayLedger } from "../src/replay-ledger.mjs";
import { digestV2 } from "../../scripts/staging-founder-authorization-v2.mjs";

beforeAll(() => fixture());
const setup = () => {
  const f = fixture();
  const query = vi.fn(async () => ({
    rows: [{ result: { operational: false, executionEligible: false } }],
  }));
  const repo = createReplayLedger({
    query,
    syntheticAuthority: async () => ({
      kind: "SYNTHETIC_LOCAL_ONLY",
      epoch: f.graph.intent.epoch,
      bootChallenge: "a".repeat(64),
      headDigest: "b".repeat(64),
    }),
  });
  const request = {
    intent: f.graph.intent,
    action: f.graph.action,
    claimId: f.graph.claim.claimId,
    permitId: randomUUID(),
  };
  return { f, query, repo, request };
};
describe("local repository boundary (mocked client; no PostgreSQL claim)", () => {
  it("derives the exact existing V2 slot and physical target identity", () => {
    const { f } = setup();
    const binding = claimBindingV2(
      f.graph.intent,
      f.graph.action,
      f.graph.claim.claimId,
      f.context,
    );
    expect(binding.slot).toEqual(f.graph.claim.slot);
    expect(binding.actionDigest).toBe(digestV2(f.graph.action));
    expect(binding.target.project).toBe("exmrksgdikfprtfeltzu");
  });
  it("rejects a forged signature before any database call", async () => {
    const { f, repo, query, request } = setup();
    request.action = structuredClone(request.action);
    request.action.signature.signature = Buffer.alloc(64).toString("base64");
    await expect(repo.claim(request, f.context)).rejects.toThrow(
      "V2_SIGNATURE_INVALID",
    );
    expect(query).not.toHaveBeenCalled();
  });
  it("rejects a signed action for a different intent before database access", async () => {
    const { f, repo, query, request } = setup();
    request.action = structuredClone(request.action);
    request.action.intentDigest = "f".repeat(64);
    f.signDocument(request.action, "action");
    await expect(repo.claim(request, f.context)).rejects.toThrow(
      "LEDGER_ACTION_INTENT_MISMATCH",
    );
    expect(query).not.toHaveBeenCalled();
  });
  it.each(["approved", "fenced", "safeToRelease"])(
    "%s cannot confer authority or be silently consumed",
    async (field) => {
      const { f, repo, query, request } = setup();
      await expect(
        repo.claim({ ...request, [field]: true }, f.context),
      ).rejects.toThrow("LEDGER_REQUEST_INVALID");
      expect(query).not.toHaveBeenCalled();
    },
  );
  it("rejects unavailable external authority without contacting PostgreSQL", async () => {
    const { f, query, request } = setup();
    const repo = createReplayLedger({
      query,
      syntheticAuthority: async () => undefined,
    });
    await expect(repo.claim(request, f.context)).rejects.toThrow(
      "LEDGER_AUTHORITY_UNAVAILABLE",
    );
    expect(query).not.toHaveBeenCalled();
  });
  it("sanitizes database errors and does not retry a failed reservation", async () => {
    const { f, repo, query } = setup();
    query.mockRejectedValue(
      new Error("postgres://private.example/secret password=DO_NOT_REVEAL"),
    );
    await expect(
      repo.reserveCommand({
        ...operation(f),
        sequence: 1,
        commandDigest: "a".repeat(64),
        artifactDigest: "b".repeat(64),
      }),
    ).rejects.toThrow(/^LEDGER_DATABASE_REJECTED$/);
    expect(query).toHaveBeenCalledTimes(1);
  });
  it("rejects malformed command sequences/extra executable data before SQL", async () => {
    const { f, repo, query } = setup();
    for (const request of [
      { sequence: 0 },
      { sequence: 1, sql: "DROP DATABASE app" },
      { sequence: 1, url: "https://production.invalid" },
    ])
      await expect(
        repo.reserveCommand({
          ...operation(f),
          commandDigest: "a".repeat(64),
          artifactDigest: "b".repeat(64),
          ...request,
        }),
      ).rejects.toThrow("LEDGER_REQUEST_INVALID");
    expect(query).not.toHaveBeenCalled();
  });
  it("never promotes a database result claiming operational authority", async () => {
    const { f, repo, query } = setup();
    query.mockResolvedValue({
      rows: [{ result: { operational: true, executionEligible: true } }],
    });
    await expect(repo.status(operation(f))).rejects.toThrow(
      "LEDGER_RESULT_INVALID",
    );
  });
  it("accepts only fixed transition names and never exposes a release/dispatch API", async () => {
    const { f, repo, query } = setup();
    await expect(
      repo.advance({
        graph: f.graph,
        context: f.context,
        permitId: randomUUID(),
        nextState: "SUCCEEDED",
      }),
    ).rejects.toThrow("LEDGER_REQUEST_INVALID");
    expect(query).not.toHaveBeenCalled();
    expect(repo.operational).toBe(false);
    expect(repo.executionEligible).toBe(false);
    expect((repo as any).dispatch).toBeUndefined();
    expect((repo as any).releaseTarget).toBeUndefined();
  });
});

import { describe, expect, it } from "vitest";
import { createAuthSmokeFixtures } from "../e2e/utils/auth-fixtures";

function mutableKeys(fixtures: ReturnType<typeof createAuthSmokeFixtures>) {
  return [
    ...Object.values(fixtures).map((user) => user.email),
    fixtures.ptComplete.workspaceId,
    fixtures.ptIncompleteProfile.workspaceId,
    fixtures.clientNoWorkspace.clientId,
    fixtures.clientInvite.clientId,
    fixtures.clientInvite.inviteCode,
    fixtures.clientInvite.inviteToken,
  ];
}

describe("auth smoke fixture isolation", () => {
  it("keeps a worker's reseeds stable", () => {
    expect(createAuthSmokeFixtures("run-a:worker-0")).toEqual(
      createAuthSmokeFixtures("run-a:worker-0"),
    );
  });

  it("isolates every mutable identity across parallel slots and runs", () => {
    const scopes = [
      "run-a:worker-0",
      "run-a:worker-1",
      "run-a:worker-2",
      "run-a:worker-3",
      "run-b:worker-1",
      "run-b:worker-0",
    ];
    const keys = scopes.flatMap((scope) =>
      mutableKeys(createAuthSmokeFixtures(scope)),
    );
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("retains valid database IDs and distinct fixture roles", () => {
    const fixtures = createAuthSmokeFixtures(
      "scope with spaces and / punctuation",
    );
    for (const id of [
      fixtures.ptComplete.workspaceId,
      fixtures.ptIncompleteProfile.workspaceId,
      fixtures.clientNoWorkspace.clientId,
      fixtures.clientInvite.clientId,
    ]) {
      expect(id).toMatch(
        /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-8[a-f0-9]{3}-[a-f0-9]{12}$/,
      );
    }
    for (const user of Object.values(fixtures)) {
      expect(user.email).toMatch(/^smoke-[a-z-]+-[a-f0-9]{20}@repsync\.test$/);
    }
  });
});

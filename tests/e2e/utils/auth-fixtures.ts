import { createHash } from "node:crypto";

/** Every mutable database key belongs to one worker namespace. */
export function createAuthSmokeFixtures(scope: string) {
  const digest = (value: string) =>
    createHash("sha256").update(value).digest("hex");
  const tag = digest(scope).slice(0, 20);
  const id = (role: string) => {
    const hex = digest(`${scope}:${role}`);
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
  };
  return {
    ptComplete: {
      email: `smoke-pt-complete-${tag}@repsync.test`,
      password: "SmokePass123!",
      fullName: "Smoke PT Complete",
      workspaceId: id("pt-complete"),
      workspaceName: "Smoke PT Complete Workspace",
    },
    ptIncompleteProfile: {
      email: `smoke-pt-incomplete-${tag}@repsync.test`,
      password: "SmokePass123!",
      fullName: "Smoke PT Incomplete",
      workspaceId: id("pt-incomplete"),
      workspaceName: "Smoke PT Incomplete Workspace",
    },
    clientNoWorkspace: {
      email: `smoke-client-empty-${tag}@repsync.test`,
      password: "SmokePass123!",
      fullName: "Smoke Client Empty",
      clientId: id("client-empty"),
    },
    clientInvite: {
      email: `smoke-client-invite-${tag}@repsync.test`,
      password: "SmokePass123!",
      fullName: "Smoke Client Invite",
      clientId: id("client-invite"),
      inviteCode: `SMOKE-${tag}`,
      inviteToken: `smoke-invite-${tag}`,
    },
  };
}

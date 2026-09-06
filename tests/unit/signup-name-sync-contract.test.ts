import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function read(path: string) {
  return readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
}

describe("signup name propagation contract", () => {
  it("passes signup names into Supabase auth metadata", () => {
    const authHelpers = read("src/lib/auth-helpers.ts");
    const ptSignup = read("src/pages/public/pt-signup.tsx");
    const clientSignup = read("src/pages/public/client-signup.tsx");

    expect(authHelpers).toContain("metadata?: Record<string, unknown>");
    expect(authHelpers).toContain("data: metadata");
    expect(ptSignup).toContain('account_type: "pt"');
    expect(ptSignup).toContain("full_name: fullName.trim()");
    expect(clientSignup).toContain('account_type: "client"');
    expect(clientSignup).toContain("full_name: fullName.trim()");
  });

  it("links PT signup identity to every PT name store used by the app", () => {
    const accountProfiles = read("src/lib/account-profiles.ts");
    const authCallback = read("src/lib/auth-callback.ts");
    const ptSignup = read("src/pages/public/pt-signup.tsx");
    const workspaceOnboarding = read("src/pages/pt/onboarding-workspace.tsx");
    const ptHub = read("src/features/pt-hub/lib/pt-hub.ts");

    expect(accountProfiles).toContain("syncPtAccountIdentity");
    expect(accountProfiles).toContain('.from("pt_profiles")');
    expect(accountProfiles).toContain('.from("pt_hub_profiles")');
    expect(accountProfiles).toContain('.from("pt_hub_settings")');
    expect(accountProfiles).toContain("updateCurrentUserNameMetadata");
    expect(authCallback).toContain("syncPtAccountIdentity");
    expect(ptSignup).toContain("syncPtAccountIdentity");
    expect(workspaceOnboarding).toContain("syncPtAccountIdentity");
    expect(ptHub).toContain("syncPtAccountIdentity");
  });

  it("defers client profile provisioning until signup has an authenticated session", () => {
    const clientSignup = read("src/pages/public/client-signup.tsx");

    expect(clientSignup).toContain("data.session?.user ?? user ?? null");
    expect(clientSignup).not.toContain("data.user?.id ?? user?.id");
  });
});

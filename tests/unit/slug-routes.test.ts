import { describe, expect, it } from "vitest";
import {
  buildUniqueSlug,
  isReservedSlug,
  normalizeSlug,
  normalizeSlugCandidate,
} from "../../src/lib/slug";
import { routes } from "../../src/lib/routes";
import {
  buildLegacyWorkspaceEntryRedirectPath,
  buildLegacyWorkspaceSettingsRedirectPath,
} from "../../src/lib/workspace-route-resolution";

describe("slug utilities", () => {
  it("normalizes readable names into lowercase kebab-case slugs", () => {
    expect(normalizeSlugCandidate(" Nour Coaching ")).toBe("nour-coaching");
    expect(normalizeSlugCandidate("LUS1 Performance")).toBe("lus1-performance");
    expect(normalizeSlugCandidate("Elite PT Hub!!!")).toBe("elite-pt-hub");
  });

  it("strips unsupported characters, emoji, repeated dashes, and trims length", () => {
    const value = normalizeSlugCandidate(
      "  Ahmed 🚀 --- Super_Long Coaching Name With Lots Of Extra Words  ",
      { maxLength: 32 },
    );

    expect(value).toBe("ahmed-super-long-coaching-name");
    expect(value.length).toBeLessThanOrEqual(32);
  });

  it("rejects malformed and reserved slugs for editable canonical routes", () => {
    expect(isReservedSlug("admin")).toBe(true);
    expect(isReservedSlug("pt-hub")).toBe(true);
    expect(() => normalizeSlug("admin")).toThrow(/reserved/i);
    expect(() => normalizeSlug("Bad Slug")).toThrow(/lowercase/i);
    expect(normalizeSlug("nour-coaching")).toBe("nour-coaching");
  });

  it("adds numeric suffixes for duplicate generated slugs", () => {
    const existing = new Set(["nour-coaching", "nour-coaching-2"]);

    expect(buildUniqueSlug("Nour Coaching", existing)).toBe("nour-coaching-3");
  });
});

describe("canonical route builders", () => {
  it("builds PT Hub settings routes", () => {
    expect(routes.ptHub()).toBe("/pt-hub");
    expect(routes.ptHubSettings()).toBe("/pt-hub/settings/account");
    expect(routes.ptHubSettings("public-profile")).toBe(
      "/pt-hub/settings/public-profile",
    );
  });

  it("builds workspace and client routes without UUID-shaped path assumptions", () => {
    expect(routes.workspaceOverview("lus1")).toBe("/w/lus1/overview");
    expect(routes.workspaceClients("lus1")).toBe("/w/lus1/clients");
    expect(routes.clientDetail("lus1", "c-1048")).toBe(
      "/w/lus1/clients/c-1048",
    );
    expect(routes.workspaceSettings("lus1", "client-experience")).toBe(
      "/w/lus1/settings/client-experience",
    );
  });

  it("builds public profile routes", () => {
    expect(routes.publicProfile("nour-coaching")).toBe("/p/nour-coaching");
    expect(routes.publicApply("nour-coaching")).toBe("/p/nour-coaching/apply");
    expect(routes.publicBook("nour-coaching")).toBe("/p/nour-coaching/book");
  });
});

describe("legacy workspace redirect builders", () => {
  it("falls back to compact workspace IDs when a workspace has no editable slug", () => {
    const workspace = {
      id: "4e8237f2-3fed-4912-82dd-d850fa9c7bed",
      slug: null,
    };

    expect(buildLegacyWorkspaceEntryRedirectPath(workspace)).toBe(
      "/w/4e8237f23fed/overview",
    );
    expect(
      buildLegacyWorkspaceSettingsRedirectPath({
        workspace,
        tab: "brand",
        search: "?from=settings",
      }),
    ).toBe("/w/4e8237f23fed/settings/brand?from=settings");
  });
});

import { describe, expect, it } from "vitest";
import { shouldProceedAfterSave } from "../../src/features/settings/hooks/use-dirty-navigation-guard";
import {
  buildPtHubSettingsPath,
  buildWorkspaceSettingsPath,
  mapLegacySettingsRoute,
  ptHubSettingsTabs,
  workspaceSettingsTabs,
} from "../../src/features/settings/lib/settings-route-mapping";

describe("settings route mapping", () => {
  it("defines the expected PT Hub tab routes", () => {
    expect(ptHubSettingsTabs.map((tab) => tab.path)).toEqual([
      "account",
      "notifications",
      "preferences",
      "security",
      "billing",
    ]);
  });

  it("defines the expected workspace tab routes", () => {
    expect(workspaceSettingsTabs.map((tab) => tab.path)).toEqual([
      "general",
      "brand",
      "client-experience",
      "team",
      "defaults",
      "automations",
      "integrations",
      "danger",
    ]);
  });

  it("maps legacy PT Hub sections to new PT Hub settings routes", () => {
    expect(
      mapLegacySettingsRoute({
        section: "account",
        workspaceId: "workspace-1",
      }),
    ).toBe("/pt-hub/settings/account");
    expect(
      mapLegacySettingsRoute({
        section: "public-profile",
        workspaceId: "workspace-1",
      }),
    ).toBe("/pt-hub/profile");
    expect(
      mapLegacySettingsRoute({
        section: "appearance",
        workspaceId: "workspace-1",
      }),
    ).toBe("/pt-hub/settings/preferences");
  });

  it("maps legacy workspace sections to workspace settings routes", () => {
    expect(
      mapLegacySettingsRoute({
        section: "workspace",
        workspaceId: "workspace-1",
      }),
    ).toBe("/workspace/workspace-1/settings/general");
    expect(
      mapLegacySettingsRoute({
        section: "defaults",
        workspaceId: "workspace-1",
      }),
    ).toBe("/workspace/workspace-1/settings/defaults");
    expect(
      mapLegacySettingsRoute({
        section: "danger",
        workspaceId: "workspace-1",
      }),
    ).toBe("/workspace/workspace-1/settings/danger");
  });

  it("falls back safely when workspace ID is missing", () => {
    expect(
      mapLegacySettingsRoute({
        section: "workspace",
        workspaceId: null,
      }),
    ).toBe("/no-workspace");
    expect(
      mapLegacySettingsRoute({
        section: "defaults",
        workspaceId: null,
      }),
    ).toBe("/no-workspace");
  });

  it("builds canonical tab paths", () => {
    expect(buildPtHubSettingsPath("account")).toBe("/pt-hub/settings/account");
    expect(
      buildWorkspaceSettingsPath({
        workspaceId: "workspace-1",
        tab: "general",
      }),
    ).toBe("/workspace/workspace-1/settings/general");
  });
});

describe("dirty navigation decisions", () => {
  it("allows proceed when save succeeds or returns void", () => {
    expect(shouldProceedAfterSave(true)).toBe(true);
    expect(shouldProceedAfterSave(undefined)).toBe(true);
  });

  it("blocks proceed when save explicitly fails", () => {
    expect(shouldProceedAfterSave(false)).toBe(false);
  });
});

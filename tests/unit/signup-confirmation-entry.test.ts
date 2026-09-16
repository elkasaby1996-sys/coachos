// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { beforeEach, expect, it, vi } from "vitest";

beforeEach(() => vi.resetModules());

it("captures and scrubs before telemetry/router/client startup, then transfers once", async () => {
  window.history.replaceState(
    { idx: 0 },
    "",
    "/confirm-signup?next=//evil.example#token_hash=entry-fixture",
  );
  const entry = await import("../../src/lib/signup-confirmation-entry");
  expect(
    window.location.pathname + window.location.search + window.location.hash,
  ).toBe("/confirm-signup");
  expect(window.history.state).toEqual({ idx: 0 });
  expect(entry.takeSignupConfirmationToken()).toBe("entry-fixture");
  expect(entry.takeSignupConfirmationToken()).toBeNull();
  const main = readFileSync("src/main.tsx", "utf8");
  expect(
    main.trimStart().startsWith('import "./lib/signup-confirmation-entry";'),
  ).toBe(true);
});

it("leaves existing callback and recovery URL credentials untouched", async () => {
  const path = "/auth/callback?type=recovery#access_token=callback-fixture";
  window.history.replaceState(null, "", path);
  const entry = await import("../../src/lib/signup-confirmation-entry");
  expect(entry.takeSignupConfirmationToken()).toBeNull();
  expect(
    window.location.pathname + window.location.search + window.location.hash,
  ).toBe(path);
});

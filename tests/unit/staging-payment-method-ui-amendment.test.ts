import {
  mkdtempSync,
  cpSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  rmSync,
  symlinkSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import {
  payloadFingerprint,
  verifyPaymentMethodUiAmendment,
  PAYMENT_METHOD_UI_AMENDMENT,
} from "../../scripts/staging-release-artifacts.mjs";
const directories: string[] = [];
afterEach(() =>
  directories
    .splice(0)
    .forEach((path) => rmSync(path, { recursive: true, force: true })),
);
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "repsync-ui-amendment-"));
  directories.push(root);
  mkdirSync(join(root, "src/features/billing"), { recursive: true });
  for (const path of Object.keys(PAYMENT_METHOD_UI_AMENDMENT))
    cpSync(path, join(root, path));
  return root;
}
const paths = Object.keys(PAYMENT_METHOD_UI_AMENDMENT).sort();
describe("bounded payment-method frontend release amendment", () => {
  it("binds the current real payload and advertises only the two pinned frontend files", () => {
    const payload = payloadFingerprint();
    const ui = payload.amendments.filter((item) => paths.includes(item.path));
    expect(ui.map((item) => item.path)).toEqual(paths);
    expect(payload.records.filter((item) => paths.includes(item.path))).toEqual(
      ui,
    );
  });
  it("rejects arbitrary backend drift and partial amendments", () => {
    const root = fixture();
    expect(() =>
      verifyPaymentMethodUiAmendment(root, [
        ...paths,
        "supabase/functions/billing-update-payment-method/index.ts",
      ]),
    ).toThrow("FROZEN_PAYLOAD_DRIFT");
    expect(() => verifyPaymentMethodUiAmendment(root, [paths[0]])).toThrow(
      "FROZEN_PAYLOAD_DRIFT",
    );
  });
  it("rejects changed contents at an approved path, including a post-check edit", () => {
    const root = fixture();
    verifyPaymentMethodUiAmendment(root, paths);
    writeFileSync(
      join(root, paths[0]),
      readFileSync(join(root, paths[0]), "utf8") + "\n// drift\n",
    );
    expect(() => verifyPaymentMethodUiAmendment(root, paths)).toThrow(
      "FROZEN_PAYLOAD_DRIFT",
    );
  });
  it("rejects symlinks even with matching approved contents", () => {
    const root = fixture();
    const path = join(root, paths[0]);
    const target = join(root, "copy.tsx");
    cpSync(path, target);
    rmSync(path);
    symlinkSync(target, path);
    expect(() => verifyPaymentMethodUiAmendment(root, paths)).toThrow(
      "RELEASE_SYMLINK_REJECTED",
    );
  });
});

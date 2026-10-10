import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
  readdirSync,
  symlinkSync,
  renameSync,
  statSync,
  existsSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import {
  withPrivateBaselineDelivery,
  PRIVATE_BASELINE_MAX_BYTES,
} from "../../scripts/staging-bootstrap-delivery.mjs";
import {
  captureFixture,
  captureContext,
  captureClock,
} from "../helpers/staging-capture-fixture";
import { releaseIdentity } from "../../scripts/staging-release-artifacts.mjs";
import { replacementPolicy } from "../../scripts/staging-replacement-target.mjs";
import { bootstrapBinding } from "../../scripts/staging-bootstrap-contracts.mjs";
import {
  timingTestReviewPolicy,
  signBaselineFixture,
} from "../helpers/staging-timing-fixture";
import { evidenceDigest } from "../../scripts/staging-release-webhook-history.mjs";
import { hash } from "../../scripts/billing-retirement-release.mjs";
import { readBaselineEvidence } from "../../scripts/staging-bootstrap-baseline.mjs";
import { founderFixture } from "../helpers/staging-founder-fixture";

const redirected = vi.hoisted(() => ({
  root: "",
  descriptors: new Set<number>(),
  unlinkFailure: false,
}));
vi.mock("node:fs", async (original) => {
  const fs = await original<typeof import("node:fs")>();
  return {
    ...fs,
    openSync: (...args: Parameters<typeof fs.openSync>) => {
      const fd = fs.openSync(...args);
      if (redirected.root && String(args[0]).startsWith(redirected.root))
        redirected.descriptors.add(fd);
      return fd;
    },
    closeSync: (fd: number) => {
      fs.closeSync(fd);
      redirected.descriptors.delete(fd);
    },
    unlinkSync: (...args: Parameters<typeof fs.unlinkSync>) => {
      if (redirected.unlinkFailure && String(args[0]).endsWith(".json")) {
        redirected.unlinkFailure = false;
        throw Error("PRIVATE_ERROR_CONTAINING_EVIDENCE_PATH");
      }
      return fs.unlinkSync(...args);
    },
  };
});
vi.mock("node:url", async (original) => {
  const url = await original<typeof import("node:url")>();
  return {
    ...url,
    fileURLToPath: (...args: Parameters<typeof url.fileURLToPath>) => {
      const path = url.fileURLToPath(...args);
      if (redirected.root && resolve(path) === resolve(process.cwd()))
        return redirected.root;
      if (
        redirected.root &&
        path.endsWith(captureContext.project + ".json") &&
        path.includes("bootstrap-baselines")
      )
        return join(
          redirected.root,
          "output/staging-release/bootstrap-baselines",
          captureContext.project + ".json",
        );
      return path;
    },
  };
});

let identity: any;
const roots: string[] = [];
const contracts = JSON.parse(
  readFileSync("config/staging-release-checkpoints.json", "utf8"),
);
beforeAll(() => {
  identity = releaseIdentity();
}, 30_000);
afterEach(() => {
  expect(redirected.descriptors.size).toBe(0);
  redirected.root = "";
  redirected.unlinkFailure = false;
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});
function fixture() {
  const h = captureFixture(identity);
  const root = mkdtempSync(join(tmpdir(), "baseline-delivery-test-"));
  roots.push(root);
  redirected.root = root;
  const options: any = {
    root,
    identity,
    contracts,
    context: { ...captureContext },
    workflowStartedAt: new Date(captureClock - 1000).toISOString(),
    authorization: {
      schemaVersion: 2,
      phase: "EMPTY_TO_180",
      executionCommit: captureContext.commit,
      bindingDigest: evidenceDigest(
        bootstrapBinding(
          identity,
          captureContext,
          replacementPolicy(),
          contracts,
          h.baseline,
        ),
      ),
      baselineEvidenceSha256: evidenceDigest(h.baseline),
      inventoryDigest: "a".repeat(64),
      inventoryObservedAt: new Date(captureClock).toISOString(),
      createdAt: new Date(captureClock).toISOString(),
      expiresAt: new Date(captureClock + 10 * 60_000).toISOString(),
      operational: {
        newlyCreatedEmptyProject: true,
        noImportedHistory: true,
        clientsExcluded: true,
        providerIngressExcluded: true,
        manualWritersExcluded: true,
        backgroundWritersExcluded: true,
        noManagedSchemaCustomizationSinceProjectCreation: true,
        quietWindowEndsAt: new Date(captureClock + 31 * 60_000).toISOString(),
      },
    },
  };
  let bytes = Buffer.from(JSON.stringify(h.baseline));
  const bind = () => {
    bytes = Buffer.from(JSON.stringify(h.baseline));
    options.authorization.bindingDigest = evidenceDigest(
      bootstrapBinding(
        identity,
        captureContext,
        replacementPolicy(),
        contracts,
        h.baseline,
      ),
    );
    options.authorization.baselineEvidenceSha256 = evidenceDigest(h.baseline);
    options.delivery = {
      schemaVersion: 1,
      project: captureContext.project,
      organization: captureContext.organization,
      origin: captureContext.origin,
      executionCommit: captureContext.commit,
      executionTree: captureContext.tree,
      baselineEvidenceSha256: evidenceDigest(h.baseline),
      fileSha256: hash(bytes),
    };
  };
  bind();
  const consume = vi.fn(async () => {
    const installed = readBaselineEvidence(captureContext.project);
    expect(installed).toEqual(h.baseline);
    return "consumed";
  });
  const deps: any = {
    root,
    now: () => captureClock,
    reviewPolicy: timingTestReviewPolicy,
    receive: vi.fn(async () => bytes),
    // Windows does not have /proc directory descriptors or Unix permission
    // enforcement. Only those two Linux primitives are mocked; all remaining
    // filesystem operations, signatures, digests and authorization gates execute.
    assertPrivateDirectory: vi.fn(),
    descriptorDirectory: (_fd: number, path: string) => path,
  };
  const directory = () =>
    join(root, "output/staging-release/bootstrap-baselines");
  const target = () => join(directory(), `${captureContext.project}.json`);
  return {
    ...h,
    options,
    deps,
    consume,
    bind,
    directory,
    target,
    bytes: () => bytes,
  };
}
describe("private baseline delivery boundary", () => {
  it("delivers only a v2 founder descriptor with scoped action and signed v3 evidence", async () => {
    const h = fixture(),
      f = founderFixture(captureContext, captureClock);
    h.baseline = Object.assign(h.baseline, f.baseline(h.baseline, identity));
    h.options.context = f.context;
    h.options.mode = "preflight";
    h.bind();
    h.options.authorization.bindingDigest = evidenceDigest(
      bootstrapBinding(
        identity,
        f.context,
        replacementPolicy(),
        contracts,
        h.baseline,
      ),
    );
    h.options.actionEnvelope = f.action({
      ...h.options,
      phase: "EMPTY_TO_180",
    });
    h.options.workflow = h.options.actionEnvelope.workflow;
    h.options.delivery = {
      ...h.options.delivery,
      schemaVersion: 2,
      governanceMode: f.context.governanceMode,
      governancePolicyDigest: evidenceDigest(f.policy),
      actionEnvelopeDigest: evidenceDigest(h.options.actionEnvelope),
    };
    const result = await withPrivateBaselineDelivery(h.options, h.consume, {
      ...h.deps,
      ...f.deps,
    });
    expect(result).toBe("consumed");
    expect(existsSync(h.target())).toBe(false);
    h.options.delivery.schemaVersion = 1;
    await expect(
      withPrivateBaselineDelivery(h.options, h.consume, {
        ...h.deps,
        ...f.deps,
      }),
    ).rejects.toThrow("PRIVATE_BASELINE_DELIVERY_INVALID");
  });
  it("atomically installs only exact approved bytes for the existing consumer and removes them", async () => {
    const h = fixture();
    expect(
      await withPrivateBaselineDelivery(h.options, h.consume, h.deps),
    ).toBe("consumed");
    expect(h.consume).toHaveBeenCalledTimes(1);
    expect(h.deps.receive).toHaveBeenCalledWith(
      expect.objectContaining({
        project: captureContext.project,
        fileSha256: h.options.delivery.fileSha256,
        maxBytes: PRIVATE_BASELINE_MAX_BYTES,
      }),
    );
    if (existsSync(h.directory()))
      expect(readdirSync(h.directory())).toEqual([]);
  });
  it("removes its runner copies even when the consumer throws", async () => {
    const h = fixture();
    h.consume.mockRejectedValueOnce(Error("PRIVATE_RAW_PROVIDER_RESPONSE"));
    await expect(
      withPrivateBaselineDelivery(h.options, h.consume, h.deps),
    ).rejects.toThrow("PRIVATE_BASELINE_DELIVERY_FAILED");
    if (existsSync(h.directory()))
      expect(readdirSync(h.directory())).toEqual([]);
  });
  it("has no operational provider or accidental network fallback", async () => {
    const h = fixture();
    delete h.deps.receive;
    await expect(
      withPrivateBaselineDelivery(h.options, h.consume, h.deps),
    ).rejects.toThrow("PRIVATE_BASELINE_DELIVERY_UNCONFIGURED");
    expect(readdirSync(h.options.root)).toEqual([]);
    expect(h.consume).not.toHaveBeenCalled();
  });
  it("does not pretend Unix mode bits prove Windows privacy", async () => {
    if (process.platform !== "win32") return;
    const h = fixture();
    delete h.deps.assertPrivateDirectory;
    delete h.deps.descriptorDirectory;
    await expect(
      withPrivateBaselineDelivery(h.options, h.consume, h.deps),
    ).rejects.toThrow("PRIVATE_BASELINE_PLATFORM_UNSUPPORTED");
    expect(h.deps.receive).not.toHaveBeenCalled();
  });
  it.each([
    [
      "wrong org",
      (h: any) => (h.options.delivery.organization = "wrong"),
      "PRIVATE_BASELINE_DELIVERY_INVALID",
    ],
    [
      "wrong source",
      (h: any) => (h.options.delivery.executionCommit = "f".repeat(40)),
      "PRIVATE_BASELINE_DELIVERY_BINDING",
    ],
    [
      "traversal",
      (h: any) => (h.options.delivery.project = "../escape"),
      "PRIVATE_BASELINE_DELIVERY_INVALID",
    ],
    [
      "arbitrary URL",
      (h: any) => (h.options.delivery.url = "https://untrusted.example"),
      "PRIVATE_BASELINE_DELIVERY_INVALID",
    ],
    [
      "production",
      (h: any) =>
        (h.options.context.project = captureContext.productionProject),
      "REPLACEMENT_TARGET_DENIED",
    ],
    [
      "archived",
      (h: any) => (h.options.context.project = "dgogugyuyfourdttvwuy"),
      "REPLACEMENT_TARGET_DENIED",
    ],
    [
      "wrong origin",
      (h: any) => (h.options.context.origin = "https://untrusted.example"),
      "REPLACEMENT_TARGET_MISMATCH",
    ],
  ])("rejects %s before delivery", async (_, change: any, category) => {
    const h = fixture();
    change(h);
    await expect(
      withPrivateBaselineDelivery(h.options, h.consume, h.deps),
    ).rejects.toThrow(category);
    expect(h.deps.receive).not.toHaveBeenCalled();
    expect(h.consume).not.toHaveBeenCalled();
  });
  it.each([
    [
      "tampered bytes",
      (h: any) => h.deps.receive.mockResolvedValue(Buffer.from("{}")),
      "PRIVATE_BASELINE_FILE_DIGEST_MISMATCH",
    ],
    [
      "empty",
      (h: any) => h.deps.receive.mockResolvedValue(Buffer.alloc(0)),
      "PRIVATE_BASELINE_SIZE_INVALID",
    ],
    [
      "oversized",
      (h: any) =>
        h.deps.receive.mockResolvedValue(
          Buffer.alloc(PRIVATE_BASELINE_MAX_BYTES + 1),
        ),
      "PRIVATE_BASELINE_SIZE_INVALID",
    ],
    [
      "missing",
      (h: any) => h.deps.receive.mockResolvedValue(undefined),
      "PRIVATE_BASELINE_SIZE_INVALID",
    ],
    [
      "transport failure",
      (h: any) =>
        h.deps.receive.mockRejectedValue(Error("PRIVATE_TOKEN_OR_URL")),
      "PRIVATE_BASELINE_DELIVERY_FAILED",
    ],
    [
      "expired authorization",
      (h: any) =>
        (h.options.authorization.expiresAt = new Date(
          captureClock,
        ).toISOString()),
      "PRIVATE_BASELINE_AUTHORIZATION_EXPIRED",
    ],
    [
      "workflow deadline",
      (h: any) =>
        (h.options.workflowStartedAt = new Date(
          captureClock - 45 * 60_000,
        ).toISOString()),
      "PRIVATE_BASELINE_WORKFLOW_EXPIRED",
    ],
    [
      "old schema",
      (h: any) => {
        h.baseline.schemaVersion = 1;
        h.bind();
      },
      "BOOTSTRAP_BASELINE_INVALID",
    ],
    [
      "old domain",
      (h: any) => {
        signBaselineFixture(h.baseline, "repsync-staging-virgin-baseline/v1");
        h.bind();
      },
      "BOOTSTRAP_BASELINE_REVIEW_REQUIRED",
    ],
    [
      "unknown key",
      (h: any) =>
        (h.deps.reviewPolicy = () => ({ schemaVersion: 1, reviewKeys: [] })),
      "BOOTSTRAP_BASELINE_REVIEW_REQUIRED",
    ],
    [
      "unsigned",
      (h: any) => {
        delete h.baseline.review;
        h.bind();
      },
      "BOOTSTRAP_BASELINE_INVALID",
    ],
    [
      "expired baseline",
      (h: any) => {
        h.baseline.capture.expiresAt = new Date(captureClock).toISOString();
        signBaselineFixture(h.baseline);
        h.bind();
      },
      "BOOTSTRAP_BASELINE_STALE",
    ],
  ])("rejects %s without consumption", async (_, change: any, category) => {
    const h = fixture();
    change(h);
    await expect(
      withPrivateBaselineDelivery(h.options, h.consume, h.deps),
    ).rejects.toThrow(category);
    expect(h.consume).not.toHaveBeenCalled();
    if (existsSync(h.directory()))
      expect(readdirSync(h.directory())).toEqual([]);
  });
  it("rejects pre-existing evidence without overwrite", async () => {
    const h = fixture();
    await withPrivateBaselineDelivery(h.options, async () => {}, h.deps);
    writeFileSync(h.target(), "retained evidence");
    await expect(
      withPrivateBaselineDelivery(h.options, h.consume, h.deps),
    ).rejects.toThrow("PRIVATE_BASELINE_ALREADY_PRESENT");
    expect(readFileSync(h.target(), "utf8")).toBe("retained evidence");
    expect(h.consume).not.toHaveBeenCalled();
  });
  it("rejects a destination symlink without following or overwriting it", async () => {
    const h = fixture();
    await withPrivateBaselineDelivery(h.options, async () => {}, h.deps);
    const elsewhere = join(h.options.root, "elsewhere.json");
    writeFileSync(elsewhere, "unchanged");
    symlinkSync(elsewhere, h.target(), "file");
    await expect(
      withPrivateBaselineDelivery(h.options, h.consume, h.deps),
    ).rejects.toThrow("PRIVATE_BASELINE_ALREADY_PRESENT");
    expect(readFileSync(elsewhere, "utf8")).toBe("unchanged");
    expect(h.consume).not.toHaveBeenCalled();
  });
  it("detects replacement during consumption, closes handles and preserves replacement", async () => {
    const h = fixture();
    h.consume.mockImplementationOnce(async () => {
      renameSync(h.target(), h.target() + ".original");
      writeFileSync(h.target(), "replacement");
      return "unsafe success";
    });
    await expect(
      withPrivateBaselineDelivery(h.options, h.consume, h.deps),
    ).rejects.toThrow("PRIVATE_BASELINE_CLEANUP_IDENTITY_CHANGED");
    expect(readFileSync(h.target(), "utf8")).toBe("replacement");
    // The intentionally displaced original is caller-created in this test; no
    // automatic deletion or repair of an unknown replacement is attempted.
    expect(
      readdirSync(h.directory()).filter((p) => p.startsWith(".delivery-")),
    ).toEqual([]);
    expect(statSync(h.target() + ".original").isFile()).toBe(true);
  });
  it("rejects an ancestor junction before transport", async () => {
    const h = fixture();
    await withPrivateBaselineDelivery(h.options, async () => {}, h.deps);
    const output = join(h.options.root, "output");
    renameSync(output, output + ".original");
    symlinkSync(output + ".original", output, "junction");
    h.deps.receive.mockClear();
    await expect(
      withPrivateBaselineDelivery(h.options, h.consume, h.deps),
    ).rejects.toThrow("RELEASE_SYMLINK_REJECTED");
    expect(h.deps.receive).not.toHaveBeenCalled();
    expect(h.consume).not.toHaveBeenCalled();
  });
  it("does not overwrite a file introduced during retrieval", async () => {
    const h = fixture();
    h.deps.receive.mockImplementationOnce(async () => {
      writeFileSync(h.target(), "unreviewed");
      return h.bytes();
    });
    await expect(
      withPrivateBaselineDelivery(h.options, h.consume, h.deps),
    ).rejects.toThrow("PRIVATE_BASELINE_ALREADY_PRESENT");
    expect(readFileSync(h.target(), "utf8")).toBe("unreviewed");
    expect(h.consume).not.toHaveBeenCalled();
  });
  it("bounds a transport that ignores abort instead of retrying", async () => {
    const h = fixture();
    h.options.authorization.expiresAt = new Date(
      captureClock + 20,
    ).toISOString();
    h.deps.receive.mockImplementationOnce(() => new Promise(() => {}));
    await expect(
      withPrivateBaselineDelivery(h.options, h.consume, h.deps),
    ).rejects.toThrow("PRIVATE_BASELINE_DELIVERY_TIMEOUT");
    expect(h.deps.receive).toHaveBeenCalledTimes(1);
    expect(h.consume).not.toHaveBeenCalled();
    expect(readdirSync(h.directory())).toEqual([]);
  });
  it("rejects a directory replacement during retrieval before writing evidence", async () => {
    const h = fixture();
    h.deps.receive.mockImplementationOnce(async () => {
      renameSync(h.directory(), h.directory() + ".original");
      // Leave the original spelling missing: both pathname containment and inode
      // validation must stop before any temporary file is installed.
      return h.bytes();
    });
    await expect(
      withPrivateBaselineDelivery(h.options, h.consume, h.deps),
    ).rejects.toThrow("PRIVATE_BASELINE_DELIVERY_FAILED");
    expect(h.consume).not.toHaveBeenCalled();
    expect(readdirSync(h.directory() + ".original")).toEqual([]);
  });
  it("rejects a copied, freshly signed baseline from a different project", async () => {
    const h = fixture();
    h.baseline.target.project = "x".repeat(20);
    signBaselineFixture(h.baseline);
    h.bind();
    await expect(
      withPrivateBaselineDelivery(h.options, h.consume, h.deps),
    ).rejects.toThrow("BOOTSTRAP_BASELINE_BINDING");
    expect(h.consume).not.toHaveBeenCalled();
  });
  it("sanitizes cleanup failures and still closes all descriptors", async () => {
    const h = fixture();
    redirected.unlinkFailure = true;
    await expect(
      withPrivateBaselineDelivery(h.options, h.consume, h.deps),
    ).rejects.toThrow("PRIVATE_BASELINE_CLEANUP_FAILED");
    expect(redirected.descriptors.size).toBe(0);
    expect(readdirSync(h.directory())).toEqual([
      captureContext.project + ".json",
    ]);
  });
  it("includes final file cleanup in the original workflow clock", async () => {
    const h = fixture();
    let post = false,
      calls = 0;
    h.deps.now = () =>
      post && ++calls > 3 ? captureClock + 45 * 60_000 : captureClock;
    h.consume.mockImplementationOnce(async () => {
      post = true;
      return "consumed";
    });
    await expect(
      withPrivateBaselineDelivery(h.options, h.consume, h.deps),
    ).rejects.toThrow("PRIVATE_BASELINE_WORKFLOW_EXPIRED");
    expect(readdirSync(h.directory())).toEqual([]);
  });
});

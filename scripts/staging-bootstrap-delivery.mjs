// Private ephemeral handoff only. There is deliberately no configured provider,
// URL input, credential lookup, operational signer or workflow integration.
import {
  constants,
  openSync,
  closeSync,
  fstatSync,
  lstatSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  fsyncSync,
  linkSync,
  unlinkSync,
  existsSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { ensure, verifyPathBoundary } from "./staging-release-artifacts.mjs";
import { hash } from "./billing-retirement-release.mjs";
import { evidenceDigest } from "./staging-release-webhook-history.mjs";
import { CAPTURE_ORGANIZATION } from "./staging-bootstrap-observation.mjs";
import {
  replacementPolicy,
  assertReplacementTarget,
} from "./staging-replacement-target.mjs";
import { validateBootstrapAuthorization } from "./staging-bootstrap-contracts.mjs";
import { timingReviewPolicy } from "./staging-timing-evidence.mjs";

const digest = z.string().regex(/^[a-f0-9]{64}$/);
const deliverySchema = z.strictObject({
  schemaVersion: z.literal(1),
  project: z.string().regex(/^[a-z]{20}$/),
  organization: z.literal(CAPTURE_ORGANIZATION),
  origin: z.string().url(),
  executionCommit: z.string().regex(/^[a-f0-9]{40}$/),
  executionTree: z.string().regex(/^[a-f0-9]{40}$/),
  baselineEvidenceSha256: digest,
  fileSha256: digest,
});
export const PRIVATE_BASELINE_MAX_BYTES = 32 * 1024 * 1024;
const same = (a, b) => a.dev === b.dev && a.ino === b.ino;
const absent = (path) => {
  try {
    lstatSync(path);
    return false;
  } catch (e) {
    if (e.code === "ENOENT") return true;
    throw e;
  }
};
function assertPrivateDirectory(path) {
  // GitHub's protected runner is Linux. Unix mode bits do not establish NTFS
  // ACL privacy, and pathname-only operations are not a safe fallback.
  ensure(process.platform === "linux", "PRIVATE_BASELINE_PLATFORM_UNSUPPORTED");
  const s = lstatSync(path);
  ensure(
    s.isDirectory() &&
      !s.isSymbolicLink() &&
      s.uid === process.getuid() &&
      (s.mode & 0o077) === 0,
    "PRIVATE_BASELINE_DIRECTORY_UNSAFE",
  );
}

export async function withPrivateBaselineDelivery(
  options,
  consume,
  dependencies = {},
) {
  const {
    identity,
    context,
    contracts,
    authorization,
    delivery,
    workflowStartedAt,
  } = options;
  const root = resolve(
    dependencies.root ?? fileURLToPath(new URL("../", import.meta.url)),
  );
  const policy = replacementPolicy();
  assertReplacementTarget(context.project, context.origin, policy, true);
  const parsed = deliverySchema.safeParse(delivery);
  ensure(parsed.success, "PRIVATE_BASELINE_DELIVERY_INVALID");
  const d = parsed.data;
  ensure(
    d.project === context.project &&
      d.origin === context.origin &&
      d.executionCommit === context.commit &&
      d.executionTree === context.tree &&
      d.baselineEvidenceSha256 === authorization?.baselineEvidenceSha256,
    "PRIVATE_BASELINE_DELIVERY_BINDING",
  );
  // An adapter must be trusted implementation supplied by a separately reviewed
  // integration, with independently authenticated private storage. Candidate
  // data, a claimed authenticated flag, or an arbitrary URL cannot select it.
  ensure(
    typeof dependencies.receive === "function",
    "PRIVATE_BASELINE_DELIVERY_UNCONFIGURED",
  );
  const now = dependencies.now ?? Date.now;
  const workflowStart = Date.parse(workflowStartedAt);
  const fresh = () => {
    const elapsed = now() - workflowStart;
    ensure(
      Number.isFinite(elapsed) && elapsed >= 0 && elapsed < 45 * 60_000,
      "PRIVATE_BASELINE_WORKFLOW_EXPIRED",
    );
    ensure(
      now() < Date.parse(authorization?.expiresAt),
      "PRIVATE_BASELINE_AUTHORIZATION_EXPIRED",
    );
    return Math.min(
      30_000,
      45 * 60_000 - elapsed,
      Date.parse(authorization.expiresAt) - now(),
    );
  };
  const directory = join(
    root,
    "output",
    "staging-release",
    "bootstrap-baselines",
  );
  let directoryFd,
    fileFd,
    temporary,
    installed = false,
    succeeded = false,
    opened;
  try {
    ensure(
      process.platform === "linux" ||
        typeof dependencies.assertPrivateDirectory === "function",
      "PRIVATE_BASELINE_PLATFORM_UNSUPPORTED",
    );
    ensure(
      process.platform !== "linux" ||
        (constants.O_DIRECTORY && constants.O_NOFOLLOW && constants.O_NONBLOCK),
      "PRIVATE_BASELINE_PLATFORM_UNSUPPORTED",
    );
    fresh();
    // Each mkdir/open is anchored to the already validated parent descriptor.
    // Production never falls back from /proc to mutable ancestor pathnames.
    verifyPathBoundary(root, root);
    let current = root;
    const descriptorPath = (fd, path) =>
      dependencies.descriptorDirectory
        ? dependencies.descriptorDirectory(fd, path)
        : `/proc/self/fd/${fd}`;
    const openDirectory = (path) =>
      openSync(
        path,
        constants.O_RDONLY |
          (constants.O_DIRECTORY ?? 0) |
          (constants.O_NOFOLLOW ?? 0),
      );
    directoryFd = openDirectory(root);
    ensure(
      fstatSync(directoryFd).isDirectory() &&
        same(
          fstatSync(directoryFd, { bigint: true }),
          lstatSync(root, { bigint: true }),
        ),
      "PRIVATE_BASELINE_DIRECTORY_CHANGED",
    );
    for (const part of ["output", "staging-release", "bootstrap-baselines"]) {
      const bound = join(descriptorPath(directoryFd, current), part);
      const child = join(current, part);
      verifyPathBoundary(root, current);
      if (absent(bound)) mkdirSync(bound, { mode: 0o700 });
      verifyPathBoundary(root, child);
      const next = openDirectory(bound);
      try {
        ensure(
          fstatSync(next).isDirectory() &&
            same(
              fstatSync(next, { bigint: true }),
              lstatSync(child, { bigint: true }),
            ),
          "PRIVATE_BASELINE_DIRECTORY_CHANGED",
        );
      } catch (e) {
        closeSync(next);
        throw e;
      }
      closeSync(directoryFd);
      directoryFd = next;
      current = child;
    }
    (dependencies.assertPrivateDirectory ?? assertPrivateDirectory)(directory);
    const target = join(directory, `${context.project}.json`);
    ensure(absent(target), "PRIVATE_BASELINE_ALREADY_PRESENT");
    const directoryIdentity = fstatSync(directoryFd, { bigint: true });
    ensure(
      directoryIdentity.isDirectory() &&
        same(directoryIdentity, lstatSync(directory, { bigint: true })),
      "PRIVATE_BASELINE_DIRECTORY_CHANGED",
    );
    const anchor = dependencies.descriptorDirectory
      ? dependencies.descriptorDirectory(directoryFd, directory)
      : `/proc/self/fd/${directoryFd}`;
    const verifyDirectory = () => {
      verifyPathBoundary(root, directory);
      ensure(
        same(directoryIdentity, lstatSync(directory, { bigint: true })),
        "PRIVATE_BASELINE_DIRECTORY_CHANGED",
      );
    };
    const boundTarget = join(anchor, `${context.project}.json`);
    const signal = AbortSignal.timeout(Math.max(1, fresh()));
    let abort;
    let bytes;
    try {
      bytes = await Promise.race([
        Promise.resolve().then(() =>
          dependencies.receive({
            project: context.project,
            fileSha256: d.fileSha256,
            maxBytes: PRIVATE_BASELINE_MAX_BYTES,
            signal,
          }),
        ),
        new Promise((_, reject) => {
          abort = () => reject(new Error("PRIVATE_BASELINE_DELIVERY_TIMEOUT"));
          signal.addEventListener("abort", abort, { once: true });
        }),
      ]);
    } finally {
      signal.removeEventListener("abort", abort);
    }
    fresh();
    ensure(
      Buffer.isBuffer(bytes) &&
        bytes.length > 0 &&
        bytes.length <= PRIVATE_BASELINE_MAX_BYTES,
      "PRIVATE_BASELINE_SIZE_INVALID",
    );
    ensure(
      hash(bytes) === d.fileSha256,
      "PRIVATE_BASELINE_FILE_DIGEST_MISMATCH",
    );
    let baseline;
    try {
      baseline = JSON.parse(bytes.toString("utf8"));
    } catch {
      throw new Error("PRIVATE_BASELINE_JSON_INVALID");
    }
    ensure(
      baseline.target?.organization === CAPTURE_ORGANIZATION &&
        evidenceDigest(baseline) === d.baselineEvidenceSha256,
      "PRIVATE_BASELINE_EVIDENCE_BINDING",
    );
    const validate = () =>
      validateBootstrapAuthorization(
        authorization,
        identity,
        context,
        policy,
        contracts,
        now(),
        baseline,
        (dependencies.reviewPolicy ?? timingReviewPolicy)(),
      );
    validate();
    fresh();
    verifyDirectory();
    ensure(absent(boundTarget), "PRIVATE_BASELINE_ALREADY_PRESENT");
    temporary = join(anchor, `.delivery-${randomUUID()}.tmp`);
    fileFd = openSync(
      temporary,
      constants.O_RDWR |
        constants.O_CREAT |
        constants.O_EXCL |
        (constants.O_NOFOLLOW ?? 0) |
        (constants.O_NONBLOCK ?? 0),
      0o600,
    );
    writeFileSync(fileFd, bytes);
    fsyncSync(fileFd);
    opened = fstatSync(fileFd, { bigint: true });
    ensure(
      opened.isFile() &&
        (process.platform !== "linux" ||
          ((opened.mode & 0o077n) === 0n &&
            opened.uid === BigInt(process.getuid()))) &&
        opened.size === BigInt(bytes.length) &&
        same(opened, lstatSync(temporary, { bigint: true })),
      "PRIVATE_BASELINE_FILE_UNSAFE",
    );
    // Hard-link installation is atomic and fails if ANY destination exists.
    // Directory-descriptor anchoring prevents an ancestor swap redirecting writes.
    linkSync(temporary, boundTarget);
    installed = true;
    const verifyFile = () => {
      verifyDirectory();
      const fd = openSync(
        boundTarget,
        constants.O_RDONLY |
          (constants.O_NOFOLLOW ?? 0) |
          (constants.O_NONBLOCK ?? 0),
      );
      try {
        const pathStat = lstatSync(boundTarget, { bigint: true });
        const actual = fstatSync(fd, { bigint: true });
        ensure(
          pathStat.isFile() &&
            !pathStat.isSymbolicLink() &&
            same(opened, pathStat) &&
            same(opened, actual) &&
            actual.size === opened.size &&
            hash(readFileSync(fd)) === d.fileSha256,
          "PRIVATE_BASELINE_FILE_UNSAFE",
        );
      } finally {
        closeSync(fd);
      }
    };
    verifyFile();
    validate();
    fresh();
    const result = await consume();
    verifyFile();
    fresh();
    succeeded = true;
    return result;
  } catch (e) {
    // No provider response, raw evidence, URL, token or filesystem path in errors.
    if (
      /^(PRIVATE_BASELINE_|BOOTSTRAP_|TIMING_|RELEASE_|ARTIFACT_)[A-Z_]+$/.test(
        e.message,
      )
    )
      throw e;
    throw new Error("PRIVATE_BASELINE_DELIVERY_FAILED");
  } finally {
    // Remove only the inode this invocation installed, never a replacement.
    let cleanupError;
    try {
      if (installed) {
        const path = join(
          dependencies.descriptorDirectory
            ? dependencies.descriptorDirectory(directoryFd, directory)
            : `/proc/self/fd/${directoryFd}`,
          `${context.project}.json`,
        );
        if (!absent(path)) {
          ensure(
            same(opened, lstatSync(path, { bigint: true })),
            "PRIVATE_BASELINE_CLEANUP_IDENTITY_CHANGED",
          );
          unlinkSync(path);
        }
      }
    } catch (e) {
      cleanupError = e;
    }
    try {
      if (temporary && fileFd !== undefined && existsSync(temporary)) {
        ensure(
          same(
            fstatSync(fileFd, { bigint: true }),
            lstatSync(temporary, { bigint: true }),
          ),
          "PRIVATE_BASELINE_CLEANUP_IDENTITY_CHANGED",
        );
        unlinkSync(temporary);
      }
    } catch (e) {
      cleanupError ??= e;
    }
    try {
      if (fileFd !== undefined) closeSync(fileFd);
    } catch (e) {
      cleanupError ??= e;
    }
    try {
      if (directoryFd !== undefined) closeSync(directoryFd);
    } catch (e) {
      cleanupError ??= e;
    }
    if (cleanupError)
      throw new Error(
        cleanupError.message === "PRIVATE_BASELINE_CLEANUP_IDENTITY_CHANGED"
          ? cleanupError.message
          : "PRIVATE_BASELINE_CLEANUP_FAILED",
      );
    if (succeeded) fresh();
  }
}

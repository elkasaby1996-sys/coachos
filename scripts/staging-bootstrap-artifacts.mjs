import {
  readFileSync,
  readdirSync,
  mkdirSync,
  mkdtempSync,
  writeFileSync,
  rmSync,
  lstatSync,
  openSync,
  fstatSync,
  closeSync,
  constants,
} from "node:fs";
import { join, dirname, resolve } from "node:path";
import { tmpdir } from "node:os";
import {
  ensure,
  verifyPathBoundary,
  releaseIdentity,
} from "./staging-release-artifacts.mjs";
import { hash } from "./billing-retirement-release.mjs";
import { evidenceDigest } from "./staging-release-webhook-history.mjs";

export const BOOTSTRAP_PHASE = "EMPTY_TO_180";
export const BOOTSTRAP_TARGET = 180;
function readBootstrapFile(root, path) {
  verifyPathBoundary(root, path);
  const fd = openSync(
    path,
    constants.O_RDONLY |
      (constants.O_NOFOLLOW ?? 0) |
      (constants.O_NONBLOCK ?? 0),
  );
  try {
    verifyPathBoundary(root, path);
    const opened = fstatSync(fd, { bigint: true });
    const current = lstatSync(path, { bigint: true });
    ensure(
      opened.isFile() &&
        current.isFile() &&
        opened.dev === current.dev &&
        opened.ino === current.ino,
      "BOOTSTRAP_ARTIFACT_INVALID",
    );
    // Check and consume the same opened file, even if its name is replaced.
    return readFileSync(fd);
  } finally {
    closeSync(fd);
  }
}
export function bootstrapArtifact(identity, phase = BOOTSTRAP_PHASE) {
  ensure(phase === BOOTSTRAP_PHASE, "BOOTSTRAP_PHASE_INVALID");
  const migrations = identity.manifest.migrations.approved.slice(
    0,
    BOOTSTRAP_TARGET,
  );
  ensure(
    identity.manifest.migrations.approved.length === 186 &&
      migrations.length === 180,
    "BOOTSTRAP_MANIFEST_INVALID",
  );
  const configurationSha256 = identity.payload.records.find(
    (r) => r.path === "supabase/config.toml",
  ).sha256;
  const value = {
    phase,
    target: BOOTSTRAP_TARGET,
    migrations,
    configurationSha256,
  };
  return { ...value, digest: evidenceDigest(value) };
}
export function verifyBootstrapDirectory(directory, artifact) {
  ensure(
    artifact.phase === BOOTSTRAP_PHASE &&
      artifact.target === 180 &&
      artifact.migrations.length === 180,
    "BOOTSTRAP_ARTIFACT_INVALID",
  );
  const base = join(directory, "supabase/migrations");
  verifyPathBoundary(directory, base);
  const migrations = readdirSync(base)
    .sort()
    .map((filename) => {
      const path = join(base, filename);
      return {
        filename,
        sha256: hash(
          readBootstrapFile(directory, path)
            .toString("utf8")
            .replace(/\r\n/g, "\n"),
        ),
      };
    });
  const config = join(directory, "supabase/config.toml");
  const value = {
    phase: BOOTSTRAP_PHASE,
    target: 180,
    migrations,
    configurationSha256: hash(
      readBootstrapFile(directory, config)
        .toString("utf8")
        .replace(/\r\n/g, "\n"),
    ),
  };
  ensure(
    evidenceDigest(value) === artifact.digest &&
      evidenceDigest(migrations) === evidenceDigest(artifact.migrations),
    "BOOTSTRAP_ARTIFACT_DRIFT",
  );
}
export function disposableBootstrap(root, identity) {
  ensure(
    evidenceDigest(releaseIdentity(root)) === evidenceDigest(identity),
    "BOOTSTRAP_SOURCE_DRIFT",
  );
  const directory = mkdtempSync(join(tmpdir(), "repsync-bootstrap-"));
  const cleanup = () => {
    ensure(
      dirname(resolve(directory)) === resolve(tmpdir()),
      "BOOTSTRAP_CLEANUP_BOUNDARY",
    );
    verifyPathBoundary(tmpdir(), directory);
    rmSync(directory, { recursive: true, force: true });
  };
  try {
    const artifact = bootstrapArtifact(identity);
    mkdirSync(join(directory, "supabase/migrations"), { recursive: true });
    for (const relative of [
      "supabase/config.toml",
      ...artifact.migrations.map((m) => `supabase/migrations/${m.filename}`),
    ]) {
      writeFileSync(
        join(directory, relative),
        readBootstrapFile(root, join(root, relative)),
      );
    }
    verifyBootstrapDirectory(directory, artifact);
    return { directory, artifact, cleanup };
  } catch (e) {
    cleanup();
    throw e;
  }
}

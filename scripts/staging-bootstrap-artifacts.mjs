import {
  readFileSync,
  readdirSync,
  mkdirSync,
  mkdtempSync,
  writeFileSync,
  rmSync,
  lstatSync,
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
      verifyPathBoundary(directory, path);
      ensure(lstatSync(path).isFile(), "BOOTSTRAP_ARTIFACT_INVALID");
      return {
        filename,
        sha256: hash(readFileSync(path, "utf8").replace(/\r\n/g, "\n")),
      };
    });
  const config = join(directory, "supabase/config.toml");
  verifyPathBoundary(directory, config);
  const value = {
    phase: BOOTSTRAP_PHASE,
    target: 180,
    migrations,
    configurationSha256: hash(
      readFileSync(config, "utf8").replace(/\r\n/g, "\n"),
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
      verifyPathBoundary(root, join(root, relative));
      writeFileSync(
        join(directory, relative),
        readFileSync(join(root, relative)),
      );
    }
    verifyBootstrapDirectory(directory, artifact);
    return { directory, artifact, cleanup };
  } catch (e) {
    cleanup();
    throw e;
  }
}

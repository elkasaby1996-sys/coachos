import { execFileSync } from "node:child_process";
import {
  readFileSync,
  readdirSync,
  mkdirSync,
  mkdtempSync,
  writeFileSync,
  rmSync,
  lstatSync,
  realpathSync,
} from "node:fs";
import { join, resolve, relative, isAbsolute } from "node:path";
import { tmpdir } from "node:os";
import ts from "typescript";
import { validateBundle } from "./staging-commercial-plan.mjs";
import {
  FUNCTION_CONTRACTS,
  LS_TOMBSTONES,
  OUTSIDE_BILLING_DEPLOYMENT,
} from "./billing-deployment-contract.mjs";
import { hash } from "./billing-retirement-release.mjs";

export const FROZEN_PAYLOAD = "9a9f79ff2ba7aada9ff2c24f162360d9c03b33a0";
export const TARGETS = Object.freeze({
  baseline: 184,
  retirement: 185,
  activation: 186,
});
const protectedPaths = [
  "src",
  "supabase/functions",
  "supabase/migrations",
  "supabase/config.toml",
];
export const ensure = (ok, code) => {
  if (!ok) throw new Error(code);
};
export const canonical = (value) => JSON.stringify(value);
const text = (path) => readFileSync(path, "utf8").replace(/\r\n/g, "\n");
// Reject links in the root and every ancestor inside it, including junctions.
// Realpath containment also guards platform-specific path normalization.
export function verifyPathBoundary(root, target) {
  const base = resolve(root),
    path = resolve(target),
    rel = relative(base, path);
  ensure(
    !isAbsolute(rel) &&
      rel !== ".." &&
      !rel.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`),
    "ARTIFACT_PATH_BOUNDARY",
  );
  let current = base;
  ensure(!lstatSync(current).isSymbolicLink(), "RELEASE_SYMLINK_REJECTED");
  for (const part of rel.split(/[\\/]/).filter(Boolean)) {
    current = join(current, part);
    ensure(!lstatSync(current).isSymbolicLink(), "RELEASE_SYMLINK_REJECTED");
  }
  const resolved = relative(realpathSync(base), realpathSync(path));
  ensure(
    !isAbsolute(resolved) &&
      resolved !== ".." &&
      !resolved.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`),
    "ARTIFACT_PATH_BOUNDARY",
  );
}
function files(root, directory) {
  return readdirSync(join(root, directory), { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name))
    .flatMap((entry) => {
      const path = `${directory}/${entry.name}`;
      ensure(!entry.isSymbolicLink(), "RELEASE_SYMLINK_REJECTED");
      return entry.isDirectory() ? files(root, path) : [path];
    });
}
export function payloadFingerprint(root = process.cwd()) {
  const git = (args) =>
    execFileSync("git", args, {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  ensure(
    git(["merge-base", FROZEN_PAYLOAD, "HEAD"]) === FROZEN_PAYLOAD,
    "FROZEN_PAYLOAD_ANCESTRY",
  );
  ensure(
    git(["diff", FROZEN_PAYLOAD, "--", ...protectedPaths]) === "",
    "FROZEN_PAYLOAD_DRIFT",
  );
  ensure(
    git([
      "ls-files",
      "--others",
      "--exclude-standard",
      "--",
      ...protectedPaths,
    ]) === "",
    "FROZEN_PAYLOAD_UNTRACKED",
  );
  const records = protectedPaths
    .flatMap((path) =>
      lstatSync(join(root, path)).isDirectory() ? files(root, path) : [path],
    )
    .sort()
    .map((path) => ({ path, sha256: hash(text(join(root, path))) }));
  return {
    frozenCommit: FROZEN_PAYLOAD,
    digest: hash(canonical(records)),
    records,
  };
}
export function migrationArtifact(manifest, stage) {
  ensure(Object.hasOwn(TARGETS, stage), "ARBITRARY_MIGRATION_TARGET_REJECTED");
  const target = TARGETS[stage];
  const migrations = manifest.migrations.approved.slice(0, target);
  return {
    stage,
    target,
    migrations,
    digest: hash(canonical({ stage, target, migrations })),
  };
}
export function verifyDeploymentConfiguration(directory, digest) {
  const path = join(directory, "supabase/config.toml");
  verifyPathBoundary(directory, path);
  ensure(
    !lstatSync(path).isSymbolicLink() && hash(text(path)) === digest,
    "RELEASE_CONFIGURATION_ARTIFACT_DRIFT",
  );
}
export function verifyMigrationDirectory(
  directory,
  artifact,
  configurationDigest = null,
) {
  verifyPathBoundary(directory, join(directory, "supabase/migrations"));
  if (configurationDigest)
    verifyDeploymentConfiguration(directory, configurationDigest);
  const actual = readdirSync(join(directory, "supabase/migrations"))
    .sort()
    .map((filename) => {
      ensure(
        lstatSync(join(directory, "supabase/migrations", filename)).isFile() &&
          !lstatSync(
            join(directory, "supabase/migrations", filename),
          ).isSymbolicLink(),
        "RELEASE_SYMLINK_REJECTED",
      );
      return {
        filename,
        sha256: hash(text(join(directory, "supabase/migrations", filename))),
      };
    });
  ensure(
    canonical(actual) === canonical(artifact.migrations),
    "BOUNDED_MIGRATION_ARTIFACT_DRIFT",
  );
  ensure(
    actual.length === TARGETS[artifact.stage] &&
      artifact.target === TARGETS[artifact.stage],
    "BOUNDED_MIGRATION_TARGET_DRIFT",
  );
  ensure(
    artifact.digest ===
      hash(
        canonical({
          stage: artifact.stage,
          target: artifact.target,
          migrations: actual,
        }),
      ),
    "BOUNDED_MIGRATION_DIGEST_DRIFT",
  );
}
export const CONTAINMENT_SOURCE = `// PAY-05B release artifact. No imports, persistence or provider capability.\nDeno.serve(() => new Response(JSON.stringify({code:"BILLING_RELEASE_TEMPORARILY_UNAVAILABLE",retryable:true}), {status:503,headers:{"Content-Type":"application/json","Cache-Control":"no-store","Retry-After":"60","Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type"}}));\n`;
export function validateContainment(source) {
  // Exact equality is stronger than an import/call blacklist, including comments/escapes.
  ensure(source === CONTAINMENT_SOURCE, "CONTAINMENT_SOURCE_FORBIDDEN");
}
export function functionArtifacts(root = process.cwd()) {
  return FUNCTION_CONTRACTS.map((f) => {
    const source = text(join(root, `supabase/functions/${f.name}/index.ts`));
    const contents = dependencyClosure(root, f.name);
    // Exact relative-source dependency closure; remote packages stay bound by frozen imports.
    const digest = hash(
      canonical(
        contents.map(({ path, source }) => ({ path, sha256: hash(source) })),
      ),
    );
    return { ...f, contents, digest, entrypointSha256: hash(source) };
  });
}
export function outsideFunctionArtifacts(root = process.cwd()) {
  return OUTSIDE_BILLING_DEPLOYMENT.map((name) => {
    const contents = dependencyClosure(root, name);
    return {
      name,
      verifyJwt: true,
      digest: hash(
        canonical(
          contents.map(({ path, source }) => ({ path, sha256: hash(source) })),
        ),
      ),
      entrypointSha256: hash(
        text(join(root, `supabase/functions/${name}/index.ts`)),
      ),
    };
  });
}
export function dependencyClosure(root, name) {
  const base = resolve(root),
    seen = new Map();
  function visit(path) {
    verifyPathBoundary(base, path);
    const rel = relative(base, path).replaceAll("\\", "/");
    ensure(
      (rel.startsWith("supabase/functions/") || rel.startsWith("src/")) &&
        !lstatSync(path).isSymbolicLink(),
      "FUNCTION_IMPORT_BOUNDARY",
    );
    if (seen.has(rel)) return;
    const source = text(path);
    seen.set(rel, { path: rel, source });
    const ast = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true);
    function walk(node) {
      let specifier;
      if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node))
        specifier = node.moduleSpecifier;
      if (
        ts.isCallExpression(node) &&
        node.expression.kind === ts.SyntaxKind.ImportKeyword
      ) {
        ensure(
          node.arguments.length === 1 && ts.isStringLiteral(node.arguments[0]),
          "DYNAMIC_FUNCTION_IMPORT_REJECTED",
        );
        specifier = node.arguments[0];
      }
      if (specifier) {
        ensure(ts.isStringLiteral(specifier), "FUNCTION_IMPORT_REJECTED");
        if (specifier.text.startsWith("."))
          visit(resolve(path, "..", specifier.text));
      }
      ts.forEachChild(node, walk);
    }
    walk(ast);
  }
  visit(join(base, "supabase/functions", name, "index.ts"));
  return [...seen.values()].sort((a, b) => a.path.localeCompare(b.path));
}
export function containmentArtifacts() {
  return FUNCTION_CONTRACTS.filter(
    (f) =>
      f.classification !== "NON_BILLING" && !LS_TOMBSTONES.includes(f.name),
  ).map((f) => ({
    name: f.name,
    verifyJwt: f.verifyJwt,
    digest: hash(CONTAINMENT_SOURCE),
    entrypointSha256: hash(CONTAINMENT_SOURCE),
  }));
}
export function releaseIdentity(root = process.cwd()) {
  const manifest = validateBundle(root);
  const payload = payloadFingerprint(root);
  const final = functionArtifacts(root);
  return {
    manifest,
    payload,
    migrations: Object.fromEntries(
      Object.keys(TARGETS).map((stage) => [
        stage,
        migrationArtifact(manifest, stage),
      ]),
    ),
    functions: final.map(({ name, verifyJwt, digest, entrypointSha256 }) => ({
      name,
      verifyJwt,
      digest,
      entrypointSha256,
    })),
    containment: containmentArtifacts(),
    outsideFunctions: outsideFunctionArtifacts(root),
  };
}
export function disposableArtifact(
  root,
  identity,
  stage,
  functionMode = "none",
) {
  ensure(
    ["none", "containment", "final"].includes(functionMode),
    "FUNCTION_ARTIFACT_MODE_INVALID",
  );
  ensure(
    canonical(validateBundle(root)) === canonical(identity.manifest),
    "RELEASE_CANONICAL_MANIFEST_DRIFT",
  );
  const directory = mkdtempSync(join(tmpdir(), "repsync-release-"));
  const cleanup = () => {
    const resolved = resolve(directory),
      parent = resolve(tmpdir());
    ensure(
      relative(parent, resolved).startsWith("repsync-release-") &&
        !relative(parent, resolved).includes(".."),
      "ARTIFACT_CLEANUP_BOUNDARY",
    );
    rmSync(resolved, { recursive: true, force: true });
  };
  try {
    const artifact = migrationArtifact(identity.manifest, stage);
    mkdirSync(join(directory, "supabase/migrations"), { recursive: true });
    writeFileSync(
      join(directory, "supabase/config.toml"),
      text(join(root, "supabase/config.toml")),
    );
    for (const m of artifact.migrations)
      writeFileSync(
        join(directory, "supabase/migrations", m.filename),
        text(join(root, "supabase/migrations", m.filename)),
      );
    verifyMigrationDirectory(directory, artifact);
    if (functionMode !== "none") {
      for (const f of functionArtifacts(root)) {
        if (
          functionMode === "containment" &&
          f.classification === "NON_BILLING"
        )
          continue;
        const contents =
          functionMode === "containment" && !LS_TOMBSTONES.includes(f.name)
            ? [
                {
                  path: `supabase/functions/${f.name}/index.ts`,
                  source: CONTAINMENT_SOURCE,
                },
              ]
            : f.contents;
        for (const item of contents) {
          const dest = join(directory, item.path);
          mkdirSync(resolve(dest, ".."), { recursive: true });
          writeFileSync(dest, item.source);
        }
      }
    }
    return { directory, artifact, cleanup };
  } catch (error) {
    cleanup();
    throw error;
  }
}
export function verifyFunctionDirectory(directory, expected, mode) {
  const contents = dependencyClosure(directory, expected.name);
  if (mode === "containment" && !LS_TOMBSTONES.includes(expected.name)) {
    ensure(contents.length === 1, "CONTAINMENT_SOURCE_FORBIDDEN");
    validateContainment(contents[0].source);
  } else
    ensure(
      hash(
        canonical(
          contents.map(({ path, source }) => ({ path, sha256: hash(source) })),
        ),
      ) === expected.digest,
      "RELEASE_FUNCTION_ARTIFACT_DRIFT",
    );
}

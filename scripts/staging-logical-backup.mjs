import { createHash } from "node:crypto";
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  filterManagedCopyBlocks,
  managedExclusionArgument,
  validatePortableData,
} from "./staging-logical-backup-data.mjs";

export const sha256 = (bytes) =>
  createHash("sha256").update(bytes).digest("hex");

// All failures are deliberately static: never expose parser errors or input values.
export function validateBackupEnvironment(env) {
  const staging = env.STAGING_SUPABASE_PROJECT_REF;
  const production = env.PRODUCTION_SUPABASE_PROJECT_REF;
  const raw = env.STAGING_SUPABASE_DB_URL;
  const fail = () => {
    throw new Error("Staging backup boundary validation failed.");
  };
  if (
    !/^[a-z]{20}$/.test(staging ?? "") ||
    !/^[a-z]{20}$/.test(production ?? "") ||
    staging === production ||
    env.CONFIRM_PROJECT_REF !== staging ||
    !raw ||
    raw !== raw.trim()
  )
    fail();
  let url, decoded;
  try {
    url = new URL(raw);
    decoded = decodeURIComponent(raw);
  } catch {
    fail();
  }
  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    !url.password ||
    url.pathname !== "/postgres" ||
    url.search ||
    url.hash ||
    (url.port && url.port !== "5432") ||
    decoded.toLowerCase().includes(production) ||
    /localhost|\.local\b|\.internal\b|placeholder|your[-_ ]|\[|\]|<|>|changeme|replace[-_ ]?me|example\.(com|org|net)/i.test(
      decoded,
    )
  )
    fail();
  const direct =
    url.hostname === `db.${staging}.supabase.co` && url.username === "postgres";
  const sessionPooler =
    /^aws-[0-9]+-[a-z0-9-]+\.pooler\.supabase\.com$/.test(url.hostname) &&
    url.username === `postgres.${staging}`;
  if (!direct && !sessionPooler) fail();
  const label = env.EVIDENCE_LABEL ?? "";
  if (
    !/^[a-z0-9][a-z0-9-]{0,63}$/.test(label) ||
    label.includes(staging) ||
    label.includes(production)
  )
    fail();
  return { staging, label };
}

export function writeBackupEvidence(env, directory = "backup") {
  const { staging, label } = validateBackupEnvironment(env);
  if (
    !/^[a-f0-9]{40}$/.test(env.GITHUB_SHA ?? "") ||
    !/^[0-9]+$/.test(env.GITHUB_RUN_ID ?? "")
  ) {
    throw new Error("Invalid backup run metadata.");
  }
  let portability;
  const files = ["roles.sql", "schema.sql", "data.sql"].map((filename) => {
    const bytes = readFileSync(join(directory, filename));
    if (!bytes.length) throw new Error("A required logical dump is empty.");
    if (filename === "data.sql") portability = validatePortableData(bytes);
    return { filename, sha256: sha256(bytes), byteLength: bytes.length };
  });
  writeFileSync(
    join(directory, "SHA256SUMS.txt"),
    files.map((f) => `${f.sha256}  ${f.filename}\n`).join(""),
  );
  const evidence = {
    schemaVersion: 2,
    environment: "staging",
    commitSha: env.GITHUB_SHA,
    githubRunId: env.GITHUB_RUN_ID,
    evidenceLabel: label,
    createdAt: new Date().toISOString(),
    projectRefSha256: sha256(staging),
    files,
    ...portability,
    storageObjectsIncluded: false,
    remoteMutationPerformed: false,
  };
  const bytes = Buffer.from(`${JSON.stringify(evidence, null, 2)}\n`, "utf8");
  writeFileSync(join(directory, "backup-evidence.json"), bytes);
  const digest = sha256(bytes);
  writeFileSync(join(directory, "backup-evidence.sha256"), `${digest}\n`);
  if (env.GITHUB_STEP_SUMMARY) {
    appendFileSync(
      env.GITHUB_STEP_SUMMARY,
      [
        ...files,
        {
          filename: "backup-evidence.json",
          byteLength: bytes.length,
          sha256: digest,
        },
      ]
        .map(
          (f) =>
            `${f.filename}: ${f.byteLength} bytes; SHA-256 ${f.sha256}\n\n`,
        )
        .join(""),
    );
  }
  return evidence;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    if (process.argv[2] === "validate") validateBackupEnvironment(process.env);
    else if (process.argv[2] === "evidence") writeBackupEvidence(process.env);
    else if (process.argv[2] === "exclusions")
      console.log(managedExclusionArgument());
    else if (process.argv[2] === "portable-copy" && process.argv.length === 5) {
      const [, , , source, destination] = process.argv;
      const bytes = filterManagedCopyBlocks(readFileSync(source));
      // Exclusive creation protects the source and any existing derivative,
      // including aliases/symlinks. SQL stays private and outside stdout.
      writeFileSync(destination, bytes, { flag: "wx", mode: 0o600 });
    } else throw new Error("Unsupported mode.");
  } catch {
    console.error(
      "Staging backup validation or evidence generation failed; details suppressed.",
    );
    process.exitCode = 1;
  }
}

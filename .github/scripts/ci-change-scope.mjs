import { execFileSync } from "node:child_process";
import { appendFileSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const ciFiles = new Set([
  ".github/workflows/ci.yml",
  ".github/scripts/ci-change-scope.mjs",
  ".github/scripts/ci-change-scope.test.mjs",
]);

export function classifyChanges(files) {
  const documentation = (file) => /^docs\/.+\.md$/.test(file);
  return {
    docs_only: files.length > 0 && files.every(documentation),
    // CI changes still run the full local smoke suite, but do not need to
    // mutate configured remote accounts. Unknown paths require all checks.
    configured_data_required:
      files.length === 0 ||
      files.some((file) => !documentation(file) && !ciFiles.has(file)),
  };
}

export function changedFiles(eventName, event, runGit = execFileSync) {
  if (eventName === "workflow_dispatch") return [];
  const base =
    eventName === "pull_request" ? event.pull_request?.base.sha : event.before;
  const head =
    eventName === "pull_request" ? event.pull_request?.head.sha : event.after;
  if (![base, head].every((sha) => /^[a-f0-9]{40}$/.test(sha ?? ""))) {
    throw new Error("Missing or invalid CI comparison revisions");
  }
  // A new branch has no comparison base: require the full suite.
  if (/^0+$/.test(base)) return [];
  const range =
    eventName === "pull_request" ? `${base}...${head}` : `${base}..${head}`;
  return runGit(
    "git",
    ["diff", "--no-renames", "--name-only", "-z", range, "--"],
    {
      encoding: "utf8",
    },
  )
    .split("\0")
    .filter(Boolean);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, "utf8"));
  const scope = classifyChanges(
    changedFiles(process.env.GITHUB_EVENT_NAME, event),
  );
  appendFileSync(
    process.env.GITHUB_OUTPUT,
    Object.entries(scope)
      .map(([key, value]) => `${key}=${value}\n`)
      .join(""),
  );
  console.log(JSON.stringify(scope));
}

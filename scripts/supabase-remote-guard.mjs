import { spawnSync } from "node:child_process";

const CONFIRM_VALUE = "I_UNDERSTAND_THIS_TOUCHES_REMOTE";
const args = process.argv.slice(2);

if (args.length === 0) {
  console.error("Usage: npm run supabase:remote -- <supabase args>");
  process.exit(2);
}

const commandText = args.join(" ");
const projectRef = process.env.SUPABASE_PROJECT_REF?.trim();
const confirmed = process.env.ALLOW_REMOTE_SUPABASE === CONFIRM_VALUE;

const remotePatterns = [
  /^db push\b/,
  /^functions deploy\b/,
  /^functions delete\b/,
  /^secrets set\b/,
  /^secrets unset\b/,
  /^link\b/,
  /^migration up\b/,
];

const isRemoteCommand = remotePatterns.some((pattern) =>
  pattern.test(commandText),
);

if (!isRemoteCommand) {
  console.error(
    `Refusing to run through remote guard because this is not an approved remote command: ${commandText}`,
  );
  process.exit(2);
}

if (!confirmed) {
  console.error(
    [
      "Blocked remote Supabase command.",
      "",
      `Command: supabase ${commandText}`,
      "",
      "This can change a linked Supabase project outside local development.",
      `To run it intentionally, set ALLOW_REMOTE_SUPABASE=${CONFIRM_VALUE}`,
      "and set SUPABASE_PROJECT_REF to the exact project ref.",
    ].join("\n"),
  );
  process.exit(1);
}

if (!projectRef) {
  console.error("Blocked: SUPABASE_PROJECT_REF must be set explicitly.");
  process.exit(1);
}

if (commandText.includes("<api-key>")) {
  console.error("Blocked: command still contains the placeholder <api-key>.");
  process.exit(1);
}

if (
  commandText.startsWith("secrets set ") &&
  /OPEN_WEARABLES_API_URL=http:\/\/(localhost|127\.0\.0\.1|host\.docker\.internal)/.test(
    commandText,
  )
) {
  console.error(
    "Blocked: do not set local Open Wearables URLs as remote Supabase secrets.",
  );
  process.exit(1);
}

const finalArgs = [...args];
if (!finalArgs.includes("--project-ref")) {
  finalArgs.push("--project-ref", projectRef);
}

const result = spawnSync("npx", ["supabase@latest", ...finalArgs], {
  stdio: "inherit",
  shell: process.platform === "win32",
});

process.exit(result.status ?? 1);

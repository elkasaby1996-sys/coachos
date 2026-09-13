import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export function guardedArgs(args, env, linkedProject) {
  const project = env.SUPABASE_PROJECT_REF?.trim();
  if (
    env.ALLOW_REMOTE_SUPABASE !== "I_UNDERSTAND_THIS_TOUCHES_REMOTE" ||
    !/^[a-z]{20}$/.test(project ?? "")
  )
    throw new Error("REMOTE_AUTHORIZATION_REQUIRED");
  const command = args.slice(0, 2).join(" ");
  const projectCommand =
    args[0] === "link" ||
    [
      "functions deploy",
      "functions delete",
      "secrets set",
      "secrets unset",
    ].includes(command);
  const linkedCommand = ["db push", "migration up", "migration list"].includes(
    command,
  );
  if (!projectCommand && !linkedCommand)
    throw new Error("REMOTE_COMMAND_NOT_APPROVED");
  if (
    args.some((arg) => /[\r\n<>]/.test(arg)) ||
    args.some((arg) => /^--(?:db-url|password)(?:=|$)/.test(arg))
  )
    throw new Error("REMOTE_ARGUMENT_REJECTED_USE_ENV_SECRET");
  const refFlags = args.filter((arg) => /^--project-ref(?:=|$)/.test(arg));
  if (
    refFlags.length > 1 ||
    refFlags.some((arg) => arg !== "--project-ref") ||
    (refFlags.length && args[args.indexOf("--project-ref") + 1] !== project)
  )
    throw new Error("REMOTE_PROJECT_MISMATCH");
  if (
    command === "secrets set" &&
    args.some((arg) =>
      /https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|host\.docker\.internal|\[::1\])(?:[:/]|$)/i.test(
        arg,
      ),
    )
  )
    throw new Error("REMOTE_LOCAL_URL_BLOCKED");
  if (linkedCommand) {
    // Linked DB commands do not accept --project-ref. Check the link file.
    if (
      refFlags.length ||
      !args.includes("--linked") ||
      linkedProject?.trim() !== project ||
      args.includes("--local")
    )
      throw new Error("REMOTE_LINK_MISMATCH");
    return args;
  }
  return refFlags.length ? args : [...args, "--project-ref", project];
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    let linked;
    try {
      linked = readFileSync("supabase/.temp/project-ref", "utf8");
    } catch {
      /* Unlinked is expected before link. */
    }
    const args = guardedArgs(process.argv.slice(2), process.env, linked);
    // A pinned CLI is installed by staging setup. No shell interpolation.
    const result = spawnSync("supabase", args, {
      stdio: "inherit",
      shell: false,
    });
    process.exitCode = result.status ?? 1;
  } catch {
    console.error("REMOTE_COMMAND_BLOCKED");
    process.exitCode = 1;
  }
}

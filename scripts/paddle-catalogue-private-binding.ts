import {
  closeSync,
  fstatSync,
  openSync,
  readSync,
  realpathSync,
  statSync,
} from "node:fs";
import { dirname, isAbsolute, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { assertServer } from "../supabase/functions/_shared/paddle-catalogue/config.ts";
import {
  CatalogueVerificationError,
  parsePrivateCatalogueBinding,
  type CatalogueBinding,
} from "../supabase/functions/_shared/paddle-catalogue-verifier.ts";

const repository = realpathSync(fileURLToPath(new URL("../", import.meta.url)));
function unsafe(): never {
  throw new CatalogueVerificationError("BINDING_FILE_UNSAFE");
}
/** Outside this checkout AND every other Git worktree, with private file ACLs.
 * No paths, contents or operating-system errors are included in public errors. */
export function readPrivateCatalogueBinding(
  path: string | undefined,
): CatalogueBinding {
  assertServer();
  if (!path) throw new CatalogueVerificationError("BINDING_PATH_REQUIRED");
  let fd: number | undefined;
  try {
    if (!isAbsolute(path)) unsafe();
    const actual = realpathSync(path),
      rel = relative(repository, actual),
      stat = statSync(actual);
    if (
      !(rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) ||
      !stat.isFile() ||
      stat.size > 65536
    )
      unsafe();
    const git = spawnSync(
      "git",
      ["-C", dirname(actual), "rev-parse", "--is-inside-work-tree"],
      { encoding: "utf8", stdio: "pipe", timeout: 10000 },
    );
    if (
      git.error ||
      git.status !== 128 ||
      !/not a git repository/i.test(git.stderr)
    )
      unsafe();
    if (process.platform === "win32") {
      const acl = spawnSync(
        "powershell.exe",
        [
          "-NoProfile",
          "-NonInteractive",
          "-Command",
          "$ErrorActionPreference='Stop'; $allowed=@([System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value,'S-1-5-18','S-1-5-32-544'); $rules=(Get-Acl -LiteralPath $env:REPSYNC_ACL_CHECK_PATH).GetAccessRules($true,$true,[System.Security.Principal.SecurityIdentifier]); if (@($rules | Where-Object { $_.AccessControlType -eq 'Allow' -and $_.IdentityReference.Value -notin $allowed }).Count -gt 0) { exit 1 }",
        ],
        {
          env: { ...process.env, REPSYNC_ACL_CHECK_PATH: actual },
          stdio: "pipe",
          timeout: 10000,
        },
      );
      if (acl.status !== 0) unsafe();
    } else if (
      (stat.mode & 0o077) !== 0 ||
      (process.getuid && stat.uid !== process.getuid())
    )
      unsafe();
    fd = openSync(actual, "r");
    const opened = fstatSync(fd);
    if (opened.ino !== stat.ino || opened.dev !== stat.dev || !opened.isFile())
      unsafe();
    const bytes = Buffer.alloc(65537);
    let length = 0,
      count = 0;
    do {
      count = readSync(fd, bytes, length, bytes.length - length, null);
      length += count;
    } while (count > 0 && length < bytes.length);
    if (length > 65536) unsafe();
    let parsed: unknown;
    try {
      parsed = JSON.parse(
        new TextDecoder("utf-8", { fatal: true }).decode(
          bytes.subarray(0, length),
        ),
      );
    } catch {
      throw new CatalogueVerificationError("BINDING_INVALID");
    }
    return parsePrivateCatalogueBinding(parsed);
  } catch (e) {
    if (e instanceof CatalogueVerificationError) throw e;
    throw new CatalogueVerificationError("BINDING_FILE_UNREADABLE");
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

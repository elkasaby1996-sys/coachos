import {
  closeSync,
  constants,
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
const windowsReader = fileURLToPath(
  new URL("./read-private-catalogue-binding.ps1", import.meta.url),
);
function unsafe(): never {
  throw new CatalogueVerificationError("BINDING_FILE_UNSAFE");
}
function checkLocation(actual: string): void {
  if (!isAbsolute(actual)) unsafe();
  const rel = relative(repository, actual);
  if (!(rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)))
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
}
/** Outside every Git worktree, with permissions checked on the handle used to read.
 * No paths, contents or operating-system errors are included in public errors. */
export function readPrivateCatalogueBinding(
  path: string | undefined,
): CatalogueBinding {
  assertServer();
  if (!path) throw new CatalogueVerificationError("BINDING_PATH_REQUIRED");
  let fd: number | undefined;
  try {
    if (!isAbsolute(path)) unsafe();
    let bytes: Buffer;
    if (process.platform === "win32") {
      // Node does not expose handle-bound Windows ACL inspection. The helper owns
      // a single FileStream for ACL validation, final-path resolution and reading.
      const result = spawnSync(
        "powershell.exe",
        [
          "-NoProfile",
          "-NonInteractive",
          "-ExecutionPolicy",
          "Bypass",
          "-File",
          windowsReader,
        ],
        {
          env: {
            ...process.env,
            PSModulePath: undefined,
            REPSYNC_BINDING_READ_PATH: path,
          },
          encoding: "utf8",
          stdio: "pipe",
          timeout: 10000,
          maxBuffer: 200000,
        },
      );
      if (result.status === 2) unsafe();
      if (result.error || result.status !== 0)
        throw new CatalogueVerificationError("BINDING_FILE_UNREADABLE");
      const payload: unknown = JSON.parse(result.stdout);
      if (
        !payload ||
        typeof payload !== "object" ||
        !("path" in payload) ||
        typeof payload.path !== "string" ||
        !("bytes" in payload) ||
        typeof payload.bytes !== "string"
      )
        unsafe();
      checkLocation(payload.path);
      bytes = Buffer.from(payload.bytes, "base64");
    } else {
      const selected = realpathSync(path);
      fd = openSync(
        selected,
        constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
      );
      const opened = fstatSync(fd);
      if (
        !opened.isFile() ||
        opened.size > 65536 ||
        (opened.mode & 0o077) !== 0 ||
        (process.getuid && opened.uid !== process.getuid())
      )
        unsafe();
      const actual = realpathSync(selected);
      const located = statSync(actual);
      if (located.ino !== opened.ino || located.dev !== opened.dev) unsafe();
      checkLocation(actual);
      const buffer = Buffer.alloc(65537);
      let length = 0,
        count = 0;
      do {
        count = readSync(fd, buffer, length, buffer.length - length, null);
        length += count;
      } while (count > 0 && length < buffer.length);
      bytes = buffer.subarray(0, length);
    }
    if (bytes.length > 65536) unsafe();
    let parsed: unknown;
    try {
      parsed = JSON.parse(
        new TextDecoder("utf-8", { fatal: true }).decode(bytes),
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

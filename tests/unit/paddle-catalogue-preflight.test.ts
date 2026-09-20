import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  mkdtempSync,
  writeFileSync,
  rmSync,
  chmodSync,
  symlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { syntheticCatalogue } from "../fixtures/paddle-catalogue-verifier";
import { readPrivateCatalogueBinding } from "../../scripts/paddle-catalogue-private-binding";
import { runPaddleCataloguePreflight } from "../../scripts/paddle-catalogue-preflight";
import { createPaddleSandboxCatalogue } from "../../supabase/functions/_shared/paddle-catalogue";

vi.mock("../../supabase/functions/_shared/paddle-catalogue", () => ({
  createPaddleSandboxCatalogue: vi.fn(),
}));
vi.mock("node:child_process", async (importOriginal) => {
  const original = await importOriginal<typeof import("node:child_process")>();
  return { ...original, spawnSync: vi.fn(original.spawnSync) };
});
const nativeProcess =
  await vi.importActual<typeof import("node:child_process")>(
    "node:child_process",
  );
function outsideGit(command: string, ...args: any[]): any {
  return command === "git"
    ? { status: 128, stderr: "fatal: not a git repository", stdout: "" }
    : (nativeProcess.spawnSync as any)(command, ...args);
}
let directory: string, bindingPath: string;
beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), "repsync-binding-test-"));
  bindingPath = join(directory, "binding.json");
  writeFileSync(bindingPath, JSON.stringify(syntheticCatalogue().binding), {
    mode: 0o600,
  });
  chmodSync(bindingPath, 0o600);
  if (process.platform === "win32") {
    const secured = nativeProcess.spawnSync(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        "$acl = New-Object System.Security.AccessControl.FileSecurity; $acl.SetAccessRuleProtection($true,$false); $sid=[System.Security.Principal.WindowsIdentity]::GetCurrent().User; $acl.AddAccessRule([System.Security.AccessControl.FileSystemAccessRule]::new($sid,'FullControl','Allow')); [System.IO.File]::SetAccessControl($env:REPSYNC_TEST_BINDING,$acl)",
      ],
      {
        env: {
          ...process.env,
          PSModulePath: undefined,
          REPSYNC_TEST_BINDING: bindingPath,
        },
        stdio: "pipe",
      },
    );
    expect(secured.status, String(secured.stderr)).toBe(0);
  }
  vi.mocked(spawnSync).mockImplementation(outsideGit as typeof spawnSync);
  vi.stubEnv("PADDLE_CATALOGUE_BINDING_PATH", bindingPath);
  vi.mocked(createPaddleSandboxCatalogue).mockReturnValue(
    syntheticCatalogue().capability,
  );
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  rmSync(directory, { recursive: true, force: true });
});
describe("private file boundary", () => {
  it("reads private outside-Git state without exposing it", () => {
    expect(readPrivateCatalogueBinding(bindingPath).selections).toHaveLength(8);
  });
  it.skipIf(process.platform !== "win32")(
    "does not reopen a pathname replaced after handle validation",
    () => {
      vi.mocked(spawnSync).mockImplementation(((
        command: string,
        ...args: any[]
      ) => {
        const result = outsideGit(command, ...args);
        if (command === "powershell.exe" && result.status === 0) {
          rmSync(bindingPath);
          writeFileSync(bindingPath, "synthetic-replacement-must-not-be-read");
        }
        return result;
      }) as typeof spawnSync);
      expect(readPrivateCatalogueBinding(bindingPath).selections).toHaveLength(
        8,
      );
    },
  );
  it.skipIf(process.platform !== "win32")(
    "reads the trusted helper under a restricted process execution policy",
    () => {
      vi.stubEnv("PSExecutionPolicyPreference", "Restricted");
      expect(readPrivateCatalogueBinding(bindingPath).selections).toHaveLength(
        8,
      );
    },
  );
  it("requires an explicit path", () => {
    expect(() => readPrivateCatalogueBinding(undefined)).toThrow(
      "BINDING_PATH_REQUIRED",
    );
  });
  it("rejects a repository-local file even when ignored", () => {
    expect(() => readPrivateCatalogueBinding(resolve(".gitignore"))).toThrow(
      "BINDING_FILE_UNSAFE",
    );
  });
  it("rejects relative paths", () => {
    expect(() => readPrivateCatalogueBinding("private.json")).toThrow(
      "BINDING_FILE_UNSAFE",
    );
  });
  it("rejects another Git worktree", () => {
    vi.mocked(spawnSync).mockImplementation(((
      command: string,
      ...args: any[]
    ) =>
      command === "git"
        ? { status: 0, stdout: "true", stderr: "" }
        : outsideGit(command, ...args)) as typeof spawnSync);
    expect(() => readPrivateCatalogueBinding(bindingPath)).toThrow(
      "BINDING_FILE_UNSAFE",
    );
  });
  it("fails closed when Git cannot inspect the path", () => {
    vi.mocked(spawnSync).mockImplementation(((
      command: string,
      ...args: any[]
    ) =>
      command === "git"
        ? { status: 128, stdout: "", stderr: "synthetic-sensitive-os-error" }
        : outsideGit(command, ...args)) as typeof spawnSync);
    expect(() => readPrivateCatalogueBinding(bindingPath)).toThrow(
      "BINDING_FILE_UNSAFE",
    );
  });
  it("rejects directories", () => {
    expect(() => readPrivateCatalogueBinding(directory)).toThrow(
      "BINDING_FILE_UNSAFE",
    );
  });
  it("rejects unreadable/missing files without including paths", () => {
    expect(() =>
      readPrivateCatalogueBinding(join(directory, "synthetic-secret-name")),
    ).toThrow(/^BINDING_FILE_UNREADABLE$/);
  });
  it("rejects malformed JSON without echoing it", () => {
    writeFileSync(bindingPath, '{"synthetic-sensitive-content":');
    expect(() => readPrivateCatalogueBinding(bindingPath)).toThrow(
      /^BINDING_INVALID$/,
    );
  });
  it("rejects invalid UTF8", () => {
    writeFileSync(bindingPath, Buffer.from([0xff]));
    expect(() => readPrivateCatalogueBinding(bindingPath)).toThrow(
      /^BINDING_INVALID$/,
    );
  });
  it("bounds file size", () => {
    writeFileSync(bindingPath, "x".repeat(65537));
    expect(() => readPrivateCatalogueBinding(bindingPath)).toThrow(
      "BINDING_FILE_UNSAFE",
    );
  });
  it("resolves symlinked directories before checking repository containment", () => {
    const alias = join(directory, "checkout");
    symlinkSync(
      process.cwd(),
      alias,
      process.platform === "win32" ? "junction" : "dir",
    );
    expect(() =>
      readPrivateCatalogueBinding(join(alias, "package.json")),
    ).toThrow("BINDING_FILE_UNSAFE");
  });
  it("rejects broad permissions", () => {
    if (process.platform === "win32") {
      const broadened = nativeProcess.spawnSync(
        "powershell.exe",
        [
          "-NoProfile",
          "-NonInteractive",
          "-Command",
          "$acl=[System.IO.File]::GetAccessControl($env:REPSYNC_TEST_BINDING); $sid=[System.Security.Principal.SecurityIdentifier]::new('S-1-1-0'); $acl.AddAccessRule([System.Security.AccessControl.FileSystemAccessRule]::new($sid,'Read','Allow')); [System.IO.File]::SetAccessControl($env:REPSYNC_TEST_BINDING,$acl)",
        ],
        {
          env: {
            ...process.env,
            PSModulePath: undefined,
            REPSYNC_TEST_BINDING: bindingPath,
          },
          stdio: "pipe",
        },
      );
      expect(broadened.status).toBe(0);
    } else chmodSync(bindingPath, 0o644);
    expect(() => readPrivateCatalogueBinding(bindingPath)).toThrow(
      "BINDING_FILE_UNSAFE",
    );
  });
});
describe("read-only preflight runner", () => {
  it("returns only a sanitized summary with eight receipts and no publisher", async () => {
    const capability = syntheticCatalogue().capability;
    const lists = [
      vi.spyOn(capability, "listProducts"),
      vi.spyOn(capability, "listPrices"),
    ];
    const price = vi.spyOn(capability, "retrievePrice"),
      product = vi.spyOn(capability, "retrieveProduct");
    vi.mocked(createPaddleSandboxCatalogue).mockReturnValue(capability);
    const result = await runPaddleCataloguePreflight();
    expect(result.receiptCount).toBe(8);
    expect(result.productsObserved).toBe(4);
    expect(result.recurringPricesObserved).toBe(8);
    expect(Object.keys(result).sort()).toEqual([
      "canonicalPairsVerified",
      "discrepancyCodes",
      "pairs",
      "productsObserved",
      "receiptCount",
      "recurringPricesObserved",
    ]);
    expect(JSON.stringify(result)).not.toContain("synthetic/");
    lists.forEach((s) => expect(s).toHaveBeenCalledTimes(1));
    expect(price).toHaveBeenCalledTimes(8);
    expect(product).toHaveBeenCalledTimes(4);
    expect(
      vi
        .mocked(spawnSync)
        .mock.calls.every(([cmd]) =>
          ["git", "powershell.exe"].includes(String(cmd)),
        ),
    ).toBe(true);
  });
  it("does not contact Paddle before a valid private binding exists", async () => {
    vi.stubEnv("PADDLE_CATALOGUE_BINDING_PATH", "");
    const result = await runPaddleCataloguePreflight();
    expect(result.discrepancyCodes).toEqual(["BINDING_PATH_REQUIRED"]);
    expect(createPaddleSandboxCatalogue).not.toHaveBeenCalled();
  });
  it("sanitizes configuration failures", async () => {
    vi.mocked(createPaddleSandboxCatalogue).mockImplementation(() => {
      throw Error("synthetic-api-key");
    });
    const result = await runPaddleCataloguePreflight();
    expect(result.receiptCount).toBe(0);
    expect(JSON.stringify(result)).not.toContain("synthetic-api-key");
  });
  it("rejects browser execution before file or transport access", async () => {
    vi.stubGlobal("window", {});
    await expect(runPaddleCataloguePreflight()).rejects.toThrow();
    expect(createPaddleSandboxCatalogue).not.toHaveBeenCalled();
  });
});

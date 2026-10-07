import { afterEach, describe, expect, it, vi } from "vitest";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  renameSync,
  readFileSync,
  rmSync,
  fstatSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { hash } from "../../scripts/billing-retirement-release.mjs";
import { evidenceDigest } from "../../scripts/staging-release-webhook-history.mjs";
import { verifyBootstrapDirectory } from "../../scripts/staging-bootstrap-artifacts.mjs";

const race = vi.hoisted(() => ({
  target: "",
  fd: undefined as number | undefined,
  reads: 0,
  active: false,
  afterOpen: undefined as undefined | (() => void),
  afterStat: undefined as undefined | (() => void),
  failRead: false,
  nonregular: false,
}));
vi.mock("node:fs", async (original) => {
  const fs = await original<typeof import("node:fs")>();
  return {
    ...fs,
    openSync: (...args: Parameters<typeof fs.openSync>) => {
      const fd = fs.openSync(...args);
      if (args[0] === race.target) {
        race.fd = fd;
        race.active = true;
        race.afterOpen?.();
      }
      return fd;
    },
    closeSync: (fd: number) => {
      fs.closeSync(fd);
      if (fd === race.fd) race.active = false;
    },
    lstatSync: (...args: any[]) => {
      const result = (fs.lstatSync as any)(...args);
      if (args[0] === race.target && args[1]?.bigint) race.afterStat?.();
      return result;
    },
    fstatSync: (...args: any[]) => {
      const result = (fs.fstatSync as any)(...args);
      if (race.active && args[0] === race.fd && race.nonregular)
        result.isFile = () => false;
      return result;
    },
    readFileSync: (...args: any[]) => {
      if ((race.active && args[0] === race.fd) || args[0] === race.target) {
        race.reads++;
        if (race.failRead) throw new Error("SYNTHETIC_READ_FAILURE");
      }
      return (fs.readFileSync as any)(...args);
    },
  };
});
const roots: string[] = [];
afterEach(() => {
  Object.assign(race, {
    target: "",
    fd: undefined,
    reads: 0,
    active: false,
    afterOpen: undefined,
    afterStat: undefined,
    failRead: false,
    nonregular: false,
  });
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});
function fixture(kind: string) {
  const root = mkdtempSync(join(tmpdir(), "bootstrap-race-test-"));
  roots.push(root);
  mkdirSync(join(root, "supabase/migrations"), { recursive: true });
  const migrations = Array.from({ length: 180 }, (_, i) => {
    const filename = `${String(i).padStart(14, "0")}_fixture.sql`;
    writeFileSync(join(root, "supabase/migrations", filename), "select 1;\r\n");
    return { filename, sha256: hash("select 1;\n") };
  });
  writeFileSync(join(root, "supabase/config.toml"), "# local fixture\r\n");
  const artifact = {
    phase: "EMPTY_TO_180",
    target: 180,
    migrations,
    configurationSha256: hash("# local fixture\n"),
  };
  race.target = join(
    root,
    kind === "config"
      ? "supabase/config.toml"
      : `supabase/migrations/${migrations[0].filename}`,
  );
  return { root, artifact: { ...artifact, digest: evidenceDigest(artifact) } };
}
function assertClosed() {
  expect(race.fd).toBeTypeOf("number");
  expect(() => fstatSync(race.fd!)).toThrow(/EBADF/);
}

describe("bootstrap descriptor-bound artifact reads", () => {
  it.each(["migration", "config"])(
    "accepts canonical CRLF %s bytes and closes the descriptor",
    (kind) => {
      const f = fixture(kind);
      verifyBootstrapDirectory(f.root, f.artifact);
      expect(race.reads).toBe(1);
      assertClosed();
    },
  );
  it.each(["migration", "config"])(
    "rejects a %s pathname replaced after open before consuming bytes",
    (kind) => {
      const f = fixture(kind);
      race.afterOpen = () => {
        renameSync(race.target, race.target + ".original");
        writeFileSync(race.target, "replacement");
      };
      expect(() => verifyBootstrapDirectory(f.root, f.artifact)).toThrow(
        "BOOTSTRAP_ARTIFACT_INVALID",
      );
      expect(race.reads).toBe(0);
      assertClosed();
    },
  );
  it.each(["migration", "config"])(
    "reads the validated %s descriptor when its name is replaced after validation",
    (kind) => {
      const f = fixture(kind);
      race.afterStat = () => {
        race.afterStat = undefined;
        renameSync(race.target, race.target + ".original");
        writeFileSync(race.target, "replacement");
      };
      verifyBootstrapDirectory(f.root, f.artifact);
      expect(race.reads).toBe(1);
      assertClosed();
      expect(readFileSync(race.target, "utf8")).toBe("replacement");
      expect(() => verifyBootstrapDirectory(f.root, f.artifact)).toThrow(
        "BOOTSTRAP_ARTIFACT_DRIFT",
      );
    },
  );
  it("rejects a nonregular descriptor without reading and closes it", () => {
    const f = fixture("migration");
    race.nonregular = true;
    expect(() => verifyBootstrapDirectory(f.root, f.artifact)).toThrow(
      "BOOTSTRAP_ARTIFACT_INVALID",
    );
    expect(race.reads).toBe(0);
    assertClosed();
  });
  it("closes the descriptor if reading throws", () => {
    const f = fixture("migration");
    race.failRead = true;
    expect(() => verifyBootstrapDirectory(f.root, f.artifact)).toThrow(
      "SYNTHETIC_READ_FAILURE",
    );
    assertClosed();
  });
});

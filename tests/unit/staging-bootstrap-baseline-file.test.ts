import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { readBaselineEvidence } from "../../scripts/staging-bootstrap-baseline.mjs";

const state = vi.hoisted(() => ({
  root: "",
  target: "",
  fd: undefined as number | undefined,
  reads: 0,
  afterOpen: undefined as undefined | (() => void),
  afterStat: undefined as undefined | (() => void),
  nonregular: false,
  oversized: false,
  failRead: false,
}));
// Redirect only this reader's fixed evidence location into a disposable root.
// The actual path-boundary, descriptor and filesystem operations still execute.
vi.mock("node:url", async (original) => {
  const url = await original<typeof import("node:url")>();
  return {
    ...url,
    fileURLToPath: (...args: Parameters<typeof url.fileURLToPath>) => {
      const path = url.fileURLToPath(...args);
      if (state.root && resolve(path) === resolve(process.cwd()))
        return state.root;
      if (
        state.root &&
        path.endsWith("z".repeat(20) + ".json") &&
        path.includes("bootstrap-baselines")
      )
        return state.target;
      return path;
    },
  };
});
vi.mock("node:fs", async (original) => {
  const fs = await original<typeof import("node:fs")>();
  return {
    ...fs,
    openSync: (...args: Parameters<typeof fs.openSync>) => {
      const fd = fs.openSync(...args);
      if (args[0] === state.target) {
        state.fd = fd;
        state.afterOpen?.();
      }
      return fd;
    },
    fstatSync: (...args: any[]) => {
      const stat = (fs.fstatSync as any)(...args);
      if (args[0] === state.fd && args[1]?.bigint) {
        if (state.nonregular) stat.isFile = () => false;
        if (state.oversized) stat.size = 32n * 1024n * 1024n + 1n;
      }
      return stat;
    },
    lstatSync: (...args: any[]) => {
      const stat = (fs.lstatSync as any)(...args);
      if (args[0] === state.target && args[1]?.bigint) state.afterStat?.();
      return stat;
    },
    readFileSync: (...args: any[]) => {
      if (args[0] === state.fd || args[0] === state.target) {
        state.reads++;
        expect(args[0]).toBe(state.fd);
        if (state.failRead) throw Error("PRIVATE_READ_ERROR");
      }
      return (fs.readFileSync as any)(...args);
    },
  };
});
afterEach(() => {
  if (state.root) rmSync(state.root, { recursive: true, force: true });
  Object.assign(state, {
    root: "",
    target: "",
    fd: undefined,
    reads: 0,
    afterOpen: undefined,
    afterStat: undefined,
    nonregular: false,
    oversized: false,
    failRead: false,
  });
});
const project = "z".repeat(20);
function fixture(contents = '{"synthetic":true}\r\n') {
  state.root = mkdtempSync(join(tmpdir(), "baseline-reader-test-"));
  const directory = join(
    state.root,
    "output/staging-release/bootstrap-baselines",
  );
  mkdirSync(directory, { recursive: true });
  state.target = join(directory, `${project}.json`);
  writeFileSync(state.target, contents);
}
function closed() {
  expect(state.fd).toBeTypeOf("number");
  expect(() => fstatSync(state.fd!)).toThrow(/EBADF/);
}
function replace() {
  renameSync(state.target, state.target + ".original");
  writeFileSync(state.target, '{"replacement":true}');
}
describe("baseline evidence descriptor-bound reads", () => {
  it("reads ordinary JSON through the validated descriptor and closes it", () => {
    fixture();
    expect(readBaselineEvidence(project)).toEqual({ synthetic: true });
    expect(state.reads).toBe(1);
    closed();
  });
  it("rejects pathname replacement after open before reading", () => {
    fixture();
    state.afterOpen = replace;
    expect(() => readBaselineEvidence(project)).toThrow(
      "BOOTSTRAP_BASELINE_NOT_REGISTERED",
    );
    expect(state.reads).toBe(0);
    closed();
  });
  it("consumes the validated descriptor if the pathname changes after validation", () => {
    fixture();
    state.afterStat = () => {
      state.afterStat = undefined;
      replace();
    };
    expect(readBaselineEvidence(project)).toEqual({ synthetic: true });
    expect(state.reads).toBe(1);
    closed();
    expect(readFileSync(state.target + ".original", "utf8")).toContain(
      "synthetic",
    );
  });
  it.each(["nonregular", "oversized"] as const)(
    "rejects a %s descriptor without reading",
    (kind) => {
      fixture();
      state[kind] = true;
      expect(() => readBaselineEvidence(project)).toThrow(
        "BOOTSTRAP_BASELINE_NOT_REGISTERED",
      );
      expect(state.reads).toBe(0);
      closed();
    },
  );
  it.each(["read", "JSON"])(
    "closes on %s errors and sanitizes the failure",
    (kind) => {
      fixture(kind === "JSON" ? "private malformed contents" : undefined);
      state.failRead = kind === "read";
      expect(() => readBaselineEvidence(project)).toThrow(
        "BOOTSTRAP_BASELINE_NOT_REGISTERED",
      );
      closed();
    },
  );
  it("rejects an ancestor junction before opening evidence", () => {
    fixture();
    const output = join(state.root, "output");
    renameSync(output, output + "-real");
    symlinkSync(output + "-real", output, "junction");
    expect(() => readBaselineEvidence(project)).toThrow(
      "BOOTSTRAP_BASELINE_NOT_REGISTERED",
    );
    expect(state.fd).toBeUndefined();
    expect(state.reads).toBe(0);
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { closeSync, fstatSync, openSync, readSync, statSync } from "node:fs";
import { readPrivateCatalogueBinding } from "../../scripts/paddle-catalogue-private-binding";
vi.mock("node:fs", async (load) => {
  const fs = await load<typeof import("node:fs")>();
  return {
    ...fs,
    openSync: vi.fn(() => 42),
    closeSync: vi.fn(),
    realpathSync: vi.fn((path) => path),
    fstatSync: vi.fn(),
    statSync: vi.fn(),
    readSync: vi.fn(),
  };
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
describe("POSIX binding handle validation", () => {
  it("rejects permissions broadened before opening without reading bytes", () => {
    vi.stubGlobal("process", {
      ...process,
      platform: "linux",
      getuid: () => 123,
    });
    vi.mocked(fstatSync).mockReturnValue({
      isFile: () => true,
      size: 1,
      mode: 0o644,
      uid: 123,
    } as any);
    expect(() => readPrivateCatalogueBinding("/private/binding.json")).toThrow(
      "BINDING_FILE_UNSAFE",
    );
    expect(openSync).toHaveBeenCalledTimes(1);
    expect(statSync).not.toHaveBeenCalled();
    expect(readSync).not.toHaveBeenCalled();
    expect(closeSync).toHaveBeenCalledWith(42);
  });
  it("rejects a non-file descriptor before reading", () => {
    vi.stubGlobal("process", {
      ...process,
      platform: "linux",
      getuid: () => 123,
    });
    vi.mocked(fstatSync).mockReturnValue({ isFile: () => false } as any);
    expect(() => readPrivateCatalogueBinding("/private/binding.json")).toThrow(
      "BINDING_FILE_UNSAFE",
    );
    expect(readSync).not.toHaveBeenCalled();
    expect(closeSync).toHaveBeenCalledWith(42);
  });
  it("rejects a canonical path replaced after opening", () => {
    vi.stubGlobal("process", {
      ...process,
      platform: "linux",
      getuid: () => 123,
    });
    vi.mocked(fstatSync).mockReturnValue({
      isFile: () => true,
      size: 1,
      mode: 0o600,
      uid: 123,
      ino: 1,
      dev: 1,
    } as any);
    vi.mocked(statSync).mockReturnValue({ ino: 2, dev: 1 } as any);
    expect(() => readPrivateCatalogueBinding("/private/binding.json")).toThrow(
      "BINDING_FILE_UNSAFE",
    );
    expect(readSync).not.toHaveBeenCalled();
    expect(closeSync).toHaveBeenCalledWith(42);
  });
});

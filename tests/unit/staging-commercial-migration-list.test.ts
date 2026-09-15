import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { parseMigrationList } from "../../scripts/staging-commercial-apply.mjs";
import { validateRemoteHistory } from "../../scripts/staging-commercial-contracts.mjs";
import { scanRedaction } from "../../scripts/staging-commercial-evidence.mjs";

const fixture = (name: string) =>
  readFileSync(
    `tests/fixtures/staging-commercial/supabase-2.109.1-migration-list-${name}.json`,
    "utf8",
  );
const approved = JSON.parse(
  readFileSync("config/staging-commercial-certification.json", "utf8"),
).migrations.approved;
const versions = approved.slice(0, 3).map((m: any) => m.filename.slice(0, 14));
const table = (remote: string[]) =>
  "Local | Remote | Time\n----------------|----------------|---------------------\n" +
  versions
    .map((v: string) => `${v} | ${remote.includes(v) ? v : ""} | date`)
    .join("\n");
function reject(text: any, code = "MIGRATION_LEDGER_UNREADABLE") {
  let caught: any;
  try {
    parseMigrationList(text);
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(Error);
  expect(caught.message).toBe(code);
  expect(caught).not.toHaveProperty("cause");
  expect(caught).not.toHaveProperty("issues");
}

describe("pinned Supabase migration-list JSON contract", () => {
  it.each([
    ["empty", 0],
    ["one", 1],
    ["prefix", 3],
  ])("parses sanitized %s fixture in CLI order", (name, count) => {
    const text = fixture(name as string);
    expect(parseMigrationList(text)).toEqual(
      versions.slice(0, count as number),
    );
    expect(scanRedaction(JSON.parse(text))).toEqual([]);
  });
  it("accepts surrounding whitespace before JSON", () => {
    expect(parseMigrationList("\r\n\t " + fixture("empty") + " \n")).toEqual(
      [],
    );
  });
  it("passes empty JSON remote history with empty authorization and the real manifest", () => {
    expect(() =>
      validateRemoteHistory(approved, parseMigrationList(fixture("empty")), []),
    ).not.toThrow();
  });
  it.each(["one", "prefix"])(
    "rejects %s remote history with an empty authorization",
    (name) => {
      expect(() =>
        validateRemoteHistory(approved, parseMigrationList(fixture(name)), []),
      ).toThrow("REMOTE_MIGRATION_DRIFT");
    },
  );
  it("requires exact authorization and approved prefix after parsing", () => {
    const remote = parseMigrationList(fixture("prefix"));
    expect(() => validateRemoteHistory(approved, remote, remote)).not.toThrow();
    expect(() =>
      validateRemoteHistory(approved, remote, remote.slice(0, 2)),
    ).toThrow("REMOTE_MIGRATION_DRIFT");
    const nonPrefix = JSON.parse(fixture("prefix"));
    nonPrefix.migrations.shift();
    const parsed = parseMigrationList(JSON.stringify(nonPrefix));
    expect(() => validateRemoteHistory(approved, parsed, parsed)).toThrow(
      "REMOTE_MIGRATION_DRIFT",
    );
  });
  it.each([
    "{",
    "{not json",
    '{"migrations":',
    '{"migrations":[],}',
    "[",
    "null",
    "true",
    "42",
    '"display text"',
    "[]",
    "{}",
    '{"migrations":{}}',
  ])("rejects malformed or unknown JSON %#", (text) => reject(text));
  it.each([
    [
      "missing migrations",
      (v: any) => {
        delete v.migrations;
      },
    ],
    [
      "missing message",
      (v: any) => {
        delete v.message;
      },
    ],
    [
      "null message",
      (v: any) => {
        v.message = null;
      },
    ],
    [
      "object message",
      (v: any) => {
        v.message = {};
      },
    ],
    [
      "array message",
      (v: any) => {
        v.message = [];
      },
    ],
    [
      "unknown root field",
      (v: any) => {
        v.extra = "display";
      },
    ],
    [
      "object migrations",
      (v: any) => {
        v.migrations = {};
      },
    ],
    [
      "null migrations",
      (v: any) => {
        v.migrations = null;
      },
    ],
    [
      "string migrations",
      (v: any) => {
        v.migrations = "rows";
      },
    ],
    [
      "null row",
      (v: any) => {
        v.migrations[0] = null;
      },
    ],
    [
      "array row",
      (v: any) => {
        v.migrations[0] = [];
      },
    ],
    [
      "primitive row",
      (v: any) => {
        v.migrations[0] = 1;
      },
    ],
    [
      "unknown row field",
      (v: any) => {
        v.migrations[0].version = versions[0];
      },
    ],
    [
      "missing local",
      (v: any) => {
        delete v.migrations[0].local;
      },
    ],
    [
      "missing remote",
      (v: any) => {
        delete v.migrations[0].remote;
      },
    ],
    [
      "missing time",
      (v: any) => {
        delete v.migrations[0].time;
      },
    ],
    [
      "empty local",
      (v: any) => {
        v.migrations[0].local = "";
      },
    ],
    [
      "null local",
      (v: any) => {
        v.migrations[0].local = null;
      },
    ],
    [
      "short local",
      (v: any) => {
        v.migrations[0].local = "20260326";
      },
    ],
    [
      "nonnumeric local",
      (v: any) => {
        v.migrations[0].local = "a".repeat(14);
      },
    ],
    [
      "null remote",
      (v: any) => {
        v.migrations[0].remote = null;
      },
    ],
    [
      "numeric remote",
      (v: any) => {
        v.migrations[0].remote = Number(versions[0]);
      },
    ],
    [
      "short remote",
      (v: any) => {
        v.migrations[0].remote = versions[0].slice(1);
      },
    ],
    [
      "long remote",
      (v: any) => {
        v.migrations[0].remote = versions[0] + "0";
      },
    ],
    [
      "nonnumeric remote",
      (v: any) => {
        v.migrations[0].remote = "a".repeat(14);
      },
    ],
    [
      "whitespace remote",
      (v: any) => {
        v.migrations[0].remote = " " + versions[0];
      },
    ],
    [
      "array remote",
      (v: any) => {
        v.migrations[0].remote = [versions[0]];
      },
    ],
    [
      "object remote",
      (v: any) => {
        v.migrations[0].remote = { version: versions[0] };
      },
    ],
    [
      "null time",
      (v: any) => {
        v.migrations[0].time = null;
      },
    ],
    [
      "invalid time",
      (v: any) => {
        v.migrations[0].time = "not a timestamp";
      },
    ],
  ])("rejects %s", (_label, mutate) => {
    const value = JSON.parse(fixture("empty"));
    (mutate as (v: any) => void)(value);
    reject(JSON.stringify(value));
  });
  it.each([
    [
      "duplicate remote row",
      (v: any) => {
        v.migrations.splice(1, 0, { ...v.migrations[0] });
      },
    ],
    [
      "reordered rows",
      (v: any) => {
        v.migrations.reverse();
      },
    ],
    [
      "remote/local disagreement",
      (v: any) => {
        v.migrations[0].remote = versions[1];
      },
    ],
    [
      "duplicate local-only row",
      (v: any) => {
        v.migrations[0].remote = "";
        v.migrations.splice(1, 0, { ...v.migrations[0] });
      },
    ],
  ])("rejects ambiguous %s", (_label, mutate) => {
    const value = JSON.parse(fixture("prefix"));
    (mutate as (v: any) => void)(value);
    reject(JSON.stringify(value), "REMOTE_MIGRATION_DRIFT");
  });
  it("never falls back to a valid table after a JSON opening token", () => {
    for (const start of ["{", "["]) reject(start + "\n" + table([]));
  });
  it("never exposes raw parser input or JSON/schema exceptions", () => {
    const privateText =
      "Bearer synthetic-token https://private.example.invalid password=synthetic-password";
    reject('{"migrations":' + privateText);
    const value = JSON.parse(fixture("empty"));
    value.migrations[0].remote = privateText;
    reject(JSON.stringify(value));
    value.migrations[0].remote = "";
    value.message = privateText;
    expect(parseMigrationList(JSON.stringify(value))).toEqual([]);
  });
  it.each([undefined, null, 1, {}, []].map((input) => ({ input })))(
    "rejects non-text input %# with a static error",
    ({ input }) => reject(input),
  );
});

describe("legacy table compatibility", () => {
  it.each([[], versions.slice(0, 1), versions].map((remote) => ({ remote })))(
    "retains table remote versions %#",
    ({ remote }) => {
      expect(parseMigrationList(table(remote))).toEqual(remote);
    },
  );
  it("retains optional surrounding text, separators, and CRLF", () => {
    expect(
      parseMigrationList(
        "Display heading\r\n" +
          table(versions).replace(/\n/g, "\r\n") +
          "\r\nDisplay footer",
      ),
    ).toEqual(versions);
  });
  it("retains the table disagreement error", () => {
    reject(
      `Local | Remote | Time\n${versions[0]} | ${versions[1]} | date`,
      "REMOTE_MIGRATION_DRIFT",
    );
  });
  it("retains rejection of unreadable tables", () =>
    reject("unexpected private output"));
});

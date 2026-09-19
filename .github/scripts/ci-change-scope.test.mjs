import assert from "node:assert/strict";
import test from "node:test";
import { changedFiles, classifyChanges } from "./ci-change-scope.mjs";

test("documentation changes complete CI without either E2E suite", () => {
  assert.deepEqual(classifyChanges(["docs/design.md", "docs/nested/a b.md"]), {
    docs_only: true,
    configured_data_required: false,
  });
});

test("the CI implementation still requires local smoke, but no remote writes", () => {
  assert.deepEqual(
    classifyChanges([
      "docs/design.md",
      ".github/workflows/ci.yml",
      ".github/scripts/ci-change-scope.mjs",
      ".github/scripts/ci-change-scope.test.mjs",
    ]),
    { docs_only: false, configured_data_required: false },
  );
});

test("runtime, tests, dependencies, SQL and unknown paths require all checks", () => {
  for (const file of [
    "src/app.tsx",
    "tests/e2e/billing.spec.ts",
    "package-lock.json",
    "supabase/migrations/change.sql",
    "docs/script.mjs",
    ".github/workflows/other.yml",
    "README.md",
  ]) {
    assert.deepEqual(classifyChanges(["docs/design.md", file]), {
      docs_only: false,
      configured_data_required: true,
    });
  }
});

test("empty and manually dispatched comparisons require all checks", () => {
  assert.deepEqual(classifyChanges(changedFiles("workflow_dispatch", {})), {
    docs_only: false,
    configured_data_required: true,
  });
});

test("PR comparison includes the whole PR and both sides of renames", () => {
  const base = "a".repeat(40);
  const head = "b".repeat(40);
  const files = changedFiles(
    "pull_request",
    { pull_request: { base: { sha: base }, head: { sha: head } } },
    (command, args) => {
      assert.equal(command, "git");
      assert.deepEqual(args, [
        "diff",
        "--no-renames",
        "--name-only",
        "-z",
        `${base}...${head}`,
        "--",
      ]);
      return "src/old.ts\0docs/new.md\0";
    },
  );
  assert.equal(classifyChanges(files).configured_data_required, true);
});

test("push comparison covers the complete push", () => {
  const before = "a".repeat(40);
  const after = "b".repeat(40);
  changedFiles("push", { before, after }, (_command, args) => {
    assert.ok(args.includes(`${before}..${after}`));
    return "docs/design.md\0";
  });
});

test("bad revisions and Git failures cannot silently bypass tests", () => {
  assert.throws(() => changedFiles("pull_request", {}), /invalid/);
  assert.throws(
    () =>
      changedFiles(
        "push",
        {
          before: "a".repeat(40),
          after: "b".repeat(40),
        },
        () => {
          throw new Error("missing history");
        },
      ),
    /missing history/,
  );
});

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import assert from "node:assert/strict";
import ts from "typescript";

// Fixed local container only: no linked project, secrets, or external provider.
const payload = JSON.parse(
  execFileSync(
    "docker",
    [
      "exec",
      "supabase_db_coachos",
      "psql",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-At",
      "-c",
      "set role anon; select public.get_public_commercial_catalogue_v2();",
    ],
    { encoding: "utf8" },
  )
    .trim()
    .replace(/^SET\s*/, ""),
);
const path =
  "src/features/commercial-catalogue/public-catalogue-v2.generated.ts";
if (process.argv.includes("--write")) {
  writeFileSync(
    path,
    "export default " + JSON.stringify(payload, null, 2) + " as const;\n",
  );
  console.log(
    "Generated snapshot from local anonymous RPC. Review before committing.",
  );
} else {
  const javascript = ts.transpileModule(readFileSync(path, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.ESNext },
  }).outputText;
  const { default: snapshot } = await import(
    `data:text/javascript;base64,${Buffer.from(javascript).toString("base64")}`
  );
  assert.deepStrictEqual(
    payload,
    snapshot,
    "Local RPC differs from reviewed public snapshot",
  );
  console.log("Exact local anonymous RPC/snapshot parity passed.");
}

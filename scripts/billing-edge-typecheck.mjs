import { spawnSync } from "node:child_process";
import { BILLING_FUNCTIONS } from "./billing-deployment-contract.mjs";
const args = [
  "check",
  "--no-lock",
  ...(process.env.BILLING_DENO_OFFLINE === "1" ? ["--cached-only"] : []),
  ...BILLING_FUNCTIONS.map((n) => `supabase/functions/${n}/index.ts`),
];
const configured = process.env.BILLING_DENO_BINARY;
const result = configured
  ? spawnSync(configured, args, { stdio: "inherit", shell: false })
  : spawnSync(
      process.platform === "win32" ? "npx.cmd" : "npx",
      ["--yes", "deno@2.9.6", ...args],
      { stdio: "inherit", shell: false },
    );
process.exitCode =
  result.error || result.signal || !Number.isInteger(result.status)
    ? 1
    : result.status;

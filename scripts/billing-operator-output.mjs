import { writeFileSync } from "node:fs";
import { redactBillingPrivateValues } from "../src/lib/redact-billing-private-values.ts";

/** Shared console, browser AX snapshot, table, error and report boundary. */
export function createBillingOperatorOutput({
  stdout = (line) => process.stdout.write(line),
  stderr = (line) => process.stderr.write(line),
} = {}) {
  const aliases = new Map();
  const counts = new Map();
  const categories = new Set([
    "CHECKOUT",
    "TX",
    "CUSTOMER",
    "SUBSCRIPTION",
    "EVENT",
    "NOTIFICATION",
    "RESOURCE",
    "PRODUCT",
    "PRICE",
    "USER",
    "ACCOUNT",
  ]);
  const serialize = (value) => {
    try {
      const clean = redactBillingPrivateValues(value);
      return typeof clean === "string" ? clean : JSON.stringify(clean, null, 2);
    } catch {
      return "[output omitted: redaction failed]";
    }
  };
  return {
    sanitize: redactBillingPrivateValues,
    serialize,
    log: (...values) => stdout(values.map(serialize).join(" ") + "\n"),
    error: (...values) => stderr(values.map(serialize).join(" ") + "\n"),
    report: (path, value) =>
      writeFileSync(path, serialize(value) + "\n", { mode: 0o600 }),
    table: (rows) => stdout(serialize(rows) + "\n"),
    alias(category, privateValue) {
      if (!categories.has(category)) throw new Error("UNKNOWN_ALIAS_CATEGORY");
      let mapping = aliases.get(category);
      if (!mapping) aliases.set(category, (mapping = new Map()));
      if (!mapping.has(privateValue)) {
        let n = counts.get(category) ?? 0;
        counts.set(category, n + 1);
        let suffix = "";
        do {
          suffix = String.fromCharCode(65 + (n % 26)) + suffix;
          n = Math.floor(n / 26) - 1;
        } while (n >= 0);
        mapping.set(privateValue, `${category}-${suffix}`);
      }
      return mapping.get(privateValue);
    },
  };
}
export const billingOutput = createBillingOperatorOutput();

/** Suppress the browser's automatic raw snapshot output before rendering. */
export async function emitBillingSnapshot(tab, emit, output = billingOutput) {
  let safe;
  try {
    safe = output.serialize(await tab.getAXState({ emit: false }));
  } catch (error) {
    safe = output.serialize(error);
  }
  emit(safe);
}

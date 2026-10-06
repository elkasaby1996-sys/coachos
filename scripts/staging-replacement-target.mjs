// Source-reviewed policy. No environment variable can override this file.
import { readFileSync } from "node:fs";
// Keep this dependency-free: the logical-backup workflow deliberately does not
// install application packages before validating its target boundary.
const project = (value) =>
  typeof value === "string" && /^[a-z]{20}$/.test(value);
const keys = (value, expected) =>
  value &&
  typeof value === "object" &&
  !Array.isArray(value) &&
  JSON.stringify(Object.keys(value).sort()) ===
    JSON.stringify([...expected].sort());
function validatePolicy(value) {
  if (
    !keys(value, [
      "schemaVersion",
      "reviewedSource",
      "reviewedTree",
      "archivedProjects",
      "productionProject",
      "replacement",
    ]) ||
    value.schemaVersion !== 1 ||
    value.reviewedSource !== "d08a4ecd153da3425f8b09a3a315360a5ee23b06" ||
    value.reviewedTree !== "005a7c096d7476c980dcbde4a0b6d703757c6643" ||
    JSON.stringify(value.archivedProjects) !== '["dgogugyuyfourdttvwuy"]' ||
    value.productionProject !== "btrfmxjpjzbyowtvncnc" ||
    !(
      value.replacement === null ||
      (keys(value.replacement, ["project", "origin"]) &&
        project(value.replacement.project) &&
        typeof value.replacement.origin === "string")
    )
  )
    throw new Error("REPLACEMENT_POLICY_INVALID");
  if (value.replacement) {
    let url;
    try {
      url = new URL(value.replacement.origin);
    } catch {
      throw new Error("REPLACEMENT_POLICY_INVALID");
    }
    if (
      url.protocol !== "https:" ||
      url.origin !== value.replacement.origin ||
      url.username ||
      url.password ||
      url.port ||
      !/^(?:[a-z0-9-]+\.)*[a-z0-9-]+\.[a-z]{2,}$/.test(url.hostname) ||
      /(localhost|\.local$|\.internal$|\.test$|\.invalid$)/.test(
        url.hostname,
      ) ||
      !/(^|[.-])staging([.-]|$)/.test(url.hostname) ||
      /(^|[.-])(prod|production)([.-]|$)/.test(url.hostname)
    )
      throw new Error("REPLACEMENT_POLICY_INVALID");
  }
  return value;
}
export function replacementPolicy() {
  return validatePolicy(
    JSON.parse(
      readFileSync(
        new URL("../config/staging-replacement-target.json", import.meta.url),
        "utf8",
      ),
    ),
  );
}
export function assertReplacementTarget(
  target,
  origin,
  policy = replacementPolicy(),
  requireConfigured = false,
) {
  const p = validatePolicy(policy);
  if (
    !project(target) ||
    p.archivedProjects.includes(target) ||
    target === p.productionProject
  )
    throw new Error("REPLACEMENT_TARGET_DENIED");
  if (requireConfigured && !p.replacement)
    throw new Error("REPLACEMENT_NOT_CONFIGURED");
  if (p.replacement) {
    if (
      p.archivedProjects.includes(p.replacement.project) ||
      p.replacement.project === p.productionProject ||
      target !== p.replacement.project ||
      (origin !== undefined && origin !== p.replacement.origin)
    )
      throw new Error("REPLACEMENT_TARGET_MISMATCH");
  }
  return p;
}

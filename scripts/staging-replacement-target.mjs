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
      "archivedOrigins",
      "productionProject",
      "productionOrigin",
      "replacement",
    ]) ||
    value.schemaVersion !== 3 ||
    value.reviewedSource !== "d08a4ecd153da3425f8b09a3a315360a5ee23b06" ||
    value.reviewedTree !== "005a7c096d7476c980dcbde4a0b6d703757c6643" ||
    JSON.stringify(value.archivedProjects) !== '["dgogugyuyfourdttvwuy"]' ||
    value.productionProject !== "btrfmxjpjzbyowtvncnc" ||
    !(
      value.productionOrigin === null || canonicalOrigin(value.productionOrigin)
    ) ||
    !(
      value.archivedOrigins === null ||
      (Array.isArray(value.archivedOrigins) &&
        value.archivedOrigins.length > 0 &&
        new Set(value.archivedOrigins).size === value.archivedOrigins.length &&
        value.archivedOrigins.every(canonicalOrigin))
    ) ||
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
function canonicalOrigin(value) {
  try {
    const url = new URL(value);
    return (
      typeof value === "string" &&
      url.protocol === "https:" &&
      url.origin === value &&
      !url.username &&
      !url.password &&
      !url.port
    );
  } catch {
    return false;
  }
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
    target === p.productionProject ||
    (origin !== undefined && origin === p.productionOrigin) ||
    (origin !== undefined && p.archivedOrigins?.includes(origin))
  )
    throw new Error("REPLACEMENT_TARGET_DENIED");
  if (requireConfigured && !p.replacement)
    throw new Error("REPLACEMENT_NOT_CONFIGURED");
  if (p.replacement) {
    if (!p.archivedOrigins) throw new Error("ARCHIVED_ORIGINS_REVIEW_REQUIRED");
    if (!p.productionOrigin)
      throw new Error("PRODUCTION_ORIGIN_REVIEW_REQUIRED");
    if (
      p.archivedProjects.includes(p.replacement.project) ||
      p.replacement.project === p.productionProject ||
      target !== p.replacement.project ||
      p.archivedOrigins.includes(p.replacement.origin) ||
      p.replacement.origin === p.productionOrigin ||
      origin !== p.replacement.origin
    )
      throw new Error("REPLACEMENT_TARGET_MISMATCH");
  }
  return p;
}

// Exact relations only: neither schemas nor pg_dump patterns are accepted.
export const MANAGED_COMPATIBILITY_EXCLUSIONS = Object.freeze([
  "auth.mfa_recovery_code_sets",
  "auth.mfa_recovery_codes",
  "auth.scim_tokens",
  "auth.scim_users",
  "auth.one_time_tokens",
]);

function fail() {
  // SQL, relation names and rows must never leak through validation errors.
  throw new Error("Portable backup data validation failed.");
}

export function validateManagedExclusions(exclusions) {
  if (!Array.isArray(exclusions)) fail();
  const seen = new Set();
  for (const relation of exclusions) {
    if (
      typeof relation !== "string" ||
      !/^auth\.[a-z][a-z0-9_]*$/.test(relation) ||
      relation === "auth.users" ||
      !MANAGED_COMPATIBILITY_EXCLUSIONS.includes(relation) ||
      seen.has(relation)
    )
      fail();
    seen.add(relation);
  }
  return [...seen];
}

export function managedExclusionArgument() {
  return validateManagedExclusions(MANAGED_COMPATIBILITY_EXCLUSIONS).join(",");
}

// Accept pg_dump's one-line, schema-qualified COPY ... FROM stdin format.
// Preserve byte offsets: decoding/re-encoding the SQL would alter retained data.
const identifier = String.raw`(?:"(?:[^"\r\n]|"")+"|[a-zA-Z_][a-zA-Z0-9_$]*)`;
const copyHeader = new RegExp(
  String.raw`^COPY[ \t]+(${identifier})\.(${identifier})[ \t]+\(${identifier}(?:,[ \t]*${identifier})*\)[ \t]+FROM[ \t]+stdin;$`,
  "i",
);
const unquote = (value) =>
  value.startsWith('"')
    ? value.slice(1, -1).replaceAll('""', '"')
    : value.toLowerCase();

export function inspectCopyData(bytes) {
  if (!Buffer.isBuffer(bytes) || !bytes.length) fail();
  const blocks = [];
  const seen = new Set();
  let active;
  for (let start = 0; start < bytes.length; ) {
    const newline = bytes.indexOf(10, start);
    const end = newline === -1 ? bytes.length : newline + 1;
    let textEnd = newline === -1 ? end : newline;
    if (bytes[textEnd - 1] === 13) textEnd--;
    const line = bytes.subarray(start, textEnd).toString("utf8");
    if (active) {
      if (line === "\\.") {
        blocks.push({ ...active, end });
        active = undefined;
      } else if (/^\s*COPY\b/i.test(line)) {
        // A missing terminator must not swallow the next application's block.
        // Ambiguous COPY-looking data rows require private manual review.
        fail();
      }
    } else if (/^\s*COPY\b/i.test(line)) {
      const match = copyHeader.exec(line);
      if (!match) fail();
      const schema = unquote(match[1]);
      const table = unquote(match[2]);
      const key = JSON.stringify([schema, table]);
      if (seen.has(key)) fail();
      seen.add(key);
      active = { schema, table, start };
    } else if (
      line.trim() &&
      !/^--/.test(line) &&
      !/^(?:SET [^;]+;|RESET ALL;|SELECT pg_catalog\.(?:setval|set_config)\(.*\);)$/.test(
        line,
      )
    ) {
      // Reject INSERT dumps, multiline/unknown statements and orphan terminators.
      fail();
    }
    start = end;
  }
  if (active) fail();
  return blocks;
}

function recoveryBoundary(blocks) {
  const publicCopyTargetCount = blocks.filter(
    (b) => b.schema === "public",
  ).length;
  const authUsersIncluded = blocks.some(
    (b) => b.schema === "auth" && b.table === "users",
  );
  if (!publicCopyTargetCount || !authUsersIncluded) fail();
  return {
    authUsersIncluded,
    publicCopyTargetCount,
    copyTargetCount: blocks.length,
  };
}

function isExcluded(block, exclusions) {
  return block.schema === "auth" && exclusions.includes(`auth.${block.table}`);
}

// Normal workflow: native dump-time exclusions, followed by read-only validation.
export function validatePortableData(bytes) {
  const exclusions = validateManagedExclusions(
    MANAGED_COMPATIBILITY_EXCLUSIONS,
  );
  const blocks = inspectCopyData(bytes);
  if (blocks.some((b) => isExcluded(b, exclusions))) fail();
  return {
    portableRestoreData: true,
    managedCompatibilityExclusions: exclusions,
    ...recoveryBoundary(blocks),
    applicationSchemasExcluded: false,
  };
}

// Offline compatibility derivative for older raw dumps. Never used to silently
// repair native workflow output. Every requested block must exist exactly once.
export function filterManagedCopyBlocks(
  bytes,
  requested = MANAGED_COMPATIBILITY_EXCLUSIONS,
) {
  const exclusions = validateManagedExclusions(requested);
  const blocks = inspectCopyData(bytes);
  recoveryBoundary(blocks);
  const removed = blocks.filter((b) => isExcluded(b, exclusions));
  if (removed.length !== exclusions.length) fail();
  const retained = [];
  let cursor = 0;
  for (const block of removed) {
    retained.push(bytes.subarray(cursor, block.start));
    cursor = block.end;
  }
  retained.push(bytes.subarray(cursor));
  return Buffer.concat(retained);
}

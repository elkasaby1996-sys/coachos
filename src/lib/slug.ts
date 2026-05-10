export const RESERVED_SLUGS = new Set([
  "admin",
  "api",
  "app",
  "auth",
  "login",
  "logout",
  "settings",
  "billing",
  "support",
  "help",
  "new",
  "edit",
  "public",
  "profile",
  "pt-hub",
  "w",
  "p",
  "workspace",
  "workspaces",
  "client",
  "clients",
  "lead",
  "leads",
]);

const DEFAULT_MAX_SLUG_LENGTH = 56;

export function normalizeSlugCandidate(
  value: string,
  options: { maxLength?: number; fallback?: string } = {},
) {
  const maxLength = options.maxLength ?? DEFAULT_MAX_SLUG_LENGTH;
  const fallback = options.fallback ?? "workspace";
  const compact = value
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");
  const truncated = compact.slice(0, maxLength).replace(/^-+|-+$/g, "");
  const lastDash = truncated.lastIndexOf("-");
  const normalized =
    compact.length > maxLength && lastDash > 0
      ? truncated.slice(0, lastDash)
      : truncated;

  return normalized || fallback;
}

export function isReservedSlug(value: string) {
  return RESERVED_SLUGS.has(value.trim().toLowerCase());
}

export function normalizeSlug(
  value: string,
  options: { maxLength?: number } = {},
) {
  const trimmed = value.trim();
  const normalized = normalizeSlugCandidate(trimmed, options);

  if (trimmed !== normalized) {
    throw new Error("Slug must be lowercase kebab-case.");
  }
  if (isReservedSlug(normalized)) {
    throw new Error("This slug is reserved.");
  }
  return normalized;
}

export function buildUniqueSlug(
  value: string,
  existingSlugs: Iterable<string>,
  options: { maxLength?: number; fallback?: string } = {},
) {
  const maxLength = options.maxLength ?? DEFAULT_MAX_SLUG_LENGTH;
  const existing = new Set(
    Array.from(existingSlugs, (slug) => slug.trim().toLowerCase()),
  );
  const base = normalizeSlugCandidate(value, options);
  const safeBase = isReservedSlug(base)
    ? normalizeSlugCandidate(`${base}-workspace`, { maxLength })
    : base;

  if (!existing.has(safeBase)) return safeBase;

  for (let suffix = 2; suffix < 10_000; suffix += 1) {
    const suffixText = `-${suffix}`;
    const candidate = `${safeBase.slice(0, maxLength - suffixText.length)}${suffixText}`;
    if (!existing.has(candidate)) return candidate;
  }

  throw new Error("Unable to generate a unique slug.");
}

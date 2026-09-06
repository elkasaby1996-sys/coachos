export const PUBLIC_PROFILE_SLUG_MIN_LENGTH = 3;
export const PUBLIC_PROFILE_SLUG_MAX_LENGTH = 40;
export const PUBLIC_PROFILE_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const RESERVED_PUBLIC_PROFILE_SLUGS = new Set([
  "admin",
  "api",
  "app",
  "login",
  "signup",
  "settings",
  "billing",
  "support",
  "help",
  "coach",
  "coaches",
  "pt",
  "profile",
  "marketplace",
  "dashboard",
  "workspaces",
  "clients",
  "messages",
  "terms",
  "privacy",
]);

export type PublicProfileSlugValidation = {
  slug: string;
  valid: boolean;
  error: string | null;
};

export function normalizePublicProfileSlug(value: string | null | undefined) {
  return value?.trim() ?? "";
}

export function validatePublicProfileSlug(
  value: string | null | undefined,
  options: { allowEmpty?: boolean } = {},
): PublicProfileSlugValidation {
  const slug = normalizePublicProfileSlug(value);

  if (!slug) {
    return options.allowEmpty
      ? { slug, valid: true, error: null }
      : {
          slug,
          valid: false,
          error: "Public slug is required.",
        };
  }

  if (slug.length < PUBLIC_PROFILE_SLUG_MIN_LENGTH) {
    return {
      slug,
      valid: false,
      error: "Public slug must be at least 3 characters.",
    };
  }

  if (slug.length > PUBLIC_PROFILE_SLUG_MAX_LENGTH) {
    return {
      slug,
      valid: false,
      error: "Public slug must be 40 characters or fewer.",
    };
  }

  if (RESERVED_PUBLIC_PROFILE_SLUGS.has(slug)) {
    return {
      slug,
      valid: false,
      error: "This public slug is reserved.",
    };
  }

  if (!PUBLIC_PROFILE_SLUG_PATTERN.test(slug)) {
    return {
      slug,
      valid: false,
      error:
        "Use lowercase letters, numbers, and single hyphens only. No spaces, underscores, uppercase letters, or leading/trailing hyphens.",
    };
  }

  return { slug, valid: true, error: null };
}

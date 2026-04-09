const ACTION_GUARD_STORAGE_PREFIX = "coachos-action-guard:";

function normalizeScope(scope?: string | null) {
  return (scope ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9:_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function buildStorageKey(action: string, scope?: string | null) {
  const normalizedAction = normalizeScope(action) || "action";
  const normalizedScope = normalizeScope(scope);
  return `${ACTION_GUARD_STORAGE_PREFIX}${normalizedAction}${normalizedScope ? `:${normalizedScope}` : ""}`;
}

function readCooldownExpiry(storageKey: string) {
  if (typeof window === "undefined") return 0;
  const raw = window.localStorage.getItem(storageKey);
  if (!raw) return 0;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

function writeCooldownExpiry(storageKey: string, expiresAt: number) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(storageKey, String(expiresAt));
}

function formatRemainingTime(remainingMs: number) {
  const totalSeconds = Math.max(1, Math.ceil(remainingMs / 1000));
  if (totalSeconds < 60) {
    return `${totalSeconds} second${totalSeconds === 1 ? "" : "s"}`;
  }

  const totalMinutes = Math.ceil(totalSeconds / 60);
  return `${totalMinutes} minute${totalMinutes === 1 ? "" : "s"}`;
}

export function getActionErrorMessage(
  error: unknown,
  fallback = "Something went wrong.",
) {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  if (typeof error === "object" && error !== null && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) {
      return message;
    }
  }

  return fallback;
}

export async function runClientGuardedAction<T>(params: {
  action: string;
  cooldownMs: number;
  scope?: string | null;
  message?: string;
  run: () => Promise<T>;
}) {
  const storageKey = buildStorageKey(params.action, params.scope);
  const now = Date.now();
  const expiresAt = readCooldownExpiry(storageKey);
  const remainingMs = expiresAt - now;

  if (remainingMs > 0) {
    throw new Error(
      params.message ??
        `Please wait ${formatRemainingTime(remainingMs)} before trying again.`,
    );
  }

  writeCooldownExpiry(storageKey, now + params.cooldownMs);
  return params.run();
}

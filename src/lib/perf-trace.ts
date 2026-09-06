const PERF_TRACE_PREFIX = "[repsync:perf]";
const PERF_TRACE_STORAGE_KEY = "repsync_perf";

function isPerfTraceEnabled() {
  if (!import.meta.env.DEV || typeof window === "undefined") return false;

  try {
    const search = new URLSearchParams(window.location.search);
    const queryFlag = search.get("perf");
    if (queryFlag) {
      return ["1", "true", "yes", "on"].includes(queryFlag.toLowerCase());
    }

    return (
      window.localStorage.getItem(PERF_TRACE_STORAGE_KEY)?.toLowerCase() ===
      "true"
    );
  } catch {
    return false;
  }
}

function now() {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

function formatDetails(details?: Record<string, unknown>) {
  if (!details) return "";
  const entries = Object.entries(details)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}=${formatValue(key, value)}`);
  return entries.length > 0 ? ` ${entries.join(" ")}` : "";
}

function formatValue(key: string, value: unknown) {
  if (value === null) return "null";
  if (typeof value === "string") {
    if (key.toLowerCase().includes("userid")) {
      return shortenValue(value);
    }
    return value;
  }
  if (
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "bigint"
  ) {
    return String(value);
  }
  return "[object]";
}

function shortenValue(value: string) {
  if (value.length <= 12) return value;
  return `${value.slice(0, 8)}...`;
}

export function traceStart(label: string, details?: Record<string, unknown>) {
  const startedAt = now();
  if (isPerfTraceEnabled()) {
    const nextDetails = { at: Math.round(startedAt), ...details };
    console.info(
      `${PERF_TRACE_PREFIX} ${label}:start${formatDetails(nextDetails)}`,
    );
  }
  return startedAt;
}

export function traceEnd(
  label: string,
  startedAt: number,
  details?: Record<string, unknown>,
) {
  if (!isPerfTraceEnabled()) return;
  const endedAt = now();
  const nextDetails = {
    durationMs: Math.round(endedAt - startedAt),
    at: Math.round(endedAt),
    ...details,
  };
  console.info(
    `${PERF_TRACE_PREFIX} ${label}:end${formatDetails(nextDetails)}`,
  );
}

export async function traceAsync<T>(
  label: string,
  operation: () => PromiseLike<T>,
  details?: Record<string, unknown>,
) {
  const startedAt = traceStart(label, details);
  try {
    return await Promise.resolve(operation());
  } finally {
    traceEnd(label, startedAt, details);
  }
}

export function tracePoint(label: string, details?: Record<string, unknown>) {
  if (!isPerfTraceEnabled()) return;
  const nextDetails = {
    at: Math.round(now()),
    ...details,
  };
  console.info(`${PERF_TRACE_PREFIX} ${label}${formatDetails(nextDetails)}`);
}

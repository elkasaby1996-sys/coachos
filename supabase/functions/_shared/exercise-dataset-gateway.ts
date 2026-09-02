export const exerciseDatasetGatewayCorsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export const EXERCISE_DATASET_GATEWAY_ROUTE = "exercise-dataset-search";
export const EXERCISE_DATASET_DEFAULT_LIMIT = 24;
export const EXERCISE_DATASET_MAX_LIMIT = 50;
export const EXERCISE_DATASET_PROVIDER_TIMEOUT_MS = 10_000;
export const EXERCISE_DATASET_MAX_PROVIDER_RESPONSE_BYTES = 2_000_000;

export type ExerciseDatasetGatewayErrorCode =
  | "unauthenticated"
  | "forbidden"
  | "invalid_request"
  | "provider_not_configured"
  | "provider_rate_limited"
  | "provider_timeout"
  | "provider_unavailable"
  | "provider_invalid_response"
  | "unknown_provider_error";

export type ExerciseDatasetGatewaySearchInput = {
  operation: "search";
  name: string;
  bodyPart: string;
  equipment: string;
  target: string;
  exerciseType: string;
  limit: number;
  cursor: string | null;
};

export type ExerciseDatasetGatewayDetailInput = {
  operation: "detail";
  exerciseId: string;
};

export type ExerciseDatasetMetadataKind =
  | "muscles"
  | "bodyparts"
  | "equipments"
  | "exercisetypes";

export type ExerciseDatasetGatewayMetadataInput = {
  operation: "metadata";
  metadata: ExerciseDatasetMetadataKind;
};

export type ExerciseDatasetGatewayInput =
  | ExerciseDatasetGatewaySearchInput
  | ExerciseDatasetGatewayDetailInput
  | ExerciseDatasetGatewayMetadataInput;

export type ExerciseDatasetProviderConfig = {
  baseUrl: string;
  apiKey: string;
  apiKeyHeader?: string;
  apiHost?: string;
};

export type ExerciseDatasetGatewayLog = {
  correlationId: string;
  operation:
    | "exercise_dataset_search"
    | "exercise_dataset_detail"
    | "exercise_dataset_metadata";
  provider: "exercise_dataset";
  statusCategory: "success" | "rejected" | "failure";
  elapsedMs: number;
  errorCode?: ExerciseDatasetGatewayErrorCode;
  userId?: string;
};

type GatewayDependencies = {
  authenticate: (accessToken: string) => Promise<{ id: string } | null>;
  authorize: (userId: string) => Promise<boolean>;
  getProviderConfig: () => ExerciseDatasetProviderConfig | null;
  fetchImpl?: typeof fetch;
  correlationId?: () => string;
  now?: () => number;
  providerTimeoutMs?: number;
  log?: (event: ExerciseDatasetGatewayLog) => void;
};

const errorMessages: Record<ExerciseDatasetGatewayErrorCode, string> = {
  unauthenticated: "A valid RepSync session is required.",
  forbidden: "This RepSync account cannot access the exercise provider.",
  invalid_request: "The exercise search request is invalid.",
  provider_not_configured: "The exercise provider is not configured.",
  provider_rate_limited:
    "The exercise provider is rate-limited. Wait a moment and try again.",
  provider_timeout: "The exercise provider took too long to respond.",
  provider_unavailable:
    "The exercise provider is temporarily unavailable. Try again shortly.",
  provider_invalid_response:
    "The exercise provider returned an invalid response.",
  unknown_provider_error:
    "The exercise provider request could not be completed.",
};

const allowedRequestKeys = new Set([
  "exerciseId",
  "metadata",
  "name",
  "bodyPart",
  "equipment",
  "target",
  "exerciseType",
  "limit",
  "cursor",
]);

const exerciseDatasetMetadataKinds = new Set<ExerciseDatasetMetadataKind>([
  "muscles",
  "bodyparts",
  "equipments",
  "exercisetypes",
]);

const stringLimits = {
  exerciseId: 200,
  name: 200,
  bodyPart: 120,
  equipment: 120,
  target: 120,
  exerciseType: 120,
  cursor: 1_024,
} as const;

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...exerciseDatasetGatewayCorsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function errorResponse(
  code: ExerciseDatasetGatewayErrorCode,
  status: number,
  correlationId: string,
) {
  return jsonResponse(
    {
      error: {
        code,
        message: errorMessages[code],
        correlationId,
      },
    },
    status,
  );
}

function readOptionalString(
  record: Record<string, unknown>,
  key: "name" | "bodyPart" | "equipment" | "target" | "exerciseType",
) {
  const value = record[key];
  if (value === undefined || value === null) return "";
  if (typeof value !== "string" || value.length > stringLimits[key]) {
    return null;
  }
  return value.trim();
}

export function validateExerciseDatasetGatewayInput(
  value: unknown,
): { ok: true; value: ExerciseDatasetGatewayInput } | { ok: false } {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false };
  }

  const record = value as Record<string, unknown>;
  if (Object.keys(record).some((key) => !allowedRequestKeys.has(key))) {
    return { ok: false };
  }

  if (record.metadata !== undefined) {
    if (
      Object.keys(record).some((key) => key !== "metadata") ||
      typeof record.metadata !== "string" ||
      !exerciseDatasetMetadataKinds.has(
        record.metadata as ExerciseDatasetMetadataKind,
      )
    ) {
      return { ok: false };
    }
    return {
      ok: true,
      value: {
        operation: "metadata",
        metadata: record.metadata as ExerciseDatasetMetadataKind,
      },
    };
  }

  if (record.exerciseId !== undefined) {
    if (
      Object.keys(record).some((key) => key !== "exerciseId") ||
      typeof record.exerciseId !== "string" ||
      !record.exerciseId.trim() ||
      record.exerciseId.length > stringLimits.exerciseId ||
      !/^[A-Za-z0-9_-]+$/.test(record.exerciseId.trim())
    ) {
      return { ok: false };
    }
    return {
      ok: true,
      value: { operation: "detail", exerciseId: record.exerciseId.trim() },
    };
  }

  const name = readOptionalString(record, "name");
  const bodyPart = readOptionalString(record, "bodyPart");
  const equipment = readOptionalString(record, "equipment");
  const target = readOptionalString(record, "target");
  const exerciseType = readOptionalString(record, "exerciseType");
  if (
    name === null ||
    bodyPart === null ||
    equipment === null ||
    target === null ||
    exerciseType === null
  ) {
    return { ok: false };
  }

  const limit = record.limit ?? EXERCISE_DATASET_DEFAULT_LIMIT;
  if (
    typeof limit !== "number" ||
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > EXERCISE_DATASET_MAX_LIMIT
  ) {
    return { ok: false };
  }

  const cursorValue = record.cursor;
  if (
    cursorValue !== undefined &&
    cursorValue !== null &&
    (typeof cursorValue !== "string" ||
      cursorValue.length > stringLimits.cursor)
  ) {
    return { ok: false };
  }
  const cursor =
    typeof cursorValue === "string" && cursorValue.trim()
      ? cursorValue.trim()
      : null;

  return {
    ok: true,
    value: {
      operation: "search",
      name,
      bodyPart,
      equipment,
      target,
      exerciseType,
      limit,
      cursor,
    },
  };
}

export function decideExerciseProviderAccess(input: {
  hasPtWorkspaceMembership: boolean;
  ownsWorkspace: boolean;
  hasPtHubProfile: boolean;
  hasPtProfile: boolean;
}) {
  return (
    input.hasPtWorkspaceMembership ||
    input.ownsWorkspace ||
    input.hasPtHubProfile ||
    input.hasPtProfile
  );
}

export function normalizeExerciseDatasetProviderConfig(
  config: ExerciseDatasetProviderConfig | null,
):
  | (Required<Omit<ExerciseDatasetProviderConfig, "apiHost">> & {
      apiHost: string;
    })
  | null {
  if (!config) return null;
  const baseUrl = config.baseUrl.trim().replace(/\/+$/, "");
  const apiKey = config.apiKey.trim();
  const apiKeyHeader = (config.apiKeyHeader ?? "x-api-key").trim();
  const apiHost = (config.apiHost ?? "").trim();
  if (
    !baseUrl ||
    !apiKey ||
    !/^[A-Za-z0-9!#$%&'*+.^_`|~-]+$/.test(apiKeyHeader)
  ) {
    return null;
  }
  if (
    apiHost.includes("\r") ||
    apiHost.includes("\n") ||
    apiHost.length > 255
  ) {
    return null;
  }
  try {
    const parsed = new URL(baseUrl);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
  } catch {
    return null;
  }
  return { baseUrl, apiKey, apiKeyHeader, apiHost };
}

export function buildExerciseDatasetProviderRequest(
  input: ExerciseDatasetGatewayInput,
  config: Required<Omit<ExerciseDatasetProviderConfig, "apiHost">> & {
    apiHost: string;
  },
) {
  const url = new URL(
    input.operation === "detail"
      ? `${config.baseUrl}/api/v1/exercises/${encodeURIComponent(input.exerciseId)}`
      : input.operation === "metadata"
        ? `${config.baseUrl}/api/v1/${input.metadata}`
        : `${config.baseUrl}/api/v1/exercises`,
  );
  if (input.operation === "detail" || input.operation === "metadata") {
    const headers: Record<string, string> = {
      Accept: "application/json",
      [config.apiKeyHeader]: config.apiKey,
    };
    if (config.apiHost) headers["X-RapidAPI-Host"] = config.apiHost;
    return { url: url.toString(), headers };
  }

  url.searchParams.set("limit", String(input.limit));
  if (input.name) url.searchParams.set("name", input.name);
  if (input.bodyPart) url.searchParams.set("bodyParts", input.bodyPart);
  if (input.equipment) url.searchParams.set("equipments", input.equipment);
  if (input.target) url.searchParams.set("targetMuscles", input.target);
  if (input.exerciseType) {
    url.searchParams.set("exerciseType", input.exerciseType);
  }
  if (input.cursor) url.searchParams.set("after", input.cursor);

  const headers: Record<string, string> = {
    Accept: "application/json",
    [config.apiKeyHeader]: config.apiKey,
  };
  if (config.apiHost) headers["X-RapidAPI-Host"] = config.apiHost;
  return { url: url.toString(), headers };
}

export function hasExerciseDatasetList(payload: unknown) {
  if (Array.isArray(payload)) return true;
  if (!payload || typeof payload !== "object") return false;
  const record = payload as Record<string, unknown>;
  return ["data", "results", "items", "exercises"].some((key) =>
    Array.isArray(record[key]),
  );
}

export function hasExerciseDatasetDetail(payload: unknown) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return false;
  }
  const record = payload as Record<string, unknown>;
  const candidate =
    record.data &&
    typeof record.data === "object" &&
    !Array.isArray(record.data)
      ? (record.data as Record<string, unknown>)
      : record;
  return (
    (typeof candidate.exerciseId === "string" ||
      typeof candidate.exerciseId === "number" ||
      typeof candidate.id === "string" ||
      typeof candidate.id === "number") &&
    typeof candidate.name === "string"
  );
}

export function hasExerciseDatasetMetadataList(payload: unknown) {
  const candidates = Array.isArray(payload)
    ? payload
    : payload && typeof payload === "object"
      ? (payload as Record<string, unknown>).data
      : null;
  if (!Array.isArray(candidates)) return false;
  return candidates.every((candidate) => {
    if (typeof candidate === "string") return Boolean(candidate.trim());
    if (
      !candidate ||
      typeof candidate !== "object" ||
      Array.isArray(candidate)
    ) {
      return false;
    }
    const name = (candidate as Record<string, unknown>).name;
    return typeof name === "string" && Boolean(name.trim());
  });
}

function isAbortError(error: unknown) {
  return (
    (error instanceof DOMException && error.name === "AbortError") ||
    (error instanceof Error && error.name === "AbortError")
  );
}

async function readBoundedResponseText(
  response: Response,
  maximumBytes: number,
) {
  if (!response.body) return "";

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let receivedBytes = 0;
  let text = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    receivedBytes += value.byteLength;
    if (receivedBytes > maximumBytes) {
      await reader.cancel();
      return null;
    }
    text += decoder.decode(value, { stream: true });
  }

  return text + decoder.decode();
}

export async function handleExerciseDatasetGatewayRequest(
  request: Request,
  dependencies: GatewayDependencies,
) {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: exerciseDatasetGatewayCorsHeaders });
  }

  const correlationId = dependencies.correlationId?.() ?? crypto.randomUUID();
  const now = dependencies.now ?? Date.now;
  const startedAt = now();
  let userId: string | undefined;
  let operation: ExerciseDatasetGatewayLog["operation"] =
    "exercise_dataset_search";
  const log = (
    statusCategory: ExerciseDatasetGatewayLog["statusCategory"],
    errorCode?: ExerciseDatasetGatewayErrorCode,
  ) =>
    dependencies.log?.({
      correlationId,
      operation,
      provider: "exercise_dataset",
      statusCategory,
      elapsedMs: Math.max(0, now() - startedAt),
      errorCode,
      userId,
    });
  const reject = (
    code: ExerciseDatasetGatewayErrorCode,
    status: number,
    category: "rejected" | "failure" = "rejected",
  ) => {
    log(category, code);
    return errorResponse(code, status, correlationId);
  };

  if (request.method !== "POST") {
    return reject("invalid_request", 405);
  }

  const authHeader = request.headers.get("Authorization") ?? "";
  const accessToken = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!/^Bearer\s+/i.test(authHeader) || !accessToken) {
    return reject("unauthenticated", 401);
  }

  try {
    const user = await dependencies.authenticate(accessToken);
    if (!user) return reject("unauthenticated", 401);
    userId = user.id;

    if (!(await dependencies.authorize(user.id))) {
      return reject("forbidden", 403);
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return reject("invalid_request", 400);
    }
    const validation = validateExerciseDatasetGatewayInput(body);
    if (!validation.ok) return reject("invalid_request", 400);
    operation =
      validation.value.operation === "detail"
        ? "exercise_dataset_detail"
        : validation.value.operation === "metadata"
          ? "exercise_dataset_metadata"
          : "exercise_dataset_search";

    const config = normalizeExerciseDatasetProviderConfig(
      dependencies.getProviderConfig(),
    );
    if (!config) return reject("provider_not_configured", 503, "failure");

    const upstream = buildExerciseDatasetProviderRequest(
      validation.value,
      config,
    );
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      dependencies.providerTimeoutMs ?? EXERCISE_DATASET_PROVIDER_TIMEOUT_MS,
    );

    try {
      const providerResponse = await (dependencies.fetchImpl ?? fetch)(
        upstream.url,
        {
          method: "GET",
          headers: upstream.headers,
          signal: controller.signal,
        },
      );

      if (providerResponse.status === 429) {
        return reject("provider_rate_limited", 429, "failure");
      }
      if (!providerResponse.ok) {
        return reject("provider_unavailable", 502, "failure");
      }

      const contentLength = Number(
        providerResponse.headers.get("Content-Length") ?? "0",
      );
      if (
        Number.isFinite(contentLength) &&
        contentLength > EXERCISE_DATASET_MAX_PROVIDER_RESPONSE_BYTES
      ) {
        return reject("provider_invalid_response", 502, "failure");
      }

      const responseText = await readBoundedResponseText(
        providerResponse,
        EXERCISE_DATASET_MAX_PROVIDER_RESPONSE_BYTES,
      );
      if (responseText === null) {
        return reject("provider_invalid_response", 502, "failure");
      }

      let providerPayload: unknown;
      try {
        providerPayload = JSON.parse(responseText);
      } catch {
        return reject("provider_invalid_response", 502, "failure");
      }
      const hasExpectedPayload =
        validation.value.operation === "detail"
          ? hasExerciseDatasetDetail(providerPayload)
          : validation.value.operation === "metadata"
            ? hasExerciseDatasetMetadataList(providerPayload)
            : hasExerciseDatasetList(providerPayload);
      if (!hasExpectedPayload) {
        return reject("provider_invalid_response", 502, "failure");
      }

      log("success");
      return jsonResponse({ providerPayload, correlationId }, 200);
    } catch (error) {
      if (controller.signal.aborted || isAbortError(error)) {
        return reject("provider_timeout", 504, "failure");
      }
      return reject("provider_unavailable", 502, "failure");
    } finally {
      clearTimeout(timeout);
    }
  } catch {
    return reject("unknown_provider_error", 502, "failure");
  }
}

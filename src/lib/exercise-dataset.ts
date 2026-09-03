import type { ProviderNormalizedExercise } from "./exercise-domain";
import { supabase } from "./supabase";

export type ExerciseDatasetSearchFilters = {
  name: string;
  bodyPart: string;
  equipment: string;
  target: string;
  exerciseType: string;
  limit?: number;
  cursor?: string | null;
  signal?: AbortSignal;
};

export type ExerciseDatasetExercise = ProviderNormalizedExercise;

export type ExerciseDatasetPage = {
  exercises: ExerciseDatasetExercise[];
  nextCursor: string | null;
};

export type ExerciseDatasetFilterInput = {
  name?: string;
  bodyPart?: string;
  equipment?: string;
  target?: string;
  exerciseType?: string;
};

export type ExerciseDatasetMetadataKind =
  | "muscles"
  | "bodyparts"
  | "equipments"
  | "exercisetypes";

export type ExerciseDatasetMetadataOption = {
  value: string;
  label: string;
  imageUrl: string | null;
};

export type ExerciseDatasetMetadataCatalog = Record<
  ExerciseDatasetMetadataKind,
  ExerciseDatasetMetadataOption[]
>;

export function mergeExerciseDatasetPages(
  pages: readonly ExerciseDatasetPage[] | undefined,
) {
  const byId = new Map<string, ExerciseDatasetExercise>();
  pages?.forEach((page) => {
    page.exercises.forEach((exercise) => {
      if (!byId.has(exercise.id)) byId.set(exercise.id, exercise);
    });
  });
  return Array.from(byId.values());
}

const readText = (value: unknown) =>
  typeof value === "string" && value.trim().length > 0 ? value.trim() : null;

const readIdentifier = (value: unknown) => {
  const text = readText(value);
  if (text) return text;
  return typeof value === "number" && Number.isFinite(value)
    ? String(value)
    : null;
};

const normalizeLookupKey = (value: string | null) =>
  (value ?? "")
    .trim()
    .toUpperCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");

const anatomyLabelMap: Record<string, string> = {
  ABDOMINALS: "Core",
  ABS: "Core",
  "ADDUCTOR BREVIS": "Legs",
  "ADDUCTOR LONGUS": "Legs",
  "ADDUCTOR MAGNUS": "Legs",
  "ANTERIOR DELTOID": "Shoulders",
  BACK: "Back",
  BICEPS: "Biceps",
  "BICEPS BRACHII": "Biceps",
  "BODY WEIGHT": "Bodyweight",
  BRACHIALIS: "Biceps",
  BRACHIORADIALIS: "Forearms",
  CALVES: "Calves",
  CARDIO: "Full Body",
  CHEST: "Chest",
  DELTOID: "Shoulders",
  DELTOIDS: "Shoulders",
  "ERECTOR SPINAE": "Back",
  FOREARMS: "Forearms",
  GASTROCNEMIUS: "Calves",
  "GLUTEUS MAXIMUS": "Glutes",
  "GLUTEUS MEDIUS": "Glutes",
  "GLUTEUS MINIMUS": "Glutes",
  GLUTES: "Glutes",
  HAMSTRINGS: "Hamstrings",
  HIPS: "Glutes",
  ILIOPSOAS: "Core",
  INFRASPINATUS: "Back",
  LATS: "Back",
  "LATISSIMUS DORSI": "Back",
  LEGS: "Legs",
  "LOWER ARMS": "Forearms",
  "LOWER BACK": "Back",
  "LOWER LEGS": "Calves",
  OBLIQUES: "Core",
  "PECTORALIS MAJOR": "Chest",
  "PECTORALIS MINOR": "Chest",
  PECTINEUS: "Legs",
  "POSTERIOR DELTOID": "Shoulders",
  QUADRICEPS: "Quads",
  QUADS: "Quads",
  "RECTUS ABDOMINIS": "Core",
  "RECTUS FEMORIS": "Quads",
  RHOMBOIDS: "Back",
  "SERRATUS ANTERIOR": "Core",
  SHOULDERS: "Shoulders",
  SOLEUS: "Calves",
  "TENSOR FASCIAE LATAE": "Glutes",
  "TERES MAJOR": "Back",
  "TERES MINOR": "Back",
  THIGHS: "Legs",
  "TRAPEZIUS LOWER FIBERS": "Back",
  "TRAPEZIUS MIDDLE FIBERS": "Back",
  "TRAPEZIUS UPPER FIBERS": "Back",
  TRAPS: "Back",
  "TRANSVERSE ABDOMINIS": "Core",
  TRICEPS: "Triceps",
  "TRICEPS BRACHII": "Triceps",
  "UPPER ARMS": "Arms",
  "UPPER LEGS": "Legs",
  "VASTUS LATERALIS": "Quads",
  "VASTUS MEDIALIS": "Quads",
  "VASTUS INTERMEDIUS": "Quads",
  WAIST: "Core",
};

const normalizeFriendlyLabel = (value: string | null) => {
  const key = normalizeLookupKey(value);
  if (!key) return null;
  return anatomyLabelMap[key] ?? value?.trim() ?? null;
};

const normalizeEquipmentLabel = (value: string | null) => {
  const key = normalizeLookupKey(value);
  if (!key) return null;
  if (key === "BODY WEIGHT") return "Bodyweight";
  return key
    .toLowerCase()
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
};

const normalizeMetadataLabel = (
  value: string,
  kind: ExerciseDatasetMetadataKind,
) => {
  if (kind === "equipments") return normalizeEquipmentLabel(value) ?? value;
  return value
    .trim()
    .toLocaleLowerCase()
    .split(/\s+/)
    .map((word) => word.charAt(0).toLocaleUpperCase() + word.slice(1))
    .join(" ");
};

const readStringList = (value: unknown) => {
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === "string" ? item.trim() : ""))
      .filter(Boolean);
  }
  const single = readText(value);
  return single ? [single] : [];
};

const firstText = (...values: unknown[]) => {
  for (const value of values) {
    const text = readText(value);
    if (text) return text;
    const list = readStringList(value);
    if (list.length > 0) return list[0] ?? null;
  }
  return null;
};

export const normalizeExerciseDatasetRecord = (
  value: unknown,
): ExerciseDatasetExercise | null => {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const name = readText(record.name);
  const sourceId =
    readIdentifier(record.exerciseId) ?? readIdentifier(record.id);
  if (!name || !sourceId) return null;

  return {
    id: sourceId,
    name,
    bodyPart: normalizeFriendlyLabel(
      firstText(record.bodyPart, record.bodyParts, record.category),
    ),
    target: normalizeFriendlyLabel(
      firstText(record.target, record.targetMuscles),
    ),
    exerciseType:
      normalizeMetadataLabel(
        firstText(record.exerciseType) ?? "",
        "exercisetypes",
      ) || null,
    secondaryMuscles: readStringList(record.secondaryMuscles).map(
      (item) => normalizeFriendlyLabel(item) ?? item,
    ),
    equipment: normalizeEquipmentLabel(
      firstText(record.equipment, record.equipments),
    ),
    instructions: readStringList(record.instructions),
    exerciseTips: readStringList(record.exerciseTips),
    overview: readText(record.overview),
    keywords: readStringList(record.keywords),
    videoUrl: firstText(record.videoUrl, record.gifUrl),
    imageUrl: firstText(record.imageUrl),
    raw: record,
  };
};

const extractExerciseList = (payload: unknown) => {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== "object") return [];
  const record = payload as Record<string, unknown>;
  const nestedLists = ["data", "results", "items", "exercises"];
  for (const key of nestedLists) {
    const value = record[key];
    if (Array.isArray(value)) return value;
  }
  return [];
};

const extractExerciseDetail = (payload: unknown) => {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }
  const record = payload as Record<string, unknown>;
  return record.data &&
    typeof record.data === "object" &&
    !Array.isArray(record.data)
    ? record.data
    : record;
};

export const extractExerciseDatasetNextCursor = (payload: unknown) => {
  if (!payload || typeof payload !== "object") return null;
  const meta = (payload as Record<string, unknown>).meta;
  if (!meta || typeof meta !== "object") return null;
  const nextCursor = (meta as Record<string, unknown>).nextCursor;
  return typeof nextCursor === "string" && nextCursor.trim().length > 0
    ? nextCursor.trim()
    : null;
};

const matchesSearch = (exercise: ExerciseDatasetExercise, search: string) =>
  !search ||
  exercise.name.toLowerCase().includes(search) ||
  (exercise.bodyPart ?? "").toLowerCase().includes(search) ||
  (exercise.target ?? "").toLowerCase().includes(search) ||
  (exercise.equipment ?? "").toLowerCase().includes(search) ||
  exercise.secondaryMuscles.some((item) =>
    item.toLowerCase().includes(search),
  ) ||
  exercise.keywords.some((item) => item.toLowerCase().includes(search));

export const exerciseDatasetConfigured = true;

export type ExerciseDatasetErrorCode =
  | "unauthenticated"
  | "forbidden"
  | "invalid_request"
  | "provider_not_configured"
  | "provider_rate_limited"
  | "provider_timeout"
  | "provider_unavailable"
  | "provider_invalid_response"
  | "unknown_provider_error";

const exerciseDatasetErrorMessages: Record<ExerciseDatasetErrorCode, string> = {
  unauthenticated: "Sign in again to search provider exercises.",
  forbidden: "Your account does not have access to provider exercises.",
  invalid_request: "The exercise search request is invalid.",
  provider_not_configured:
    "The exercise provider is not configured. Saved exercises remain available.",
  provider_rate_limited:
    "The exercise provider rate-limited this request. Wait a moment and try again.",
  provider_timeout:
    "The exercise provider took too long to respond. Try again shortly.",
  provider_unavailable:
    "The exercise provider is temporarily unavailable. Saved exercises remain available.",
  provider_invalid_response:
    "The exercise provider returned an invalid response. Saved exercises remain available.",
  unknown_provider_error:
    "The exercise provider request failed. Saved exercises remain available.",
};

const exerciseDatasetErrorCodes = new Set<ExerciseDatasetErrorCode>(
  Object.keys(exerciseDatasetErrorMessages) as ExerciseDatasetErrorCode[],
);

export class ExerciseDatasetError extends Error {
  readonly code: ExerciseDatasetErrorCode;

  constructor(code: ExerciseDatasetErrorCode) {
    super(exerciseDatasetErrorMessages[code]);
    this.name = "ExerciseDatasetError";
    this.code = code;
  }
}

const isExerciseDatasetErrorCode = (
  value: unknown,
): value is ExerciseDatasetErrorCode =>
  typeof value === "string" &&
  exerciseDatasetErrorCodes.has(value as ExerciseDatasetErrorCode);

const readGatewayErrorCode = async (
  error: unknown,
): Promise<ExerciseDatasetErrorCode> => {
  const context =
    error && typeof error === "object" && "context" in error
      ? (error as { context?: unknown }).context
      : null;
  if (
    (context instanceof DOMException || context instanceof Error) &&
    (context.name === "AbortError" || context.name === "TimeoutError")
  ) {
    return "provider_timeout";
  }
  if (context instanceof Response) {
    try {
      const body = (await context.clone().json()) as {
        error?: { code?: unknown };
      };
      if (isExerciseDatasetErrorCode(body.error?.code)) {
        return body.error.code;
      }
    } catch {
      // Fall back to the status-only mapping below.
    }
    if (context.status === 401) return "unauthenticated";
    if (context.status === 403) return "forbidden";
    if (context.status === 400) return "invalid_request";
    if (context.status === 429) return "provider_rate_limited";
    if (context.status === 504) return "provider_timeout";
  }

  if (
    (error instanceof DOMException || error instanceof Error) &&
    (error.name === "AbortError" || error.name === "TimeoutError")
  ) {
    return "provider_timeout";
  }
  return "provider_unavailable";
};

export function filterExerciseDataset(
  exercises: ExerciseDatasetExercise[],
  filters: ExerciseDatasetFilterInput,
) {
  const nameFilter = (filters.name ?? "").trim().toLowerCase();
  const bodyPartFilter = (filters.bodyPart ?? "").trim().toLowerCase();
  const equipmentFilter = (filters.equipment ?? "").trim().toLowerCase();
  const targetFilter = (filters.target ?? "").trim().toLowerCase();
  const exerciseTypeFilter = (filters.exerciseType ?? "").trim().toLowerCase();

  return exercises.filter((exercise) => {
    if (!matchesSearch(exercise, nameFilter)) return false;
    if (
      bodyPartFilter &&
      !(exercise.bodyPart ?? "").toLowerCase().includes(bodyPartFilter)
    ) {
      return false;
    }
    if (
      equipmentFilter &&
      !(exercise.equipment ?? "").toLowerCase().includes(equipmentFilter)
    ) {
      return false;
    }
    if (
      targetFilter &&
      !(exercise.target ?? "").toLowerCase().includes(targetFilter)
    ) {
      return false;
    }
    if (
      exerciseTypeFilter &&
      !(exercise.exerciseType ?? "").toLowerCase().includes(exerciseTypeFilter)
    ) {
      return false;
    }
    return true;
  });
}

const extractExerciseDatasetMetadataList = (payload: unknown) => {
  const candidates = Array.isArray(payload)
    ? payload
    : payload && typeof payload === "object"
      ? (payload as Record<string, unknown>).data
      : null;
  return Array.isArray(candidates) ? candidates : [];
};

export function normalizeExerciseDatasetMetadata(
  payload: unknown,
  kind: ExerciseDatasetMetadataKind,
): ExerciseDatasetMetadataOption[] {
  const byValue = new Map<string, ExerciseDatasetMetadataOption>();
  extractExerciseDatasetMetadataList(payload).forEach((candidate) => {
    const record =
      candidate && typeof candidate === "object" && !Array.isArray(candidate)
        ? (candidate as Record<string, unknown>)
        : null;
    const value =
      typeof candidate === "string" ? candidate.trim() : readText(record?.name);
    if (!value) return;
    const dedupeKey = normalizeLookupKey(value);
    if (!dedupeKey || byValue.has(dedupeKey)) return;
    byValue.set(dedupeKey, {
      value,
      label: normalizeMetadataLabel(value, kind),
      imageUrl: readText(record?.imageUrl),
    });
  });
  return Array.from(byValue.values()).sort((left, right) =>
    left.label.localeCompare(right.label),
  );
}

export async function getExerciseDatasetMetadata(
  kind: ExerciseDatasetMetadataKind,
  signal?: AbortSignal,
): Promise<ExerciseDatasetMetadataOption[]> {
  const { data, error } = await supabase.functions.invoke<{
    providerPayload?: unknown;
  }>("exercise-dataset-search", {
    body: { metadata: kind },
    signal,
    timeout: 15_000,
  });
  if (error) throw new ExerciseDatasetError(await readGatewayErrorCode(error));
  if (!data || !("providerPayload" in data)) {
    throw new ExerciseDatasetError("provider_invalid_response");
  }
  return normalizeExerciseDatasetMetadata(data.providerPayload, kind);
}

export async function getExerciseDatasetMetadataCatalog(
  signal?: AbortSignal,
): Promise<ExerciseDatasetMetadataCatalog> {
  const kinds: ExerciseDatasetMetadataKind[] = [
    "muscles",
    "bodyparts",
    "equipments",
    "exercisetypes",
  ];
  const entries = await Promise.all(
    kinds.map(
      async (kind) =>
        [kind, await getExerciseDatasetMetadata(kind, signal)] as const,
    ),
  );
  return Object.fromEntries(entries) as ExerciseDatasetMetadataCatalog;
}

export async function searchExerciseDataset(
  filters: ExerciseDatasetSearchFilters,
): Promise<ExerciseDatasetPage> {
  const { signal, ...requestBody } = filters;
  const { data, error } = await supabase.functions.invoke<{
    providerPayload?: unknown;
  }>("exercise-dataset-search", {
    body: {
      ...requestBody,
      limit: filters.limit ?? 24,
      cursor: filters.cursor ?? null,
    },
    signal,
    timeout: 15_000,
  });
  if (error) throw new ExerciseDatasetError(await readGatewayErrorCode(error));
  if (!data || !("providerPayload" in data)) {
    throw new ExerciseDatasetError("provider_invalid_response");
  }

  const payload = data.providerPayload;
  if (!Array.isArray(payload) && (!payload || typeof payload !== "object")) {
    throw new ExerciseDatasetError("provider_invalid_response");
  }

  return {
    exercises: extractExerciseList(payload)
      .map(normalizeExerciseDatasetRecord)
      .filter((item): item is ExerciseDatasetExercise => Boolean(item)),
    nextCursor: extractExerciseDatasetNextCursor(payload),
  };
}

export async function getExerciseDatasetExercise(
  exerciseId: string,
  signal?: AbortSignal,
): Promise<ExerciseDatasetExercise> {
  const { data, error } = await supabase.functions.invoke<{
    providerPayload?: unknown;
  }>("exercise-dataset-search", {
    body: { exerciseId },
    signal,
    timeout: 15_000,
  });
  if (error) throw new ExerciseDatasetError(await readGatewayErrorCode(error));
  if (!data || !("providerPayload" in data)) {
    throw new ExerciseDatasetError("provider_invalid_response");
  }

  const exercise = normalizeExerciseDatasetRecord(
    extractExerciseDetail(data.providerPayload),
  );
  if (!exercise || exercise.id !== exerciseId.trim()) {
    throw new ExerciseDatasetError("provider_invalid_response");
  }
  return exercise;
}

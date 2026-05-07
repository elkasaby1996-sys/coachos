const datasetBaseUrl = (import.meta.env.VITE_EXERCISE_DATASET_BASE_URL ?? "")
  .trim()
  .replace(/\/+$/, "");
const datasetApiKey = (
  import.meta.env.VITE_EXERCISE_DATASET_API_KEY ?? ""
).trim();
const datasetApiKeyHeader =
  (
    import.meta.env.VITE_EXERCISE_DATASET_API_KEY_HEADER ?? "x-api-key"
  ).trim() || "x-api-key";
const datasetApiHost = (
  import.meta.env.VITE_EXERCISE_DATASET_API_HOST ?? ""
).trim();

export type ExerciseDatasetSearchFilters = {
  name: string;
  bodyPart: string;
  equipment: string;
  target: string;
  limit?: number;
  cursor?: string | null;
};

export type ExerciseDatasetExercise = {
  id: string;
  name: string;
  bodyPart: string | null;
  target: string | null;
  secondaryMuscles: string[];
  equipment: string | null;
  instructions: string[];
  exerciseTips: string[];
  overview: string | null;
  keywords: string[];
  videoUrl: string | null;
  imageUrl: string | null;
  raw: Record<string, unknown>;
};

export type ExerciseDatasetPage = {
  exercises: ExerciseDatasetExercise[];
  nextCursor: string | null;
};

export type ExerciseDatasetFilterInput = {
  name?: string;
  bodyPart?: string;
  equipment?: string;
  target?: string;
};

const readText = (value: unknown) =>
  typeof value === "string" && value.trim().length > 0 ? value.trim() : null;

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

const normalizeExercise = (value: unknown): ExerciseDatasetExercise | null => {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const name = readText(record.name);
  const sourceId = firstText(record.exerciseId, record.id);
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

const extractNextCursor = (payload: unknown) => {
  if (!payload || typeof payload !== "object") return null;
  const meta = (payload as Record<string, unknown>).meta;
  if (!meta || typeof meta !== "object") return null;
  const nextCursor = (meta as Record<string, unknown>).nextCursor;
  return typeof nextCursor === "string" && nextCursor.trim().length > 0
    ? nextCursor.trim()
    : null;
};

const datasetHeaders = () => {
  const headers: Record<string, string> = {
    Accept: "application/json",
  };

  if (datasetApiKey) {
    headers[datasetApiKeyHeader] = datasetApiKey;
  }
  if (datasetApiHost) {
    headers["X-RapidAPI-Host"] = datasetApiHost;
  }

  return headers;
};

const fetchJson = async (url: string) => {
  const response = await fetch(url, {
    method: "GET",
    headers: datasetHeaders(),
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Dataset request failed (${response.status}).`);
  }

  return response.json();
};

const buildRequestUrl = ({
  limit = 24,
  cursor,
}: ExerciseDatasetSearchFilters) => {
  const params = new URLSearchParams();
  params.set("limit", String(limit));
  if (cursor) params.set("cursor", cursor);
  return `${datasetBaseUrl}/api/v1/exercises?${params.toString()}`;
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

export const exerciseDatasetConfigured = Boolean(datasetBaseUrl);

export function filterExerciseDataset(
  exercises: ExerciseDatasetExercise[],
  filters: ExerciseDatasetFilterInput,
) {
  const nameFilter = (filters.name ?? "").trim().toLowerCase();
  const bodyPartFilter = (filters.bodyPart ?? "").trim().toLowerCase();
  const equipmentFilter = (filters.equipment ?? "").trim().toLowerCase();
  const targetFilter = (filters.target ?? "").trim().toLowerCase();

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
    return true;
  });
}

export async function searchExerciseDataset(
  filters: ExerciseDatasetSearchFilters,
): Promise<ExerciseDatasetPage> {
  if (!datasetBaseUrl) {
    throw new Error(
      "Exercise dataset API is not configured. Set VITE_EXERCISE_DATASET_BASE_URL first.",
    );
  }

  const pageLimit = filters.limit ?? 24;
  let payload: unknown;
  try {
    payload = await fetchJson(
      buildRequestUrl({
        ...filters,
        limit: pageLimit,
        cursor: filters.cursor ?? null,
      }),
    );
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Exercise dataset search failed.";
    if (message.includes("(403)")) {
      throw new Error(
        "The dataset provider rejected this request. Check the provider plan, key, and route configuration.",
      );
    }
    if (message.includes("(429)")) {
      throw new Error(
        "The dataset provider rate-limited this request. Wait a moment and try again.",
      );
    }
    throw error instanceof Error
      ? error
      : new Error("Exercise dataset search failed.");
  }

  return {
    exercises: extractExerciseList(payload)
      .map(normalizeExercise)
      .filter((item): item is ExerciseDatasetExercise => Boolean(item)),
    nextCursor: extractNextCursor(payload),
  };
}

export const EXERCISE_CATALOG_DEFAULT_METADATA_MAX_BYTES = 16_384;
export const EXERCISE_CATALOG_MAX_COLLECTION_ITEMS = 200;
export const EXERCISE_CATALOG_MAX_MEDIA_ITEMS = 24;

export type ExerciseCatalogMediaKind = "gif" | "image" | "video";

export type ExerciseCatalogCandidate = {
  source: string;
  sourceExerciseId: string;
  sourceVersion: string | null;
  name: string;
  bodyRegions: string[];
  primaryMuscles: string[];
  secondaryMuscles: string[];
  equipment: string[];
  instructions: string[];
  description: string | null;
  difficulty: string | null;
  category: string | null;
  media: Array<{
    kind: ExerciseCatalogMediaKind;
    resolution: string | null;
    sourcePath: string;
  }>;
  relationships: {
    similar: string[];
    substitutions: string[];
    progressions: string[];
    regressions: string[];
  };
  sourceMetadata: Record<string, unknown>;
};

export type ExerciseCatalogSourceContract = {
  source: string;
  sourceVersion?: string | null;
  fields: {
    id: string;
    name: string;
    bodyRegions?: string;
    primaryMuscles?: string;
    secondaryMuscles?: string;
    equipment?: string;
    instructions?: string;
    description?: string;
    difficulty?: string;
    category?: string;
  };
  media?: {
    items: string;
    sourcePath?: string;
    kind?: string;
    resolution?: string;
    defaultKind?: ExerciseCatalogMediaKind;
  };
  relationships?: {
    similar?: string;
    substitutions?: string;
    progressions?: string;
    regressions?: string;
  };
};

export type ExerciseCatalogMappingErrorCode =
  | "invalid_record"
  | "invalid_source_contract"
  | "missing_id"
  | "invalid_id"
  | "missing_name"
  | "invalid_name";

export type ExerciseCatalogMappingResult =
  | { ok: true; value: ExerciseCatalogCandidate }
  | {
      ok: false;
      error: {
        code: ExerciseCatalogMappingErrorCode;
        message: string;
      };
    };

type MappingOptions = {
  sourceMetadataMaxBytes?: number;
};

const encoder = new TextEncoder();

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readPath(value: unknown, path: string | undefined): unknown {
  if (!path) return undefined;
  return path.split(".").reduce<unknown>((current, segment) => {
    if (!isRecord(current)) return undefined;
    return current[segment];
  }, value);
}

function normalizeIdentifier(value: unknown): string | null {
  if (typeof value === "string") {
    const normalized = value.trim();
    return normalized && normalized.length <= 300 ? normalized : null;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return null;
}

function normalizeString(value: unknown, maximumLength = 2_000) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized && normalized.length <= maximumLength ? normalized : null;
}

function normalizeStringArray(
  value: unknown,
  maximumItems = EXERCISE_CATALOG_MAX_COLLECTION_ITEMS,
) {
  const values = Array.isArray(value) ? value : value == null ? [] : [value];
  const normalized: string[] = [];
  const seen = new Set<string>();

  values.slice(0, maximumItems).forEach((item) => {
    const text = normalizeString(item);
    if (!text || seen.has(text)) return;
    seen.add(text);
    normalized.push(text);
  });
  return normalized;
}

function normalizeIdentifierArray(value: unknown) {
  const values = Array.isArray(value) ? value : value == null ? [] : [value];
  const normalized: string[] = [];
  const seen = new Set<string>();

  values.slice(0, EXERCISE_CATALOG_MAX_COLLECTION_ITEMS).forEach((item) => {
    const identifier = normalizeIdentifier(item);
    if (!identifier || seen.has(identifier)) return;
    seen.add(identifier);
    normalized.push(identifier);
  });
  return normalized;
}

function inferMediaKind(path: string): ExerciseCatalogMediaKind | null {
  const pathWithoutQuery = path.split(/[?#]/, 1)[0]?.toLowerCase() ?? "";
  if (pathWithoutQuery.endsWith(".gif")) return "gif";
  if (/\.(avif|jpe?g|png|svg|webp)$/.test(pathWithoutQuery)) return "image";
  if (/\.(m4v|mov|mp4|webm)$/.test(pathWithoutQuery)) return "video";
  return null;
}

function normalizeMediaKind(value: unknown) {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === "gif") return "gif";
  if (normalized === "image" || normalized === "photo") return "image";
  if (normalized === "video") return "video";
  return null;
}

export function normalizeExerciseCatalogMediaPath(value: unknown) {
  const path = normalizeString(value, 1_024);
  if (
    !path ||
    [...path].some((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return codePoint <= 31 || codePoint === 127;
    })
  ) {
    return null;
  }

  if (/^[a-z][a-z0-9+.-]*:/i.test(path)) {
    try {
      const url = new URL(path);
      return url.protocol === "http:" || url.protocol === "https:"
        ? url.toString()
        : null;
    } catch {
      return null;
    }
  }

  const normalized = path.replace(/\\/g, "/").replace(/^\.\//, "");
  if (
    normalized.startsWith("/") ||
    normalized.split("/").some((segment) => segment === "..")
  ) {
    return null;
  }
  return normalized;
}

function normalizeMedia(
  record: Record<string, unknown>,
  contract: ExerciseCatalogSourceContract["media"],
): ExerciseCatalogCandidate["media"] {
  if (!contract) return [];
  const rawItems = readPath(record, contract.items);
  const items = Array.isArray(rawItems)
    ? rawItems
    : rawItems == null
      ? []
      : [rawItems];

  return items.slice(0, EXERCISE_CATALOG_MAX_MEDIA_ITEMS).flatMap((item) => {
    const sourcePath = normalizeExerciseCatalogMediaPath(
      typeof item === "string" || typeof item === "number"
        ? item
        : readPath(item, contract.sourcePath),
    );
    if (!sourcePath) return [];

    const kind =
      normalizeMediaKind(readPath(item, contract.kind)) ??
      contract.defaultKind ??
      inferMediaKind(sourcePath);
    if (!kind) return [];

    return [
      {
        kind,
        resolution: normalizeString(readPath(item, contract.resolution), 100),
        sourcePath,
      },
    ];
  });
}

function serializedByteLength(value: unknown) {
  return encoder.encode(JSON.stringify(value)).byteLength;
}

export function boundExerciseCatalogSourceMetadata(
  record: Record<string, unknown>,
  maximumBytes = EXERCISE_CATALOG_DEFAULT_METADATA_MAX_BYTES,
) {
  const byteLimit = Math.max(0, Math.floor(maximumBytes));
  const result: Record<string, unknown> = {};
  let truncated = false;

  Object.entries(record).forEach(([key, value]) => {
    let cloned: unknown;
    try {
      const serialized = JSON.stringify(value);
      if (serialized === undefined) {
        truncated = true;
        return;
      }
      cloned = JSON.parse(serialized) as unknown;
    } catch {
      truncated = true;
      return;
    }

    const candidate = { ...result, [key]: cloned };
    if (serializedByteLength(candidate) <= byteLimit) {
      result[key] = cloned;
    } else {
      truncated = true;
    }
  });

  if (truncated) {
    const marker = { ...result, _truncated: true };
    if (serializedByteLength(marker) <= byteLimit) return marker;
  }
  return result;
}

function mappingError(
  code: ExerciseCatalogMappingErrorCode,
  message: string,
): ExerciseCatalogMappingResult {
  return { ok: false, error: { code, message } };
}

export function mapExerciseCatalogRecord(
  input: unknown,
  contract: ExerciseCatalogSourceContract,
  options: MappingOptions = {},
): ExerciseCatalogMappingResult {
  if (!isRecord(input)) {
    return mappingError("invalid_record", "Catalog record must be an object.");
  }

  const source = normalizeString(contract.source, 100);
  if (!source || !contract.fields.id || !contract.fields.name) {
    return mappingError(
      "invalid_source_contract",
      "Catalog source, identifier path, and name path are required.",
    );
  }

  const rawIdentifier = readPath(input, contract.fields.id);
  if (rawIdentifier === undefined || rawIdentifier === null) {
    return mappingError("missing_id", "Catalog record is missing an ID.");
  }
  const sourceExerciseId = normalizeIdentifier(rawIdentifier);
  if (!sourceExerciseId) {
    return mappingError("invalid_id", "Catalog record ID is invalid.");
  }

  const rawName = readPath(input, contract.fields.name);
  if (rawName === undefined || rawName === null) {
    return mappingError("missing_name", "Catalog record is missing a name.");
  }
  const name = normalizeString(rawName, 300);
  if (!name) {
    return mappingError("invalid_name", "Catalog record name is invalid.");
  }

  const relationships = contract.relationships;
  return {
    ok: true,
    value: {
      source,
      sourceExerciseId,
      sourceVersion: normalizeString(contract.sourceVersion, 200),
      name,
      bodyRegions: normalizeStringArray(
        readPath(input, contract.fields.bodyRegions),
      ),
      primaryMuscles: normalizeStringArray(
        readPath(input, contract.fields.primaryMuscles),
      ),
      secondaryMuscles: normalizeStringArray(
        readPath(input, contract.fields.secondaryMuscles),
      ),
      equipment: normalizeStringArray(
        readPath(input, contract.fields.equipment),
      ),
      instructions: normalizeStringArray(
        readPath(input, contract.fields.instructions),
      ),
      description: normalizeString(
        readPath(input, contract.fields.description),
        10_000,
      ),
      difficulty: normalizeString(
        readPath(input, contract.fields.difficulty),
        200,
      ),
      category: normalizeString(readPath(input, contract.fields.category), 200),
      media: normalizeMedia(input, contract.media),
      relationships: {
        similar: normalizeIdentifierArray(
          readPath(input, relationships?.similar),
        ),
        substitutions: normalizeIdentifierArray(
          readPath(input, relationships?.substitutions),
        ),
        progressions: normalizeIdentifierArray(
          readPath(input, relationships?.progressions),
        ),
        regressions: normalizeIdentifierArray(
          readPath(input, relationships?.regressions),
        ),
      },
      sourceMetadata: boundExerciseCatalogSourceMetadata(
        input,
        options.sourceMetadataMaxBytes,
      ),
    },
  };
}

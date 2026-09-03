import { createHash } from "node:crypto";
import { closeSync, fstatSync, openSync, readSync } from "node:fs";
import { resolve } from "node:path";

const DEFAULT_SAMPLE_PATH = "tmp/exercise-catalog/exercisedb-pro-sample.json";
const DEFAULT_MAX_BYTES = 50 * 1024 * 1024;
const MAX_SCHEMA_DEPTH = 4;

const args = process.argv.slice(2);
const option = (name) =>
  args
    .find((argument) => argument.startsWith(`${name}=`))
    ?.slice(name.length + 1);
const positionalPath = args.find((argument) => !argument.startsWith("--"));
const samplePath = resolve(positionalPath ?? DEFAULT_SAMPLE_PATH);
const recordsPath = option("--records-path") ?? null;
const maximumBytes = Number(option("--max-bytes") ?? DEFAULT_MAX_BYTES);

if (!Number.isSafeInteger(maximumBytes) || maximumBytes < 1) {
  throw new Error("--max-bytes must be a positive safe integer.");
}
let sampleFileDescriptor;
try {
  sampleFileDescriptor = openSync(samplePath, "r");
} catch (error) {
  if (error?.code !== "ENOENT") throw error;

  console.error(
    `Exercise catalog sample not found at ${samplePath}. Place the licensed local-only sample there or pass another local path.`,
  );
  process.exitCode = 2;
}

if (sampleFileDescriptor !== undefined) {
  try {
    const file = fstatSync(sampleFileDescriptor);
    if (!file.isFile()) {
      throw new Error("Exercise catalog sample must be a regular file.");
    }
    if (file.size > maximumBytes) {
      throw sampleTooLargeError(file.size);
    }

    const sourceBuffer = readBoundedFile(sampleFileDescriptor, maximumBytes);
    const source = sourceBuffer.toString("utf8");
    const payload = JSON.parse(source);
    const located = locateRecords(payload, recordsPath);
    const report = {
      auditVersion: 1,
      file: {
        byteLength: sourceBuffer.byteLength,
        sha256: createHash("sha256").update(source).digest("hex"),
      },
      topLevel: summarizeTopLevel(payload),
      records: located
        ? {
            path: located.path,
            count: located.records.length,
            fields: summarizeRecordFields(located.records),
          }
        : null,
      limitations: [
        "No record values or complete records are emitted.",
        "A selected record path is structural evidence only; configure the mapper contract after human review.",
        "This audit does not establish licensing rights or a production schema.",
      ],
    };

    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } finally {
    closeSync(sampleFileDescriptor);
  }
}

function readBoundedFile(fileDescriptor, byteLimit) {
  const chunks = [];
  const chunkSize = 64 * 1024;
  let totalBytes = 0;

  while (true) {
    const remainingBytes = byteLimit - totalBytes;
    const bytesToRead = Math.min(
      chunkSize,
      remainingBytes > 0 ? remainingBytes : 1,
    );
    const chunk = Buffer.allocUnsafe(bytesToRead);
    const bytesRead = readSync(fileDescriptor, chunk, 0, bytesToRead, null);

    if (bytesRead === 0) break;

    totalBytes += bytesRead;
    if (totalBytes > byteLimit) {
      throw sampleTooLargeError(totalBytes);
    }
    chunks.push(chunk.subarray(0, bytesRead));
  }

  return Buffer.concat(chunks, totalBytes);
}

function sampleTooLargeError(byteLength) {
  return new Error(
    `Sample is ${byteLength} bytes, above the ${maximumBytes}-byte audit limit. Raise --max-bytes intentionally if this is expected.`,
  );
}

function valueKind(value) {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

function readPath(value, path) {
  if (!path) return value;
  return path.split(".").reduce((current, segment) => {
    if (!current || typeof current !== "object" || Array.isArray(current)) {
      return undefined;
    }
    return current[segment];
  }, value);
}

function locateRecords(payload, explicitPath) {
  if (explicitPath) {
    const selected = readPath(payload, explicitPath);
    if (!Array.isArray(selected)) {
      throw new Error(
        `--records-path=${explicitPath} does not resolve to an array.`,
      );
    }
    return { path: explicitPath, records: selected };
  }
  if (Array.isArray(payload)) return { path: "$", records: payload };
  if (!payload || typeof payload !== "object") return null;

  const candidates = Object.entries(payload)
    .filter(([, value]) => Array.isArray(value))
    .map(([path, records]) => ({ path, records }))
    .sort((left, right) => right.records.length - left.records.length);
  return candidates[0] ?? null;
}

function summarizeTopLevel(payload) {
  if (Array.isArray(payload)) {
    return { kind: "array", count: payload.length };
  }
  if (!payload || typeof payload !== "object") {
    return { kind: valueKind(payload) };
  }

  return {
    kind: "object",
    fields: Object.entries(payload).map(([name, value]) => ({
      name,
      kind: valueKind(value),
      arrayLength: Array.isArray(value) ? value.length : undefined,
      stringLength: typeof value === "string" ? value.length : undefined,
    })),
  };
}

function emptyFieldSummary(path) {
  return {
    path,
    present: 0,
    nullable: 0,
    types: {},
    distinctScalarValues: new Set(),
    scalarDistinctCountIsLowerBound: false,
    minimumStringLength: null,
    maximumStringLength: null,
    maximumArrayLength: null,
    arrayItemTypes: {},
    arrayObjectKeys: new Set(),
    pathKinds: {},
    fileExtensions: {},
  };
}

function increment(target, key) {
  target[key] = (target[key] ?? 0) + 1;
}

function inspectString(summary, value) {
  summary.minimumStringLength =
    summary.minimumStringLength === null
      ? value.length
      : Math.min(summary.minimumStringLength, value.length);
  summary.maximumStringLength =
    summary.maximumStringLength === null
      ? value.length
      : Math.max(summary.maximumStringLength, value.length);

  const kind = /^https?:\/\//i.test(value)
    ? "http_url"
    : /^[a-z][a-z0-9+.-]*:/i.test(value)
      ? "other_uri"
      : value.includes("/") || value.includes("\\")
        ? "relative_path"
        : "plain_string";
  increment(summary.pathKinds, kind);

  const withoutQuery = value.split(/[?#]/, 1)[0] ?? "";
  const extension = withoutQuery
    .match(/\.([a-z0-9]{1,8})$/i)?.[1]
    ?.toLowerCase();
  if (extension) increment(summary.fileExtensions, extension);
}

function addScalarDistinct(summary, value) {
  if (summary.distinctScalarValues.size >= 10_000) {
    summary.scalarDistinctCountIsLowerBound = true;
    return;
  }
  summary.distinctScalarValues.add(`${typeof value}:${String(value)}`);
}

function visit(summaryByPath, path, value, depth) {
  const summary = summaryByPath.get(path) ?? emptyFieldSummary(path);
  summaryByPath.set(path, summary);
  summary.present += 1;
  const kind = valueKind(value);
  increment(summary.types, kind);
  if (value === null) summary.nullable += 1;

  if (["string", "number", "boolean"].includes(kind)) {
    addScalarDistinct(summary, value);
  }
  if (typeof value === "string") inspectString(summary, value);

  if (Array.isArray(value)) {
    summary.maximumArrayLength = Math.max(
      summary.maximumArrayLength ?? 0,
      value.length,
    );
    value.forEach((item) => {
      increment(summary.arrayItemTypes, valueKind(item));
      if (item && typeof item === "object" && !Array.isArray(item)) {
        Object.keys(item).forEach((key) => summary.arrayObjectKeys.add(key));
      }
    });
  }

  if (
    depth < MAX_SCHEMA_DEPTH &&
    value &&
    typeof value === "object" &&
    !Array.isArray(value)
  ) {
    Object.entries(value).forEach(([key, nested]) =>
      visit(summaryByPath, `${path}.${key}`, nested, depth + 1),
    );
  }
}

function summarizeRecordFields(records) {
  const summaryByPath = new Map();
  records.forEach((record) => {
    if (!record || typeof record !== "object" || Array.isArray(record)) return;
    Object.entries(record).forEach(([key, value]) =>
      visit(summaryByPath, key, value, 1),
    );
  });

  return [...summaryByPath.values()]
    .sort((left, right) => left.path.localeCompare(right.path))
    .map((summary) => ({
      path: summary.path,
      present: summary.present,
      missing: records.length - summary.present,
      nullable: summary.nullable,
      types: summary.types,
      distinctScalarCount: summary.distinctScalarValues.size,
      distinctScalarCountIsLowerBound: summary.scalarDistinctCountIsLowerBound,
      minimumStringLength: summary.minimumStringLength,
      maximumStringLength: summary.maximumStringLength,
      maximumArrayLength: summary.maximumArrayLength,
      arrayItemTypes: summary.arrayItemTypes,
      arrayObjectKeys: [...summary.arrayObjectKeys].sort(),
      pathKinds: summary.pathKinds,
      fileExtensions: summary.fileExtensions,
    }));
}

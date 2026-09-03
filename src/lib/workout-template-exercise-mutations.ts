export type WorkoutTemplateExerciseMutationRow = {
  id: string;
};

export type WorkoutTemplateExerciseMutationFailureCode =
  | "WTE_ROW_NOT_UPDATED"
  | "WTE_UNEXPECTED_ROW"
  | "WTE_INCOMPLETE_UPDATE";

export class WorkoutTemplateExerciseMutationResultError extends Error {
  readonly code: WorkoutTemplateExerciseMutationFailureCode;
  readonly operation: string;
  readonly expectedIds: string[];
  readonly returnedIds: string[];

  constructor(params: {
    code: WorkoutTemplateExerciseMutationFailureCode;
    operation: string;
    expectedIds: readonly string[];
    returnedIds: readonly string[];
  }) {
    const expectedIds = [...params.expectedIds];
    const returnedIds = [...params.returnedIds];
    const missingIds = expectedIds.filter((id) => !returnedIds.includes(id));
    const unexpectedIds = returnedIds.filter((id) => !expectedIds.includes(id));
    super(
      `${params.operation} affected an unexpected WTE row set ` +
        `(expected ${expectedIds.length}, returned ${returnedIds.length}, ` +
        `missing ${missingIds.length}, unexpected ${unexpectedIds.length}).`,
    );
    this.name = "WorkoutTemplateExerciseMutationResultError";
    this.code = params.code;
    this.operation = params.operation;
    this.expectedIds = expectedIds;
    this.returnedIds = returnedIds;
  }
}

const uniqueIds = (ids: readonly string[]) => [...new Set(ids)];

export function assertWorkoutTemplateExerciseMutationResult(params: {
  operation: string;
  expectedIds: readonly string[];
  rows: readonly WorkoutTemplateExerciseMutationRow[] | null | undefined;
}): string[] {
  const expectedIds = uniqueIds(params.expectedIds);
  const returnedIds = uniqueIds((params.rows ?? []).map((row) => row.id));
  const missingIds = expectedIds.filter((id) => !returnedIds.includes(id));
  const unexpectedIds = returnedIds.filter((id) => !expectedIds.includes(id));

  if (missingIds.length === 0 && unexpectedIds.length === 0) {
    return returnedIds;
  }

  const code: WorkoutTemplateExerciseMutationFailureCode =
    expectedIds.length === 1 && returnedIds.length === 0
      ? "WTE_ROW_NOT_UPDATED"
      : unexpectedIds.length > 0
        ? "WTE_UNEXPECTED_ROW"
        : "WTE_INCOMPLETE_UPDATE";

  throw new WorkoutTemplateExerciseMutationResultError({
    code,
    operation: params.operation,
    expectedIds,
    returnedIds,
  });
}

export function getWorkoutTemplateExerciseMutationMessage(error: unknown) {
  if (error instanceof WorkoutTemplateExerciseMutationResultError) {
    if (error.code === "WTE_INCOMPLETE_UPDATE") {
      return "Some exercises were not saved. The workout has been refreshed to show the stored values. Try the change again.";
    }
    if (error.code === "WTE_UNEXPECTED_ROW") {
      return "The workout changed unexpectedly while saving. The stored workout has been reloaded. Review it before trying again.";
    }
    return "This exercise was not updated. It may have been removed, or you may no longer have permission to change it. Refresh and try again.";
  }

  const details =
    error && typeof error === "object"
      ? (error as { code?: string | null; message?: string | null })
      : null;
  const code = details?.code ?? "unknown";
  const message = details?.message?.toLowerCase() ?? "";

  if (
    code === "P0001" &&
    (message.includes("already assigned") ||
      message.includes("active delivery") ||
      message.includes("cannot be deleted"))
  ) {
    return "This template is part of active client delivery and cannot be changed. Duplicate it before editing the prescription or layout.";
  }

  if (
    code === "42501" ||
    code === "PGRST301" ||
    message.includes("permission denied") ||
    message.includes("not authorized") ||
    message.includes("row-level security")
  ) {
    return "You are not authorized to change exercises in this workout template.";
  }

  return "The workout could not be saved because of a database or network error. The stored workout has been reloaded; try again.";
}

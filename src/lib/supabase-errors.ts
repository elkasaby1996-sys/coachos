type SupabaseErrorLike = { code?: string | null; message?: string | null };

export const getSupabaseErrorMessage = (error: unknown, fallback = "Something went wrong.") => {
  if (!error) return fallback;
  const err = error as SupabaseErrorLike;
  const code = err.code ?? null;
  if (code === "PGRST204" || code === "42703") {
    return "Database schema mismatch. Please refresh and re-run migrations.";
  }
  if (typeof err.message === "string" && err.message.trim().length > 0) {
    return err.message;
  }
  if (error instanceof Error) return error.message;
  return fallback;
};

export const getSupabaseErrorDetails = (error: unknown) => {
  const err = error as SupabaseErrorLike;
  return {
    code: err?.code ?? null,
    message: getSupabaseErrorMessage(error),
  };
};

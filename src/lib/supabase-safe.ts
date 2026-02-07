import type { PostgrestError, PostgrestFilterBuilder } from "@supabase/supabase-js";
import { supabase } from "./supabase";

type FilterFn = (query: PostgrestFilterBuilder<any, any, any>) => PostgrestFilterBuilder<any, any, any>;

const isMissingColumnError = (error?: PostgrestError | null) => {
  if (!error) return false;
  if (error.code === "42703") return true;
  const message = error.message ?? "";
  return /column .* does not exist/i.test(message) || /schema cache/i.test(message);
};

export async function safeSelect<T>(params: {
  table: string;
  columns: string;
  fallbackColumns?: string;
  filter?: FilterFn;
}) {
  const { table, columns, fallbackColumns, filter } = params;
  let query = supabase.from(table).select(columns);
  if (filter) {
    query = filter(query);
  }
  const result = await query;
  if (!result.error || !isMissingColumnError(result.error) || !fallbackColumns) {
    return result as { data: T[] | null; error: PostgrestError | null };
  }
  let fallback = supabase.from(table).select(fallbackColumns);
  if (filter) {
    fallback = filter(fallback);
  }
  return (await fallback) as { data: T[] | null; error: PostgrestError | null };
}

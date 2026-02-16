import { supabase } from "./supabase";
import { formatDateInTimezone, getWeekdayFromDateString } from "./date-utils";

export type CheckinStatus = {
  due: boolean;
  submitted: boolean;
  reviewed: boolean;
  checkinId?: string;
  reviewSupported?: boolean;
};

type CheckinRow = Record<string, unknown> & {
  id?: string | null;
  client_id?: string | null;
  created_at?: string | null;
  submitted_at?: string | null;
  checkin_date?: string | null;
  week_start?: string | null;
  period_start?: string | null;
  reviewed_at?: string | null;
  reviewed_by?: string | null;
  reviewed?: boolean | null;
  coach_reviewed_at?: string | null;
  status?: string | null;
  submitted?: boolean | null;
};

let didLogCheckinError = false;

const isDateOnly = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);

const normalizeDate = (value: unknown, timezone?: string | null) => {
  if (typeof value !== "string" || !value) return null;
  if (isDateOnly(value)) return value;
  return formatDateInTimezone(value, timezone);
};

const getCheckinDate = (row: CheckinRow, timezone?: string | null) =>
  normalizeDate(
    row.checkin_date ??
      row.week_start ??
      row.period_start ??
      row.created_at ??
      row.submitted_at,
    timezone,
  );

const getCheckinTimestamp = (row: CheckinRow) => {
  const raw =
    (typeof row.submitted_at === "string" && row.submitted_at) ||
    (typeof row.created_at === "string" && row.created_at) ||
    null;
  if (raw) {
    const parsed = Date.parse(raw);
    if (!Number.isNaN(parsed)) return parsed;
  }

  const dateOnly =
    (typeof row.checkin_date === "string" && row.checkin_date) ||
    (typeof row.week_start === "string" && row.week_start) ||
    (typeof row.period_start === "string" && row.period_start) ||
    null;
  if (dateOnly && isDateOnly(dateOnly)) {
    return Date.parse(`${dateOnly}T00:00:00Z`);
  }

  return null;
};

const isSubmittedRow = (row: CheckinRow) => {
  if (row.submitted === true) return true;
  if (row.submitted_at) return true;
  const status = typeof row.status === "string" ? row.status.toLowerCase() : "";
  if (["submitted", "complete", "completed", "done"].includes(status))
    return true;
  if (row.created_at) return true;
  return false;
};

const hasReviewFields = (row: CheckinRow) =>
  "reviewed_at" in row ||
  "reviewed_by" in row ||
  "reviewed" in row ||
  "coach_reviewed_at" in row;

const isReviewedRow = (row: CheckinRow) => {
  if (row.reviewed === true) return true;
  if (row.reviewed_at || row.reviewed_by || row.coach_reviewed_at) return true;
  return false;
};

const logCheckinErrorOnce = (error: unknown) => {
  if (didLogCheckinError || !error) return;
  didLogCheckinError = true;
  const err = error as { code?: string; message?: string };
  const suffix = [err.code, err.message].filter(Boolean).join(" ");
  console.error("CHECKIN_QUERY_ERROR", suffix || err);
};

export const getClientCheckinStatus = async (
  clientId: string,
  todayStr: string,
  timezone?: string | null,
): Promise<CheckinStatus> => {
  try {
    const { data, error } = await supabase
      .from("checkins")
      .select("*")
      .eq("client_id", clientId);
    if (error) {
      logCheckinErrorOnce(error);
      return { due: false, submitted: false, reviewed: false };
    }

    const rows = (data ?? []) as CheckinRow[];
    const hasCheckinToday = rows.some(
      (row) => getCheckinDate(row, timezone) === todayStr,
    );

    let latestRow: CheckinRow | null = null;
    let latestTs: number | null = null;
    rows.forEach((row) => {
      const ts = getCheckinTimestamp(row);
      if (ts === null) return;
      if (latestTs === null || ts > latestTs) {
        latestTs = ts;
        latestRow = row;
      }
    });

    if (!latestRow && rows.length > 0) {
      latestRow = rows[0];
    }

    const isSaturday = getWeekdayFromDateString(todayStr) === 6;
    const due = isSaturday && !hasCheckinToday;

    const submitted = latestRow ? isSubmittedRow(latestRow) : false;
    const reviewSupported = latestRow ? hasReviewFields(latestRow) : false;
    const reviewed =
      latestRow && reviewSupported ? isReviewedRow(latestRow) : false;

    return {
      due,
      submitted,
      reviewed,
      checkinId: latestRow?.id ?? undefined,
      reviewSupported,
    };
  } catch (error) {
    logCheckinErrorOnce(error);
    return { due: false, submitted: false, reviewed: false };
  }
};

export const getLatestCheckinDate = (
  rows: CheckinRow[],
  timezone?: string | null,
): string | null => {
  let latestDate: string | null = null;
  let latestTs: number | null = null;

  rows.forEach((row) => {
    const ts = getCheckinTimestamp(row);
    if (ts === null) return;
    if (latestTs === null || ts > latestTs) {
      latestTs = ts;
      latestDate = getCheckinDate(row, timezone);
    }
  });

  return latestDate;
};

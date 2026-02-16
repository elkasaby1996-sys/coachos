const pad = (value: number) => String(value).padStart(2, "0");

export const getTodayInTimezone = (timezone?: string | null) => {
  const tz = timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const lookup = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );
  const year = Number(lookup.year);
  const month = Number(lookup.month);
  const day = Number(lookup.day);
  if (!year || !month || !day) {
    return new Date().toISOString().slice(0, 10);
  }
  return `${year}-${pad(month)}-${pad(day)}`;
};

export const addDaysToDateString = (dateStr: string, deltaDays: number) => {
  const [year, month, day] = dateStr.split("-").map(Number);
  if (!year || !month || !day) return dateStr;
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + deltaDays);
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
};

export const diffDays = (later: string, earlier: string) => {
  const [ly, lm, ld] = later.split("-").map(Number);
  const [ey, em, ed] = earlier.split("-").map(Number);
  if (!ly || !lm || !ld || !ey || !em || !ed) return 0;
  const laterDate = Date.UTC(ly, lm - 1, ld);
  const earlierDate = Date.UTC(ey, em - 1, ed);
  return Math.round((laterDate - earlierDate) / (1000 * 60 * 60 * 24));
};

export const getWeekdayFromDateString = (dateStr: string) => {
  const [year, month, day] = dateStr.split("-").map(Number);
  if (!year || !month || !day) return 0;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCDay();
};

export const getWeekStartSunday = (dateStr: string) =>
  addDaysToDateString(dateStr, -getWeekdayFromDateString(dateStr));

export const getWeekEndSaturday = (dateStr: string) =>
  addDaysToDateString(getWeekStartSunday(dateStr), 6);

export const getLastSaturday = (dateStr: string) => {
  const weekday = getWeekdayFromDateString(dateStr);
  const delta = (weekday - 6 + 7) % 7;
  return addDaysToDateString(dateStr, -delta);
};

export const formatDateInTimezone = (
  timestamp: string,
  timezone?: string | null,
) => {
  const tz = timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(timestamp));
  const lookup = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );
  const year = Number(lookup.year);
  const month = Number(lookup.month);
  const day = Number(lookup.day);
  if (!year || !month || !day) {
    return new Date(timestamp).toISOString().slice(0, 10);
  }
  return `${year}-${pad(month)}-${pad(day)}`;
};

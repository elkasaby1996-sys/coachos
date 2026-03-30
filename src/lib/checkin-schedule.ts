import { addDaysToDateString, diffDays } from "./date-utils";

export type CheckinFrequency = "weekly" | "biweekly" | "monthly";

export const CHECKIN_DEFAULT_FREQUENCY: CheckinFrequency = "weekly";
export const CHECKIN_REQUIRED_PHOTO_TYPES = ["front", "side", "back"] as const;

const isDateKey = (value: string | null | undefined): value is string =>
  Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));

const getLastDayOfMonth = (year: number, monthIndex: number) =>
  new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();

export const normalizeCheckinFrequency = (
  value: string | null | undefined,
): CheckinFrequency => {
  if (value === "biweekly" || value === "monthly" || value === "weekly") {
    return value;
  }
  return CHECKIN_DEFAULT_FREQUENCY;
};

export const getCheckinFrequencyLabel = (
  value: string | null | undefined,
): string => {
  const frequency = normalizeCheckinFrequency(value);
  if (frequency === "biweekly") return "Bi-weekly";
  if (frequency === "monthly") return "Monthly";
  return "Weekly";
};

export const normalizeCheckinDueDate = (
  anchorDate: string | null | undefined,
): string | null => {
  if (!isDateKey(anchorDate)) return null;
  return anchorDate;
};

export const addMonthsClampedToDateString = (
  dateStr: string,
  months: number,
): string | null => {
  if (!isDateKey(dateStr)) return null;
  const [year, month, day] = dateStr.split("-").map(Number);
  if (!year || !month || !day) return null;

  const baseMonthIndex = month - 1;
  const totalMonths = baseMonthIndex + months;
  const nextYear = year + Math.floor(totalMonths / 12);
  const normalizedMonthIndex = ((totalMonths % 12) + 12) % 12;
  const nextDay = Math.min(
    day,
    getLastDayOfMonth(nextYear, normalizedMonthIndex),
  );

  return `${nextYear}-${String(normalizedMonthIndex + 1).padStart(2, "0")}-${String(nextDay).padStart(2, "0")}`;
};

export const getCheckinAnchorDateForOccurrence = (
  startDate: string | null | undefined,
  frequency: string | null | undefined,
  occurrence: number,
): string | null => {
  if (!isDateKey(startDate) || occurrence < 0) return null;
  const normalizedFrequency = normalizeCheckinFrequency(frequency);

  if (normalizedFrequency === "monthly") {
    return addMonthsClampedToDateString(startDate, occurrence);
  }

  const stepDays = normalizedFrequency === "biweekly" ? 14 : 7;
  return addDaysToDateString(startDate, stepDays * occurrence);
};

export const getCheckinDueDateForOccurrence = (
  startDate: string | null | undefined,
  frequency: string | null | undefined,
  occurrence: number,
): string | null => {
  const anchorDate = getCheckinAnchorDateForOccurrence(
    startDate,
    frequency,
    occurrence,
  );
  return normalizeCheckinDueDate(anchorDate);
};

export const getNextCheckinDueDate = (
  startDate: string | null | undefined,
  frequency: string | null | undefined,
  fromDate: string,
): string | null => {
  if (!isDateKey(startDate) || !isDateKey(fromDate)) return null;

  let occurrence = 0;
  let dueDate = getCheckinDueDateForOccurrence(
    startDate,
    frequency,
    occurrence,
  );

  while (dueDate && dueDate < fromDate) {
    occurrence += 1;
    dueDate = getCheckinDueDateForOccurrence(startDate, frequency, occurrence);
  }

  return dueDate;
};

export const listCheckinDueDatesInRange = (
  startDate: string | null | undefined,
  frequency: string | null | undefined,
  rangeStart: string,
  rangeEnd: string,
): string[] => {
  if (
    !isDateKey(startDate) ||
    !isDateKey(rangeStart) ||
    !isDateKey(rangeEnd) ||
    rangeEnd < rangeStart
  ) {
    return [];
  }

  const dueDates: string[] = [];
  let occurrence = 0;
  let dueDate = getCheckinDueDateForOccurrence(
    startDate,
    frequency,
    occurrence,
  );

  while (dueDate && dueDate < rangeStart) {
    occurrence += 1;
    dueDate = getCheckinDueDateForOccurrence(startDate, frequency, occurrence);
  }

  while (dueDate && dueDate <= rangeEnd) {
    dueDates.push(dueDate);
    occurrence += 1;
    dueDate = getCheckinDueDateForOccurrence(startDate, frequency, occurrence);
  }

  return dueDates;
};

export const getDaysUntilCheckinDue = (
  startDate: string | null | undefined,
  frequency: string | null | undefined,
  today: string,
): number | null => {
  const dueDate = getNextCheckinDueDate(startDate, frequency, today);
  if (!dueDate) return null;
  return diffDays(dueDate, today);
};

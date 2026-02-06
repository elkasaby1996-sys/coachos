import { addDaysToDateString } from "./date-utils";

const toDateKey = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export const computeStreak = (
  logDates: string[],
  today: string | Date,
  maxDays = 30
): number => {
  const todayStr = typeof today === "string" ? today : toDateKey(today);
  if (!todayStr) return 0;
  const logSet = new Set(logDates);
  let streak = 0;
  for (let i = 0; i < maxDays; i += 1) {
    const dateKey = addDaysToDateString(todayStr, -i);
    if (!logSet.has(dateKey)) break;
    streak += 1;
  }
  return streak;
};

export const getLatestLogDate = (logDates: string[]): string | null => {
  if (logDates.length === 0) return null;
  return logDates.reduce((latest, date) => (date > latest ? date : latest), logDates[0]);
};

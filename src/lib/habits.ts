import { addDaysToDateString } from "./date-utils";

export const computeStreak = (
  logDates: string[],
  todayStr: string,
  maxDays = 30
): number => {
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

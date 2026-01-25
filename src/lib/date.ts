export function getWeekEndingSaturday(date: Date) {
  const result = new Date(date);
  const day = result.getDay();
  const diff = (6 - day + 7) % 7;
  result.setDate(result.getDate() + diff);
  result.setHours(0, 0, 0, 0);
  return result;
}

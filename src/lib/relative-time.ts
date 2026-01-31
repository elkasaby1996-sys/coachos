export const formatRelativeTime = (value: Date | string | null | undefined) => {
  if (!value) return "today";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "today";

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.round(
    (startOfToday.getTime() - startOfDate.getTime()) / (1000 * 60 * 60 * 24)
  );

  if (diffDays <= 0) return "today";
  if (diffDays === 1) return "yesterday";
  return `${diffDays} days ago`;
};

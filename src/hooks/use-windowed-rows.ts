import { useCallback, useEffect, useMemo, useState } from "react";

export function useWindowedRows<T>({
  rows,
  initialCount = 24,
  step = 24,
  resetKey,
}: {
  rows: T[];
  initialCount?: number;
  step?: number;
  resetKey?: string | number | null;
}) {
  const [visibleCount, setVisibleCount] = useState(initialCount);

  useEffect(() => {
    setVisibleCount(initialCount);
  }, [initialCount, resetKey]);

  const visibleRows = useMemo(
    () => rows.slice(0, visibleCount),
    [rows, visibleCount],
  );

  const hasHiddenRows = rows.length > visibleRows.length;

  const showMore = useCallback(() => {
    setVisibleCount((current) => current + step);
  }, [step]);

  const showAll = useCallback(() => {
    setVisibleCount(rows.length);
  }, [rows.length]);

  return {
    visibleCount,
    visibleRows,
    hasHiddenRows,
    hiddenCount: Math.max(0, rows.length - visibleRows.length),
    showMore,
    showAll,
  };
}

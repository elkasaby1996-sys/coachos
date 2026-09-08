import {
  convertWeight,
  sumRecorded,
  type WeightUnit,
} from "./client-measurements";
export type TrainingSet = {
  sessionId: string;
  exerciseId: string;
  name: string;
  completedAt: string;
  completed: boolean;
  weight: number | null;
  unit: string | null;
  reps: number | null;
};
export function completedTraining(
  rows: TrainingSet[],
  unit: WeightUnit,
  start: string,
  end: string,
  timezone = "UTC",
) {
  const sessions = new Map<
    string,
    {
      id: string;
      dateKey: string;
      completedAt: string;
      name: string;
      weights: number[];
      volumes: number[];
    }
  >();
  for (const row of rows) {
    const timestamp = new Date(row.completedAt);
    if (Number.isNaN(timestamp.getTime())) continue;
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat("en-US", {
        timeZone: timezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      })
        .formatToParts(timestamp)
        .map((part) => [part.type, part.value]),
    );
    const dateKey = `${parts.year}-${parts.month}-${parts.day}`;
    if (!row.completed || !dateKey || dateKey < start || dateKey > end)
      continue;
    const key = JSON.stringify([row.exerciseId, row.sessionId]);
    const current = sessions.get(key) ?? {
      id: row.exerciseId,
      dateKey,
      completedAt: row.completedAt,
      name: row.name,
      weights: [],
      volumes: [],
    };
    const weight = convertWeight(row.weight, row.unit, unit);
    if (weight !== null && weight >= 0) {
      current.weights.push(weight);
      if (row.reps !== null && Number.isFinite(row.reps) && row.reps >= 0)
        current.volumes.push(weight * row.reps);
    }
    sessions.set(key, current);
  }
  const byDate = new Map<string, { weights: number[]; volumes: number[] }>();
  const byExercise = new Map<
    string,
    Array<{ name: string; weight: number | null; volume: number | null }>
  >();
  for (const session of [...sessions.values()].sort((a, b) =>
    a.completedAt.localeCompare(b.completedAt),
  )) {
    const date = byDate.get(session.dateKey) ?? { weights: [], volumes: [] };
    date.weights.push(...session.weights);
    date.volumes.push(...session.volumes);
    byDate.set(session.dateKey, date);
    const exercise = byExercise.get(session.id) ?? [];
    exercise.push({
      name: session.name,
      weight: session.weights.length ? Math.max(...session.weights) : null,
      volume: sumRecorded(session.volumes),
    });
    byExercise.set(session.id, exercise);
  }
  const delta = (a: number | null, b: number | null) =>
    a === null || b === null ? null : b - a;
  const percent = (a: number | null, b: number | null) =>
    a === null || b === null || a === 0 ? null : ((b - a) / a) * 100;
  return {
    loadSeries: [...byDate].map(([dateKey, date]) => ({
      dateKey,
      label: dateKey,
      volume: sumRecorded(date.volumes),
      avgWeight: date.weights.length
        ? date.weights.reduce((a, b) => a + b, 0) / date.weights.length
        : null,
    })),
    changes: [...byExercise.values()]
      .filter((rows) => rows.length >= 2)
      .map((rows) => {
        const first = rows[0]!,
          last = rows[rows.length - 1]!;
        return {
          name: last.name,
          weightDelta: delta(first.weight, last.weight),
          volumeDelta: delta(first.volume, last.volume),
          weightPct: percent(first.weight, last.weight),
          volumePct: percent(first.volume, last.volume),
        };
      })
      .filter((row) => row.weightDelta !== null || row.volumeDelta !== null)
      .slice(0, 6),
  };
}

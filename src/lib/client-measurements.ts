export type WeightUnit = "kg" | "lb";
export function convertWeight(
  value: number | null | undefined,
  from: string | null | undefined,
  to: WeightUnit,
): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const unit = from?.trim().toLowerCase();
  if (unit !== "kg" && unit !== "lb" && unit !== "lbs") return null;
  const kg = unit === "kg" ? value : value / 2.2046226218;
  return to === "kg" ? kg : kg * 2.2046226218;
}
export function parseOptionalAmount(value: string): number | null {
  if (!value.trim()) return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}
export function sumRecorded(
  values: Array<number | null | undefined>,
): number | null {
  const recorded = values.filter(
    (v): v is number => typeof v === "number" && Number.isFinite(v),
  );
  return recorded.length ? recorded.reduce((a, b) => a + b, 0) : null;
}
export const formatRecorded = (value: number | null) =>
  value === null ? "Not logged" : String(Math.round(value));

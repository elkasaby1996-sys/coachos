/** Current registration. Domain components consume capabilities, not SDK types. */
const currentCapabilities = new Map([
  ["paddle", { planChanges: true, seatChanges: true, paymentMethod: true }],
]);
export function billingCapability(
  provider: unknown,
  capability: "planChanges" | "seatChanges" | "paymentMethod",
) {
  return (
    typeof provider === "string" &&
    currentCapabilities.get(provider)?.[capability] === true
  );
}

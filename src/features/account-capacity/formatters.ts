import type {
  AccountCapacityDimension,
  AccountCapacityDimensionKey,
  AccountCapacityState,
} from "./contracts";
export const capacityLabels: Record<AccountCapacityDimensionKey, string> = {
  counted_clients: "Clients",
  coach_seats: "Coach seats",
  active_workspaces: "Workspaces",
  published_packages: "Published packages",
};
export const capacityStateLabels: Record<AccountCapacityState, string> = {
  unavailable: "Unavailable",
  unlimited: "Unlimited",
  available: "Available",
  approaching: "Approaching limit",
  at_limit: "At limit",
  over_limit: "Over limit",
};
export function formatCapacityUsage(d: AccountCapacityDimension) {
  const noun = {
    counted_clients: d.actual === 1 ? "current client" : "current clients",
    coach_seats: "active",
    active_workspaces: d.actual === 1 ? "workspace" : "workspaces",
    published_packages: "published",
  }[d.key];
  const base = `${d.actual} ${noun}${d.pending ? ` + ${d.pending} pending` : ""}${d.reserved ? ` + ${d.reserved} reserved` : ""}`;
  return `${base}${d.state === "unavailable" ? " · Capacity limit unavailable" : d.limit === null ? " · Unlimited" : ` of ${d.limit}`}`;
}

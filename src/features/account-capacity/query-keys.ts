import type { QueryClient } from "@tanstack/react-query";
export const accountCapacityKeys = {
  all: ["account-capacity"] as const,
  owner: (userId: string | undefined) =>
    ["account-capacity", "owner", userId] as const,
};
/** Cache maintenance must never change a successful domain mutation's outcome. */
export function invalidateAccountCapacity(queryClient: QueryClient) {
  void queryClient
    .invalidateQueries({ queryKey: accountCapacityKeys.all })
    .catch(() => undefined);
}

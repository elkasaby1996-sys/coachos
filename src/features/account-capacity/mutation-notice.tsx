import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useSessionAuth } from "../../lib/auth";
import { fetchMyAccountCapacitySnapshot } from "./account-capacity-api";
import { accountCapacityKeys } from "./query-keys";
import {
  capacityMutationCopy,
  type CapacityAudience,
  type CapacityMutationError,
} from "./mutation-errors";

export function CapacityMutationNotice({
  error,
  audience,
}: {
  error: CapacityMutationError;
  audience: CapacityAudience;
}) {
  const { user } = useSessionAuth();
  const snapshot = useQuery({
    queryKey: accountCapacityKeys.owner(user?.id),
    queryFn: () => fetchMyAccountCapacitySnapshot(),
    enabled: audience === "owner" && Boolean(user?.id),
    staleTime: 0,
    retry: false,
  });
  return (
    <div
      role="alert"
      className="space-y-2 rounded-lg border border-danger/30 px-3 py-2 text-sm"
    >
      <p>
        {capacityMutationCopy(
          error,
          audience,
          audience === "owner" ? snapshot.data : undefined,
        )}
      </p>
      {audience === "owner" ? (
        <Link
          to="/pt-hub/settings/billing"
          className="font-medium underline underline-offset-4"
        >
          View Billing
        </Link>
      ) : null}
    </div>
  );
}

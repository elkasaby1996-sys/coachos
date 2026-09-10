import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import * as Sentry from "@sentry/react";
import { CapacityMutationNotice } from "./mutation-notice";
import {
  capacityMutationFailure,
  type CapacityAudience,
  type CapacityMutationError,
} from "./mutation-errors";

/** Local to the mutation form; no startup queries or global provider. */
export function useCapacityMutationFeedback(audience: CapacityAudience) {
  const queryClient = useQueryClient();
  const [failure, setFailure] = useState<{
    error: CapacityMutationError;
    audience: CapacityAudience;
  } | null>(null);
  function report(
    candidate: unknown,
    targetAudience: CapacityAudience = audience,
  ) {
    const mapped = capacityMutationFailure(
      candidate,
      queryClient,
      targetAudience,
    );
    if (!mapped) return null;
    setFailure({ error: mapped, audience: targetAudience });
    Sentry.captureMessage("Account capacity mutation denied", {
      level: "info",
      tags: { capacityCode: mapped.code, capacityDimension: mapped.dimension },
    });
    return mapped.message;
  }
  return {
    report,
    clear: () => setFailure(null),
    notice: failure ? (
      <CapacityMutationNotice
        error={failure.error}
        audience={failure.audience}
      />
    ) : null,
  };
}

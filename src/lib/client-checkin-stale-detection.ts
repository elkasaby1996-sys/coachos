export type CheckinDefinitionChangeResult =
  | "unchanged"
  | "accept-latest"
  | "warn-stale";

export function resolveAcceptedCheckinDefinitionSignature({
  key,
  previousKey,
  acceptedSignature,
  renderedSignature,
  latestFetchedSignature,
}: {
  key: string;
  previousKey: string | null;
  acceptedSignature: string | null;
  renderedSignature: string | null;
  latestFetchedSignature: string | null;
}) {
  if (previousKey !== key) {
    const nextSignature = renderedSignature ?? latestFetchedSignature;
    if (!nextSignature) {
      return {
        key: previousKey,
        signature: acceptedSignature,
        resetLocalState: false,
      };
    }

    return {
      key,
      signature: nextSignature,
      resetLocalState: true,
    };
  }

  if (!acceptedSignature && renderedSignature) {
    return {
      key,
      signature: renderedSignature,
      resetLocalState: false,
    };
  }

  return {
    key,
    signature: acceptedSignature,
    resetLocalState: false,
  };
}

export function resolveCheckinDefinitionChange({
  acceptedSignature,
  latestSignature,
  formDirty,
}: {
  acceptedSignature: string | null;
  latestSignature: string | null;
  formDirty: boolean;
}): CheckinDefinitionChangeResult {
  void formDirty;
  if (!latestSignature) return "unchanged";
  if (!acceptedSignature) return "accept-latest";
  if (latestSignature === acceptedSignature) return "unchanged";
  return "warn-stale";
}

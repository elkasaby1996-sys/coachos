/** Translate provider mutation vocabulary before shared workflows consume it. */
export function projectPaddlePlanResult(
  action: string,
  value: Record<string, any>,
) {
  if (action !== "preview") return value;
  const { prorationMode, ...result } = value;
  return {
    ...result,
    billingTreatment:
      prorationMode === "invoice_immediately"
        ? "charge_now"
        : prorationMode === "disable_prorations"
          ? "no_immediate_charge"
          : null,
  };
}
/** Preserve the public preview contracts; neutral vocabulary stays internal. */
export function legacyPaddlePlanPreview(
  value: Record<string, any>,
  version: 1 | 2 = 1,
) {
  const { billingTreatment, quote: _quote, ...result } = value;
  return {
    ...result,
    prorationMode:
      billingTreatment === "charge_now"
        ? "invoice_immediately"
        : billingTreatment === "no_immediate_charge"
          ? "disable_prorations"
          : null,
    ...(version === 2 && _quote !== undefined ? { quote: _quote } : {}),
  };
}

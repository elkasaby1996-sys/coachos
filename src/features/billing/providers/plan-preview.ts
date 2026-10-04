import { planChangePreviewSchema } from "../plan-change-contracts";
/** Compatibility translation for a previously deployed Paddle v2 preview. */
export function parsePlanPreview(value: unknown) {
  if (value && typeof value === "object" && "prorationMode" in value) {
    const { prorationMode, ...rest } = value as Record<string, unknown>;
    return planChangePreviewSchema.parse({
      ...rest,
      billingTreatment:
        prorationMode === "invoice_immediately"
          ? "charge_now"
          : prorationMode === "disable_prorations"
            ? "no_immediate_charge"
            : null,
    });
  }
  return planChangePreviewSchema.parse(value);
}

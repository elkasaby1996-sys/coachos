import { z } from "zod";

export const ACCESS_MODES = [
  "onboarding",
  "full",
  "existing_delivery_only",
  "read_only",
  "none",
] as const;
export const ACTION_CLASSES = [
  "billing_manage",
  "account_security",
  "data_export",
  "remediation",
  "workspace_read",
  "delivery_write",
  "business_configuration_write",
  "acquisition_write",
  "capacity_growth",
  "client_self_service",
  "client_coached_read",
  "client_coached_write",
] as const;
export type AccessMode = (typeof ACCESS_MODES)[number];
export type ActionClass = (typeof ACTION_CLASSES)[number];
export function actionAllowed(mode: AccessMode, action: ActionClass): boolean {
  if (
    [
      "billing_manage",
      "account_security",
      "data_export",
      "remediation",
      "client_self_service",
      "client_coached_read",
    ].includes(action)
  )
    return true;
  if (mode === "full") return true;
  if (action === "workspace_read")
    return mode === "existing_delivery_only" || mode === "read_only";
  return (
    mode === "existing_delivery_only" &&
    (action === "delivery_write" || action === "client_coached_write")
  );
}
const timestamp = z.string().datetime({ offset: true });
const reasonModes = {
  no_subscription: "onboarding",
  trialing: "full",
  active: "full",
  past_due: "full",
  trial_recovery: "existing_delivery_only",
  grace: "existing_delivery_only",
  restricted: "read_only",
  canceled: "read_only",
  expired: "none",
  owner_recovery_required: "read_only",
} as const;
export const ownerAccessSchema = z
  .object({
    schemaVersion: z.literal(1),
    accessMode: z.enum(ACCESS_MODES),
    reason: z.enum(
      Object.keys(reasonModes) as [
        keyof typeof reasonModes,
        ...(keyof typeof reasonModes)[],
      ],
    ),
    effectiveUntil: timestamp.nullable(),
    actions: z.record(z.enum(ACTION_CLASSES), z.boolean()),
    canManageBilling: z.literal(true),
    recoveryRequired: z.boolean(),
    recoveryAction: z.enum([
      "none",
      "start_trial",
      "review_billing",
      "contact_support",
    ]),
    recoveryPath: z.enum(["/pt-hub/settings/billing", "/contact"]),
    computedAt: timestamp,
  })
  .strict()
  .superRefine((v, ctx) => {
    const expectedRecovery = v.accessMode !== "full" || v.reason === "past_due";
    const expectedAction =
      v.reason === "owner_recovery_required"
        ? "contact_support"
        : !expectedRecovery
          ? "none"
          : v.accessMode === "onboarding"
            ? "start_trial"
            : "review_billing";
    if (
      reasonModes[v.reason] !== v.accessMode ||
      v.recoveryRequired !== expectedRecovery ||
      v.recoveryAction !== expectedAction ||
      v.recoveryPath !==
        (v.reason === "owner_recovery_required"
          ? "/contact"
          : "/pt-hub/settings/billing") ||
      ACTION_CLASSES.some(
        (a) => v.actions[a] !== actionAllowed(v.accessMode, a),
      )
    )
      ctx.addIssue({
        code: "custom",
        message: "Inconsistent commercial access contract.",
      });
    if (
      ["trialing", "trial_recovery"].includes(v.reason) &&
      (!v.effectiveUntil ||
        Date.parse(v.effectiveUntil) <= Date.parse(v.computedAt))
    )
      ctx.addIssue({ code: "custom", message: "Invalid effective interval." });
  });
export const workspaceAccessSchema = z
  .object({
    schemaVersion: z.literal(1),
    workspaceId: z.uuid(),
    billingOwnerUserId: z.uuid(),
    accessMode: z.enum(ACCESS_MODES),
    canReadWorkspace: z.boolean(),
    canWriteExistingDelivery: z.boolean(),
    canWriteBusinessConfiguration: z.boolean(),
    canGrowCapacity: z.boolean(),
    canManageBilling: z.boolean(),
    recoveryRequired: z.boolean(),
    computedAt: timestamp,
  })
  .strict()
  .refine(
    (v) =>
      v.canReadWorkspace === actionAllowed(v.accessMode, "workspace_read") &&
      v.canWriteExistingDelivery ===
        actionAllowed(v.accessMode, "delivery_write") &&
      v.canWriteBusinessConfiguration ===
        actionAllowed(v.accessMode, "business_configuration_write") &&
      v.canGrowCapacity === actionAllowed(v.accessMode, "capacity_growth") &&
      (v.accessMode === "full" || v.recoveryRequired),
    "Inconsistent workspace access contract.",
  );
export const clientAccessSchema = z
  .object({
    schemaVersion: z.literal(1),
    clientId: z.uuid(),
    serviceMode: z.enum([
      "interactive",
      "existing_delivery",
      "read_only",
      "unavailable",
    ]),
    canReadCoachedContent: z.literal(true),
    canLogWorkout: z.boolean(),
    canSubmitCheckin: z.boolean(),
    canSubmitHabitProgress: z.boolean(),
    canMessageRelationship: z.boolean(),
    canUseIndependentSelfService: z.literal(true),
    canBrowseMarketplace: z.literal(true),
    computedAt: timestamp,
  })
  .strict()
  .refine(
    (v) =>
      [
        v.canLogWorkout,
        v.canSubmitCheckin,
        v.canSubmitHabitProgress,
        v.canMessageRelationship,
      ].every(
        (x) =>
          x === ["interactive", "existing_delivery"].includes(v.serviceMode),
      ),
    "Inconsistent coaching access contract.",
  );
export type OwnerAccess = z.infer<typeof ownerAccessSchema>;
export type WorkspaceAccess = z.infer<typeof workspaceAccessSchema>;
export type ClientAccess = z.infer<typeof clientAccessSchema>;

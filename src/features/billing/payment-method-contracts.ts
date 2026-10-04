import { z } from "zod";

export const paymentMethodRequestSchema = z.strictObject({
  intent: z.literal("update_payment_method"),
});
export const paymentMethodStateSchema = z.discriminatedUnion("available", [
  z
    .strictObject({
      available: z.literal(true),
      status: z.enum(["active", "past_due"]),
      maySettleExistingBalance: z.boolean(),
    })
    .refine(
      (state) =>
        state.maySettleExistingBalance === (state.status === "past_due"),
    ),
  z.strictObject({
    available: z.literal(false),
    reason: z.literal("not_available"),
    maySettleExistingBalance: z.literal(false),
  }),
]);
export const paymentMethodContinuationSchema = z.strictObject({
  kind: z.literal("provider_checkout"),
  provider: z.string().regex(/^[a-z][a-z0-9_-]{0,63}$/),
  environment: z.enum(["test", "live"]),
  token: z
    .string()
    .min(1)
    .max(256)
    .regex(/^\S+$/)
    .refine((value) =>
      [...value].every(
        (char) => char.charCodeAt(0) > 31 && char.charCodeAt(0) !== 127,
      ),
    ),
});
export const paymentMethodResponseSchema = z.strictObject({
  intent: z.literal("update_payment_method"),
  effect: z.discriminatedUnion("kind", [
    z.strictObject({ kind: z.literal("update_only") }),
    z.strictObject({
      kind: z.literal("settle_existing_balance"),
      amountMinor: z.string().regex(/^[1-9][0-9]{0,15}$/),
      currency: z.string().regex(/^[A-Z]{3}$/),
    }),
  ]),
  continuation: paymentMethodContinuationSchema,
});
export type PaymentMethodState = z.infer<typeof paymentMethodStateSchema>;
export type PaymentMethodContinuation = z.infer<
  typeof paymentMethodContinuationSchema
>;

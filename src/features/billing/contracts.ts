import { z } from "zod";
import { PUBLIC_PLAN_KEYS } from "../commercial-catalogue/contracts";

export const checkoutRequestSchema = z.strictObject({
  planKey: z.enum(PUBLIC_PLAN_KEYS),
  cadence: z.enum(["monthly", "annual"]),
  operationId: z.uuid(),
});
export type CheckoutRequest = z.infer<typeof checkoutRequestSchema>;
export const hostedCheckoutUrlSchema = z.url().refine((value) => {
  const u = new URL(value);
  return (
    u.protocol === "https:" &&
    /^[a-z0-9-]+\.lemonsqueezy\.com$/.test(u.hostname) &&
    !u.username &&
    !u.password &&
    !u.port &&
    !u.hash &&
    u.pathname.startsWith("/checkout/")
  );
});
export const checkoutResponseSchema = z.strictObject({
  checkoutUrl: hostedCheckoutUrlSchema,
  checkoutAttemptId: z.uuid(),
  expiresAt: z.iso
    .datetime({ offset: true })
    .refine((v) => Date.parse(v) > Date.now()),
});
export const checkoutStateSchema = z.strictObject({
  checkoutAttemptId: z.uuid().nullable(),
  status: z
    .enum(["creating", "ready", "completed", "failed", "ambiguous", "expired"])
    .nullable(),
  expiresAt: z.iso.datetime({ offset: true }).nullable(),
  errorCode: z.string().nullable(),
});
export type CheckoutState = z.infer<typeof checkoutStateSchema>;

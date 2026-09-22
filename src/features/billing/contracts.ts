import { z } from "zod";
import { PUBLIC_PLAN_KEYS } from "../commercial-catalogue/contracts";
import { billingBrowserProvider } from "./providers/active-provider";
import { legalSiteConfig } from "../../lib/legal-site";

export const checkoutRequestSchema = z.strictObject({
  planKey: z.enum(PUBLIC_PLAN_KEYS),
  cadence: z.enum(["monthly", "annual"]),
  operationId: z.uuid(),
});
export type CheckoutRequest = z.infer<typeof checkoutRequestSchema>;
export const paddleCheckoutRequestSchema = z.strictObject({
  planKey: z.enum(PUBLIC_PLAN_KEYS),
  cadence: z.enum(["monthly", "annual"]),
  additionalCoachSeats: z.number().int().min(0).max(5),
  legal: z.strictObject({
    termsAccepted: z.literal(true),
    refundAcknowledged: z.literal(true),
    termsVersion: z.literal(legalSiteConfig.version),
    refundVersion: z.literal(legalSiteConfig.version),
  }),
});
export type PaddleCheckoutRequest = z.infer<typeof paddleCheckoutRequestSchema>;
export const hostedCheckoutUrlSchema = z
  .url()
  .refine(billingBrowserProvider.acceptsCheckoutUrl);
export const checkoutResponseSchema = z.strictObject({
  checkoutUrl: hostedCheckoutUrlSchema,
  checkoutAttemptId: z.uuid(),
  expiresAt: z.iso
    .datetime({ offset: true })
    .refine((v) => Date.parse(v) > Date.now()),
});
export const paddleCheckoutResponseSchema = z.strictObject({
  status: z.literal("ready"),
  checkoutUrl: hostedCheckoutUrlSchema,
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

import { z } from "zod";
import { PUBLIC_PLAN_KEYS } from "../commercial-catalogue/contracts";
import { billingBrowserProvider } from "./providers/active-provider";
import { legalSiteConfig } from "../../lib/legal-site";

export const billingCheckoutRequestSchema = z.strictObject({
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
export type BillingCheckoutRequest = z.infer<
  typeof billingCheckoutRequestSchema
>;
// Compatibility names for existing adapter clients; ordinary callers use the
// RepSync-owned plan/cadence/legal contract, which contains no provider IDs.
export const paddleCheckoutRequestSchema = billingCheckoutRequestSchema;
export type PaddleCheckoutRequest = BillingCheckoutRequest;
export const hostedCheckoutUrlSchema = z
  .url()
  .refine((url) => billingBrowserProvider?.acceptsCheckoutUrl(url) === true);
export const billingCheckoutResponseSchema = z.strictObject({
  status: z.literal("ready"),
  checkoutUrl: hostedCheckoutUrlSchema,
});
export const paddleCheckoutResponseSchema = billingCheckoutResponseSchema;

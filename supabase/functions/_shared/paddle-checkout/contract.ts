/** Trusted, already-resolved provider facts. No mapping or account authority. */
export type PaddleCheckoutInput = {
  base: { priceReference: string; quantity: 1 };
  seats?: { priceReference: string; quantity: number };
  correlation: { operationReference: string; attemptReference: string };
};
export type PaddleCheckoutRetrieveInput = {
  transactionReference: string;
  expected: PaddleCheckoutInput;
};
export type PaddleCheckoutDestination = {
  readonly kind: "merchant_payment_link" | "paddle_hosted";
  /** Ephemeral URL: do not log, snapshot, cache or persist it. */
  destination(): { url: string };
  toJSON(): never;
};
export type PaddleCheckoutObservation = {
  provider: "paddle";
  environment: "test";
  transactionReference: string;
  status:
    | "draft"
    | "ready"
    | "billed"
    | "paid"
    | "completed"
    | "past_due"
    | "canceled";
  correlation: PaddleCheckoutInput["correlation"];
  items: {
    priceReference: string;
    productReference: string | null;
    quantity: number;
  }[];
  currency: string;
  total: { amount: string; currency: string } | null;
  createdAt: string;
  updatedAt: string;
  billedAt: string | null;
  checkout: PaddleCheckoutDestination | null;
};
/** Dormant prep surface. Never installed on the active BillingAdapter. */
export interface PaddleCheckoutTransport {
  createCheckoutTransaction(
    input: PaddleCheckoutInput,
  ): Promise<PaddleCheckoutObservation>;
  retrieveCheckoutTransaction(
    input: PaddleCheckoutRetrieveInput,
  ): Promise<PaddleCheckoutObservation>;
}

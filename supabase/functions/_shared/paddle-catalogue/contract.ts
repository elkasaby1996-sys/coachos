/** Advisory provider facts only: not database arguments or verified receipts. */
export type PaddleStatus = "active" | "archived";
export type PaddleCycle = {
  interval: "day" | "week" | "month" | "year";
  frequency: number;
};
export type PaddleMoney = { currency: string; amount: string };
export type PaddleProductObservation = {
  productReference: string;
  status: PaddleStatus;
  taxCategory: string;
};
export type PaddlePriceObservation = {
  priceReference: string;
  productReference: string;
  status: PaddleStatus;
  unitPrice: PaddleMoney;
  billingCycle: PaddleCycle | null;
  trial:
    | (PaddleCycle & {
        requiresPaymentMethod: boolean;
        unitPrice: PaddleMoney | null;
        hasUnitPriceOverrides: boolean;
      })
    | null;
  quantity: { minimum: number; maximum: number };
  taxMode: "account_setting" | "internal" | "external";
  /** Base money alone cannot verify a price with geographic overrides. */
  hasUnitPriceOverrides: boolean;
};
/** Explicit capability; deliberately absent from the active billing provider. */
export interface PaddleCatalogueCapability {
  readonly provider: "paddle";
  readonly environment: "test";
  listProducts(): Promise<PaddleProductObservation[]>;
  retrieveProduct(reference: string): Promise<PaddleProductObservation>;
  listPrices(): Promise<PaddlePriceObservation[]>;
  retrievePrice(reference: string): Promise<PaddlePriceObservation>;
}

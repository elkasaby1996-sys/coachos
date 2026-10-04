/** RepSync workflow ports; concrete transports belong to integration modules. */
export type Rpc = (name: string, args: Record<string, unknown>) => Promise<any>;
export type BillingWorkflowAction = "preview" | "apply" | "cancel" | "refresh";
export type BillingWorkflow = (
  provider: string,
  owner: string,
  token: string,
  action: BillingWorkflowAction,
  input: Record<string, any>,
) => Promise<Record<string, any>>;
export type BillingDependencies = {
  providerAvailable?: (provider: string) => boolean;
  paymentMethodTransport?: (
    provider: string,
    environment: string,
  ) => import("./billing-provider.ts").PaymentMethodUpdateCapability;
  planAction?: BillingWorkflow;
  seatAction?: BillingWorkflow;
  legacyPlanPreview?: (
    value: Record<string, any>,
    version: 1 | 2,
  ) => Record<string, any>;
  authenticate: (
    token: string,
  ) => Promise<{ id: string; email?: string; name?: string } | null>;
  ownerRpc: (token: string) => Rpc;
  serviceRpc: Rpc;
  log?: (tags: { code: string; processingStatus: string }) => void;
};

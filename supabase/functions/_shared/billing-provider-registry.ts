import { BillingError } from "./billing-common.ts";
import type { BillingProviderKey } from "./billing-provider.ts";

/** Composition boundary: provider-specific factories stay outside the core. */
export function createBillingProviderRegistry<T>(
  registrations: readonly { provider: BillingProviderKey; factory: T }[],
  activeNewSalesProvider: BillingProviderKey,
) {
  const providers = new Map<BillingProviderKey, T>();
  for (const { provider, factory } of registrations) {
    if (!provider || provider !== provider.trim() || providers.has(provider))
      throw new BillingError("BILLING_PROVIDER_NOT_CONFIGURED", 503);
    providers.set(provider, factory);
  }
  const resolve = (provider: unknown): T => {
    const factory =
      typeof provider === "string" ? providers.get(provider) : null;
    if (!factory)
      throw new BillingError("BILLING_PROVIDER_NOT_CONFIGURED", 503);
    return factory;
  };
  // Validate the active registration at construction, before any dispatch.
  resolve(activeNewSalesProvider);
  return {
    forNewSales: () => resolve(activeNewSalesProvider),
    forSubscription: resolve,
  };
}

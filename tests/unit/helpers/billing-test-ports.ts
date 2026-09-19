import type {
  BillingConfig,
  BillingDependencies,
} from "../../../supabase/functions/_shared/billing-handlers";
import { adaptLemonSqueezyProvider } from "../../../supabase/functions/_shared/lemon-squeezy-adapter";
import { createLemonSqueezyCommercialPorts } from "../../../supabase/functions/_shared/lemon-squeezy-reconciliation";

/** Explicit fixture composition; production handlers never infer a legacy fallback. */
export function configureTestBillingPorts(
  config: BillingConfig,
): BillingConfig {
  return {
    ...config,
    adapter: adaptLemonSqueezyProvider(config.provider, config),
    commercial: createLemonSqueezyCommercialPorts(config.provider, config),
  };
}
export function installTestBillingPorts(deps: BillingDependencies) {
  const config = deps.config;
  deps.config = () => {
    const value = config();
    return value ? configureTestBillingPorts(value) : null;
  };
}

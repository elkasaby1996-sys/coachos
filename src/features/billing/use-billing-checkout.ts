import { useMutation } from "@tanstack/react-query";
import { createBillingCheckout } from "./checkout-api";

export function useBillingCheckout() {
  const create = useMutation({
    mutationFn: createBillingCheckout,
    retry: false,
  });
  return { create };
}

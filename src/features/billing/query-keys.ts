export const billingKeys = {
  state: (user: string | undefined, attempt: string | null) =>
    ["billing-checkout", user ?? "anonymous", attempt] as const,
};

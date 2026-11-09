/** Portal URLs contain a short-lived customer session. Never persist or log them. */
export function acceptsPaddlePortalUrl(
  value: unknown,
  environment: "test" | "live",
): value is string {
  if (typeof value !== "string" || value.length > 4096 || /[\s\\#]/.test(value))
    return false;
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.port &&
      !url.hash &&
      url.hostname ===
        (environment === "test"
          ? "sandbox-customer-portal.paddle.com"
          : "customer-portal.paddle.com") &&
      url.pathname.startsWith("/cpl_")
    );
  } catch {
    return false;
  }
}

export function getMarketingSiteUrl() {
  const configuredUrl = import.meta.env.VITE_MARKETING_SITE_URL?.trim();
  if (configuredUrl) return configuredUrl;

  return "/";
}

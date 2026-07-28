export type ProductMarketingEventName =
  | "product_page_viewed"
  | "product_chapter_viewed"
  | "product_chapter_clicked"
  | "product_media_viewed"
  | "product_trial_clicked"
  | "product_for_coaches_clicked"
  | "product_integration_viewed";

export type ProductMarketingEventProperties = {
  chapterId?: string;
  mediaId?: string;
  integrationId?: string;
  integrationPublicStatus?: string;
  ctaLocation?: "sidebar" | "final";
  ctaDestination?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
};

const analyticsConsentKey = "repsync_analytics_consent";

function getUtmProperties(): ProductMarketingEventProperties {
  if (typeof window === "undefined") return {};
  const params = new URLSearchParams(window.location.search);
  return {
    utmSource: params.get("utm_source") ?? undefined,
    utmMedium: params.get("utm_medium") ?? undefined,
    utmCampaign: params.get("utm_campaign") ?? undefined,
  };
}

export function trackProductMarketingEvent(
  name: ProductMarketingEventName,
  properties: ProductMarketingEventProperties = {},
) {
  if (typeof window === "undefined") return;

  try {
    if (window.localStorage.getItem(analyticsConsentKey) !== "accepted") return;
    window.dispatchEvent(
      new CustomEvent("repsync:marketing-event", {
        detail: {
          name,
          properties: { ...getUtmProperties(), ...properties },
        },
      }),
    );
  } catch {
    // Analytics is optional and must never block product navigation.
  }
}

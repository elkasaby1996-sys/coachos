import { useEffect } from "react";
import { useLocation } from "react-router-dom";

type PublicSeoConfig = {
  title: string;
  description: string;
  openGraphTitle?: string;
  openGraphDescription?: string;
  robots?: string;
  canonicalPath?: string;
  imagePath?: string;
  structuredData?: Record<string, unknown>;
};

function ensureMeta(
  selector: string,
  attribute: "name" | "property",
  value: string,
) {
  let tag = document.head.querySelector<HTMLMetaElement>(selector);
  if (!tag) {
    tag = document.createElement("meta");
    tag.setAttribute(attribute, value);
    document.head.appendChild(tag);
  }
  return tag;
}

export function usePublicSeo({
  title,
  description,
  openGraphTitle = title,
  openGraphDescription = description,
  robots = "index,follow",
  canonicalPath,
  imagePath = "/og-repsync.png",
  structuredData,
}: PublicSeoConfig) {
  const location = useLocation();

  useEffect(() => {
    const origin = window.location.origin;
    const path = canonicalPath ?? location.pathname;
    const canonicalUrl = new URL(path, origin).toString();
    const imageUrl = new URL(imagePath, origin).toString();
    const defaultStructuredData = {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: "RepSync",
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      url: origin,
      description,
    };

    document.documentElement.lang = "en";
    document.title = title;
    ensureMeta('meta[name="description"]', "name", "description").content =
      description;
    ensureMeta('meta[name="robots"]', "name", "robots").content = robots;
    ensureMeta('meta[property="og:title"]', "property", "og:title").content =
      openGraphTitle;
    ensureMeta(
      'meta[property="og:description"]',
      "property",
      "og:description",
    ).content = openGraphDescription;
    ensureMeta('meta[property="og:type"]', "property", "og:type").content =
      "website";
    ensureMeta('meta[property="og:url"]', "property", "og:url").content =
      canonicalUrl;
    ensureMeta('meta[property="og:image"]', "property", "og:image").content =
      imageUrl;
    ensureMeta('meta[name="twitter:card"]', "name", "twitter:card").content =
      "summary_large_image";
    ensureMeta('meta[name="twitter:title"]', "name", "twitter:title").content =
      title;
    ensureMeta(
      'meta[name="twitter:description"]',
      "name",
      "twitter:description",
    ).content = description;
    ensureMeta('meta[name="twitter:image"]', "name", "twitter:image").content =
      imageUrl;

    let canonical = document.head.querySelector<HTMLLinkElement>(
      'link[rel="canonical"]',
    );
    if (!canonical) {
      canonical = document.createElement("link");
      canonical.rel = "canonical";
      document.head.appendChild(canonical);
    }
    canonical.href = canonicalUrl;

    let script = document.head.querySelector<HTMLScriptElement>(
      "#repsync-public-structured-data",
    );
    if (!script) {
      script = document.createElement("script");
      script.id = "repsync-public-structured-data";
      script.type = "application/ld+json";
      document.head.appendChild(script);
    }
    script.text = JSON.stringify(structuredData ?? defaultStructuredData);
  }, [
    canonicalPath,
    description,
    imagePath,
    location.pathname,
    openGraphDescription,
    openGraphTitle,
    robots,
    structuredData,
    title,
  ]);
}

import { renderToStaticMarkup } from "react-dom/server";
import type { Plugin } from "vite";
import { LegalPolicyContent } from "../src/content/legal/policy-content";
import {
  getLegalRobots,
  legalPolicyLinks,
  legalPolicyMetadata,
  legalSiteConfig,
  type LegalPolicy,
} from "../src/lib/legal-site";

const escape = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ]!,
  );

export function renderLegalHtml(
  template: string,
  policy: LegalPolicy,
  operator = legalSiteConfig.legalEntityName,
) {
  const metadata = legalPolicyMetadata[policy];
  const canonical = `https://www.repsync.com${metadata.canonicalPath}`;
  const robots = getLegalRobots(operator);
  const content = renderToStaticMarkup(
    <div className="rs-stitch-site">
      <main id="main">
        <LegalPolicyContent policy={policy} operator={operator} />
      </main>
      <footer className="rs-legal-static-footer" aria-label="Public footer">
        <a href="/">RepSync</a>
        {legalPolicyLinks.map(({ href, label }) => (
          <a key={href} href={href}>
            {label}
          </a>
        ))}
      </footer>
    </div>,
  );
  if (!template.includes('<div id="root"></div>'))
    throw new Error("Legal HTML root is missing.");
  return template
    .replace(
      /<title>[\s\S]*?<\/title>/,
      `<title>${escape(metadata.title)}</title>`,
    )
    .replace(
      /<meta\s+(?:name|property)="(?:description|robots|googlebot|og:title|og:description|og:url|twitter:title|twitter:description)"[^>]*>/g,
      "",
    )
    .replace(/<link\s+rel="canonical"[^>]*>/g, "")
    .replace(
      "</head>",
      [
        `<meta name="description" content="${escape(metadata.description)}">`,
        `<meta name="robots" content="${robots}">`,
        `<meta name="googlebot" content="${robots}">`,
        `<meta property="og:title" content="${escape(metadata.title)}">`,
        `<meta property="og:description" content="${escape(metadata.description)}">`,
        `<meta property="og:url" content="${canonical}">`,
        `<meta name="twitter:title" content="${escape(metadata.title)}">`,
        `<meta name="twitter:description" content="${escape(metadata.description)}">`,
        `<link rel="canonical" href="${canonical}">`,
        "</head>",
      ].join("\n"),
    )
    .replace('<div id="root"></div>', `<div id="root">${content}</div>`);
}

// Netlify serves these files before the SPA fallback. The same React copy is
// readable in a plain unauthenticated HTTP response, even without JavaScript.
export function legalPagesBuild(): Plugin {
  return {
    name: "repsync-public-legal-html",
    enforce: "post",
    generateBundle(_options, bundle) {
      const entry = bundle["index.html"];
      if (!entry || entry.type !== "asset" || typeof entry.source !== "string")
        throw new Error("Legal page template is missing.");
      const styles = Object.values(bundle)
        .filter(
          (asset) =>
            asset.type === "asset" &&
            asset.fileName.endsWith(".css") &&
            !entry.source.toString().includes(asset.fileName),
        )
        .map((asset) => `<link rel="stylesheet" href="/${asset.fileName}">`)
        .join("\n");
      const template = entry.source.replace("</head>", `${styles}\n</head>`);
      for (const policy of Object.keys(legalPolicyMetadata) as LegalPolicy[]) {
        this.emitFile({
          type: "asset",
          fileName: `${policy}/index.html`,
          source: renderLegalHtml(template, policy),
        });
      }
    },
  };
}

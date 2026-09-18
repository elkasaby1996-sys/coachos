// @vitest-environment jsdom
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { LegalPolicyContent } from "../../src/content/legal/policy-content";
import {
  getApprovedSupportPhone,
  getLegalReleaseReadiness,
  getLegalRobots,
  isSupportPhoneValid,
  isLegalOperatorComplete,
  legalPolicyMetadata,
  legalSiteConfig,
  type LegalPolicy,
} from "../../src/lib/legal-site";
import { BuyerSupportContact } from "../../src/components/common/buyer-support-contact";
import { renderLegalHtml } from "../../scripts/legal-pages-build";

const template = readFileSync("index.html", "utf8");
const parse = (html: string) =>
  new DOMParser().parseFromString(html, "text/html");

describe("approved public legal policies", () => {
  it("includes the exact Paddle reseller wording without transferring software responsibility", () => {
    const document = parse(renderLegalHtml(template, "terms"));
    expect(
      document.querySelector("[data-paddle-reseller]")?.textContent,
    ).toContain(
      "Our order process is conducted by our online reseller Paddle.com. Paddle.com is the Merchant of Record for all our orders. Paddle provides all customer service inquiries and handles returns",
    );
    expect(document.body.textContent).toContain(
      "These RepSync Terms continue to govern your access to and use of the RepSync software.",
    );
    expect(document.body.textContent).toContain(
      "RepSync itself does not provide personal training",
    );
  });

  it.each([
    "",
    "TODO",
    "PHONE",
    "+000",
    "[PHONE]",
    "example number",
    "+1234567890",
    "+15555555555",
    "+12025550123",
    "+447700900123",
    "+442079460123",
    "+974 4400 1234",
    "tel:+97444001234",
  ])(
    "rejects a missing, placeholder, example, or malformed phone %# even if marked approved",
    (supportPhone) => {
      const config = {
        ...legalSiteConfig,
        supportPhone,
        supportPhoneApproved: true,
      };
      expect(isSupportPhoneValid(supportPhone)).toBe(false);
      expect(getApprovedSupportPhone(config)).toBeNull();
      expect(getLegalReleaseReadiness(config)).toEqual({
        ready: false,
        blockers: ["APPROVED_SUPPORT_PHONE_REQUIRED"],
      });
      const document = parse(
        renderToStaticMarkup(createElement(BuyerSupportContact, { config })),
      );
      expect(document.querySelector('a[href^="tel:"]')).toBeNull();
      expect(document.body.textContent).toBe("Email: support@repsync.com");
    },
  );

  it("requires human approval, then shares the phone across Terms, Refunds and buyer support", () => {
    // Synthetic syntax fixture only; never the configured public business number.
    const supportPhone = "+97444001234";
    const config = {
      ...legalSiteConfig,
      supportPhone,
      supportPhoneApproved: false,
    };
    expect(isSupportPhoneValid(supportPhone)).toBe(true);
    expect(getApprovedSupportPhone(config)).toBeNull();
    expect(getLegalReleaseReadiness(config).ready).toBe(false);
    config.supportPhoneApproved = true;
    expect(getLegalReleaseReadiness(config)).toEqual({
      ready: true,
      blockers: [],
    });
    expect(
      getLegalReleaseReadiness({ ...config, legalEntityName: "TODO" }).blockers,
    ).toEqual(["LEGAL_OPERATOR_REQUIRED"]);
    const before = { ...legalSiteConfig };
    try {
      Object.assign(legalSiteConfig, config);
      for (const html of [
        renderLegalHtml(template, "terms"),
        renderLegalHtml(template, "refunds"),
        renderToStaticMarkup(createElement(BuyerSupportContact)),
      ]) {
        const document = parse(html);
        expect(
          document.querySelector('a[href^="tel:"]')?.getAttribute("href"),
        ).toBe(`tel:${supportPhone}`);
        expect(
          document.querySelector('a[href="mailto:support@repsync.com"]'),
        ).not.toBeNull();
      }
    } finally {
      Object.assign(legalSiteConfig, before);
    }
  });

  // Digests of every supplied paragraph, heading and list item, in order, with
  // only Markdown formatting removed and the confirmed operator substituted.
  it.each([
    [
      "terms",
      25,
      179,
      "249143103f92d1ef5d0f7ba36a53ceaed5d8773487cb31981db3d774b663e32c",
    ],
    [
      "privacy",
      18,
      222,
      "8ee7742e12a6fd087eb38f0465ab88609580c8c3081b7d9d2edada8b8831b5b6",
    ],
    [
      "refunds",
      14,
      87,
      "6c56266472f603331b092dca2440b7ee3500b25b5fcc18909c611e6dedd4834e",
    ],
  ] as const)(
    "preserves the complete supplied %s copy",
    (policy, sections, blocks, digest) => {
      const document = parse(
        renderToStaticMarkup(createElement(LegalPolicyContent, { policy })),
      );
      expect(document.querySelectorAll("h2")).toHaveLength(sections);
      // The separately tested, explicitly requested Paddle addendum is the only
      // addition to the original approved paragraphs protected by this digest.
      document.querySelector("[data-paddle-reseller]")?.remove();
      document
        .querySelectorAll("[data-buyer-support-phone]")
        .forEach((element) => element.remove());
      const elements = [
        ...document.querySelectorAll(".rs-legal-copy :is(h2, h3, p, li)"),
      ];
      expect(elements).toHaveLength(blocks);
      const normalized = elements
        .map((element) => {
          element.querySelectorAll("br").forEach((br) => br.replaceWith(" "));
          return element.textContent!.replace(/\s+/g, " ").trim();
        })
        .join("\n");
      expect(createHash("sha256").update(normalized).digest("hex")).toBe(
        digest,
      );
      expect(document.body.textContent).not.toMatch(
        /\[LEGAL OPERATOR NAME\]|Interim/,
      );
      expect(document.querySelector("time")?.getAttribute("datetime")).toBe(
        "2026-09-18",
      );
    },
  );

  it.each(Object.keys(legalPolicyMetadata) as LegalPolicy[])(
    "emits %s HTML for unauthenticated, JavaScript-free review",
    (policy) => {
      const document = parse(renderLegalHtml(template, policy));
      expect(document.title).toBe(legalPolicyMetadata[policy].title);
      expect(
        document.querySelectorAll('meta[name="description"]'),
      ).toHaveLength(1);
      expect(
        document
          .querySelector('meta[name="description"]')
          ?.getAttribute("content"),
      ).not.toMatch(/interim/i);
      for (const name of ["robots", "googlebot"])
        expect(
          document
            .querySelector(`meta[name="${name}"]`)
            ?.getAttribute("content"),
        ).toBe("index,follow");
      expect(
        document.querySelector('link[rel="canonical"]')?.getAttribute("href"),
      ).toBe(`https://www.repsync.com/${policy}`);
      expect(document.querySelector("main")?.textContent).toContain(
        "Operated by: RepSync",
      );
      for (const path of ["privacy", "terms", "refunds"])
        expect(
          document.querySelector(`footer a[href="/${path}"]`),
        ).not.toBeNull();
      expect(document.querySelector("form")).toBeNull();
    },
  );

  it.each([
    "",
    "  ",
    "[LEGAL OPERATOR NAME]",
    "<operator>",
    "Legal operator name",
    "Pending",
    "TBD",
    "Placeholder",
  ])("fails closed for incomplete operator %#", (operator) => {
    expect(isLegalOperatorComplete(operator)).toBe(false);
    expect(getLegalRobots(operator)).toBe("noindex,nofollow");
    for (const policy of Object.keys(legalPolicyMetadata) as LegalPolicy[]) {
      const document = parse(renderLegalHtml(template, policy, operator));
      for (const name of ["robots", "googlebot"])
        expect(
          document
            .querySelector(`meta[name="${name}"]`)
            ?.getAttribute("content"),
        ).toBe("noindex,nofollow");
      expect(document.querySelector(".rs-legal-copy")).toBeNull();
      expect(document.body.textContent).not.toContain("[LEGAL OPERATOR NAME]");
    }
  });

  it("uses the operator explicitly confirmed by the owner and escapes text", () => {
    expect(legalSiteConfig.legalEntityName).toBe("RepSync");
    expect(getLegalRobots()).toBe("index,follow");
    const html = renderLegalHtml(template, "terms", "Example & Partners");
    expect(html).toContain("Example &amp; Partners");
    expect(html).toContain("RepSync itself does not provide personal training");
  });

  it("keeps route registration public and shell indexing aligned", () => {
    const routes = readFileSync("src/routes/app.tsx", "utf8");
    for (const [path, component] of [
      ["privacy", "PrivacyPage"],
      ["terms", "TermsPage"],
      ["refunds", "RefundsPage"],
    ])
      expect(routes).toContain(
        `<Route path="/${path}" element={<${component} />} />`,
      );
    expect(routes).toContain("getLegalRobots()");
    expect(readFileSync("public/robots.txt", "utf8")).toContain("Allow: /");
    expect(readFileSync("netlify.toml", "utf8")).not.toContain("force = true");
  });
});

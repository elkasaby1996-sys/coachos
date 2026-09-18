export type LegalSiteConfig = {
  businessName: string;
  legalEntityName: string;
  jurisdiction: string;
  contactEmail: string;
  supportPhone: string;
  supportPhoneApproved: boolean;
  privacyEmail: string;
  securityEmail: string;
  effectiveDate: string;
  version: string;
};

export const legalSiteConfig: LegalSiteConfig = {
  businessName: "RepSync",
  // Complete only with the operator's confirmed legal name, never a placeholder.
  legalEntityName: "RepSync",
  jurisdiction: "State of Qatar",
  contactEmail: "support@repsync.com",
  // Set only after the operator supplies and verifies a public business number.
  supportPhone: "+97455093715",
  supportPhoneApproved: true,
  privacyEmail: "privacy@repsync.com",
  securityEmail: "security@repsync.com",
  effectiveDate: "2026-09-18",
  version: "2026-09-18",
};

export function isLegalOperatorComplete(name: string) {
  const value = name.trim();
  return (
    Boolean(value) &&
    !/[[\]<>]/.test(value) &&
    !/legal[\s_-]*operator[\s_-]*name|placeholder|pending|\btbd\b|\btodo\b/i.test(
      value,
    )
  );
}

export function getLegalRobots(name = legalSiteConfig.legalEntityName) {
  return isLegalOperatorComplete(name) ? "index,follow" : "noindex,nofollow";
}

// Require international form. Format alone cannot establish ownership: public
// rendering also requires the operator's explicit approval in the configuration.
export function isSupportPhoneValid(phone: string) {
  return (
    /^\+[1-9]\d{7,14}$/.test(phone) &&
    !/(\d)\1{5}|012345|123456|987654/.test(phone) &&
    !/^\+1\d{3}55501\d{2}$/.test(phone) &&
    !/^\+447700900\d{3}$/.test(phone) &&
    !/^\+442079460\d{3}$/.test(phone)
  );
}

export function getApprovedSupportPhone(config = legalSiteConfig) {
  return config.supportPhoneApproved && isSupportPhoneValid(config.supportPhone)
    ? config.supportPhone
    : null;
}

export function getLegalReleaseReadiness(config = legalSiteConfig) {
  const blockers: string[] = [];
  if (!isLegalOperatorComplete(config.legalEntityName))
    blockers.push("LEGAL_OPERATOR_REQUIRED");
  if (!getApprovedSupportPhone(config))
    blockers.push("APPROVED_SUPPORT_PHONE_REQUIRED");
  return { ready: blockers.length === 0, blockers };
}

export const legalReviewRequired = !isLegalOperatorComplete(
  legalSiteConfig.legalEntityName,
);
export const legalRoutes = ["/privacy", "/terms", "/refunds"] as const;
export const legalPolicyLinks = [
  { href: "/privacy", label: "Privacy Policy" },
  { href: "/terms", label: "Terms of Service" },
  { href: "/refunds", label: "Refund Policy" },
] as const;

export const legalPolicyMetadata = {
  privacy: {
    heading: "Privacy Policy",
    title: "RepSync Privacy Policy",
    description:
      "Read how RepSync handles personal information, coaching data, payments, privacy rights, and security.",
    canonicalPath: "/privacy",
  },
  terms: {
    heading: "Terms of Service",
    title: "RepSync Terms of Service",
    description:
      "Read the terms for RepSync software, including subscriptions, independent coach responsibilities, acceptable use, and service limitations.",
    canonicalPath: "/terms",
  },
  refunds: {
    heading: "Refund and Cancellation Policy",
    title: "RepSync Refund and Cancellation Policy",
    description:
      "Review RepSync software subscription cancellations, refunds, consumer rights, and Merchant of Record transactions.",
    canonicalPath: "/refunds",
  },
} as const;

export type LegalPolicy = keyof typeof legalPolicyMetadata;

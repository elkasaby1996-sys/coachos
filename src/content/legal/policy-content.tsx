import { PrivacyDocument } from "./privacy";
import { TermsDocument } from "./terms";
import { RefundsDocument } from "./refunds";
import {
  isLegalOperatorComplete,
  legalPolicyLinks,
  legalPolicyMetadata,
  legalSiteConfig,
  type LegalPolicy,
} from "../../lib/legal-site";

const documents = {
  privacy: PrivacyDocument,
  terms: TermsDocument,
  refunds: RefundsDocument,
};

// Shared by the public React routes and their initial, JavaScript-free HTML.
export function LegalPolicyContent({
  policy,
  operator = legalSiteConfig.legalEntityName,
}: {
  policy: LegalPolicy;
  operator?: string;
}) {
  const metadata = legalPolicyMetadata[policy];
  const Document = documents[policy];
  return (
    <article className="rs-legal-document" aria-labelledby="legal-title">
      <header>
        <h1 id="legal-title">{metadata.heading}</h1>
        <p className="rs-legal-effective">
          Effective date:{" "}
          <time dateTime={legalSiteConfig.effectiveDate}>
            September 18, 2026
          </time>
        </p>
        <nav aria-label="Legal policies">
          {legalPolicyLinks.map(({ href, label }) => (
            <a
              key={href}
              href={href}
              aria-current={
                href === metadata.canonicalPath ? "page" : undefined
              }
            >
              {label}
            </a>
          ))}
        </nav>
      </header>
      {isLegalOperatorComplete(operator) ? (
        <div className="rs-legal-copy">
          <Document operator={operator.trim()} />
        </div>
      ) : (
        <p>
          The operator details for this policy are being finalized. Please
          contact{" "}
          <a href={`mailto:${legalSiteConfig.contactEmail}`}>
            {legalSiteConfig.contactEmail}
          </a>{" "}
          for help.
        </p>
      )}
    </article>
  );
}

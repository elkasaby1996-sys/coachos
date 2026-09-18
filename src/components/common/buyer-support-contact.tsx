import {
  getApprovedSupportPhone,
  legalSiteConfig,
  type LegalSiteConfig,
} from "../../lib/legal-site";

export function BuyerSupportPhone({
  config = legalSiteConfig,
}: {
  config?: LegalSiteConfig;
}) {
  const phone = getApprovedSupportPhone(config);
  return phone ? (
    <p data-buyer-support-phone>
      Buyer support phone: <a href={`tel:${phone}`}>{phone}</a>
    </p>
  ) : null;
}

export function BuyerSupportContact({
  config = legalSiteConfig,
}: {
  config?: LegalSiteConfig;
}) {
  return (
    <section aria-label="Buyer support contact">
      <p>
        Email:{" "}
        <a href={`mailto:${config.contactEmail}`}>{config.contactEmail}</a>
      </p>
      <BuyerSupportPhone config={config} />
    </section>
  );
}

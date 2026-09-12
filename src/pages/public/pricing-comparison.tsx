import { PUBLIC_CATALOGUE_V2 } from "../../features/commercial-catalogue/public-catalogue-snapshot";
import {
  groupCatalogueFeatures,
  type PublicSeatAddon,
} from "../../features/commercial-catalogue/catalogue-v2";
import { formatCommercialPrice } from "../../features/commercial-catalogue/public-plan-snapshot";

const domainLabels = {
  core: "Client management",
  acquisition: "Acquisition",
  workspace: "Workspaces",
  team: "Team",
  analytics: "Analytics",
  automation: "Automation",
  integration: "Integrations",
  commercial: "Commercial",
  support: "Support",
};
export function PricingComparison() {
  const { plans } = PUBLIC_CATALOGUE_V2;
  const capacities = [
    ["Client capacity", "countedClients"],
    ["Included coach seats", "includedCoachSeats"],
    ["Maximum total coach seats", "maxCoachSeats"],
    ["Workspaces", "activeWorkspaces"],
    ["Published packages", "publishedPackages"],
  ] as const;
  return (
    <section
      id="plan-comparison"
      className="rs-pricing-comparison"
      aria-labelledby="comparison-title"
    >
      <div className="rs-pricing-section-heading">
        <h2 id="comparison-title">Compare plans</h2>
        <p>
          Included seats and maximum seats are different. A maximum does not
          grant additional seats.
        </p>
      </div>
      <p>
        On small screens, scroll the table sideways to compare all three plans.
      </p>
      <div
        className="rs-pricing-comparison__scroll"
        role="region"
        aria-label="Plan comparison table, scroll horizontally on small screens"
        tabIndex={0}
      >
        <table>
          <caption>Plan capacities and approved features</caption>
          <thead>
            <tr>
              <th scope="col">Capacity or feature</th>
              {plans.map((plan) => (
                <th scope="col" key={plan.planKey}>
                  {plan.displayName}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="colgroup" colSpan={4}>
                Capacity
              </th>
            </tr>
            {capacities.map(([label, key]) => (
              <tr key={key}>
                <th scope="row">{label}</th>
                {plans.map((plan) => (
                  <td key={plan.planKey}>
                    {plan.capacities[key] ?? "Unlimited"}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          {groupCatalogueFeatures(plans).map((group) => (
            <tbody key={group.domain}>
              <tr>
                <th scope="colgroup" colSpan={4}>
                  {domainLabels[group.domain]}
                </th>
              </tr>
              {group.features.map((feature) => (
                <tr key={feature.featureKey}>
                  <th scope="row">{feature.marketingLabel}</th>
                  {plans.map((plan) => (
                    <td key={plan.planKey}>
                      {plan.features.some(
                        (item) => item.featureKey === feature.featureKey,
                      )
                        ? "Included"
                        : "Not included"}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          ))}
        </table>
      </div>
    </section>
  );
}
export function PublicSeatAddons({
  addons = PUBLIC_CATALOGUE_V2.addons,
  period,
}: {
  addons?: readonly PublicSeatAddon[];
  period: "monthly" | "annual";
}) {
  if (!addons.length) return null;
  return (
    <section className="rs-pricing-seats" aria-label="Additional coach seats">
      {addons.map((addon) => (
        <div key={addon.addonKey}>
          <h2>{addon.displayName}</h2>
          <p>
            {formatCommercialPrice(
              period === "monthly"
                ? addon.monthlyPriceMinor
                : addon.annualPriceMinor,
            )}{" "}
            per additional coach seat per{" "}
            {period === "monthly" ? "month" : "year"}.
          </p>
          <p>
            An explicit owner purchase is required. Invitations never create an
            automatic charge. Taxes and proration are determined by the
            provider.
          </p>
          {PUBLIC_CATALOGUE_V2.plans.map((plan) => (
            <p key={plan.planKey}>
              {plan.displayName}: maximum {plan.capacities.maxCoachSeats} total
              coach seats, {plan.capacities.includedCoachSeats} included.
            </p>
          ))}
        </div>
      ))}
    </section>
  );
}

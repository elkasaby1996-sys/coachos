import { LegalPolicyContent } from "../../content/legal/policy-content";
import {
  getLegalRobots,
  legalPolicyMetadata,
  type LegalPolicy,
} from "../../lib/legal-site";
import { PublicLayout } from "./public-site-shell";
import { usePublicSeo } from "./public-seo";
import "../../styles/marketing-home.css";
import "../../styles/legal-policy.css";

export function LegalPolicyPage({ policy }: { policy: LegalPolicy }) {
  usePublicSeo({ ...legalPolicyMetadata[policy], robots: getLegalRobots() });
  return (
    <PublicLayout>
      <LegalPolicyContent policy={policy} />
    </PublicLayout>
  );
}

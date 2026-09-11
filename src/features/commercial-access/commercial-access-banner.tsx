import { Link } from "react-router-dom";
import type { AccessMode } from "./contracts";
export function CommercialAccessBanner({
  mode,
  owner,
  reason,
}: {
  mode: AccessMode;
  owner: boolean;
  reason?: string;
}) {
  if (mode === "full" && reason !== "past_due") return null;
  const copy = !owner
    ? "This workspace has limited access. Contact its owner for help."
    : reason === "owner_recovery_required"
      ? "We could not confirm your account access. Contact support; your records are preserved."
      : reason === "past_due"
        ? "A payment needs attention. Your current access is still available."
        : mode === "existing_delivery_only"
          ? "Existing client delivery remains available. Recover access to add clients or change business settings."
          : mode === "read_only"
            ? "Your account is read only. You can review records, export data, and reduce commitments."
            : "Review your account to continue coaching.";
  return (
    <aside
      role="status"
      className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm"
    >
      <p>{copy}</p>
      {owner && (
        <Link
          className="mt-2 inline-block font-medium underline"
          to={
            reason === "owner_recovery_required"
              ? "/contact"
              : "/pt-hub/settings/billing"
          }
        >
          {reason === "owner_recovery_required"
            ? "Contact support"
            : "Review Billing"}
        </Link>
      )}
    </aside>
  );
}
export function CommercialReadOnlyNotice() {
  return (
    <p role="status" className="mb-3 text-sm text-muted-foreground">
      Read-only access. Changes are unavailable; historical content remains
      available.
    </p>
  );
}

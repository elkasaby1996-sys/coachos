import { Link } from "react-router-dom";
import { Button } from "../../components/ui/button";
export function SubscriptionRecoveryScreen({
  owner = true,
  error = false,
  onRetry,
}: {
  owner?: boolean;
  error?: boolean;
  onRetry?: () => void;
}) {
  return (
    <section
      className="mx-auto max-w-xl space-y-4 py-10"
      aria-labelledby="subscription-recovery-title"
    >
      <h1 id="subscription-recovery-title" className="text-2xl font-semibold">
        {error
          ? "Access could not be checked"
          : owner
            ? "Recover your coaching access"
            : "Workspace unavailable"}
      </h1>
      <p className="text-muted-foreground">
        {error
          ? "Please retry. Your records have not changed."
          : owner
            ? "Your records are preserved. Review Billing to continue, or use your account controls below."
            : "Contact the workspace owner for help. You can switch to another available workspace."}
      </p>
      {error && <Button onClick={onRetry}>Retry access check</Button>}
      {owner && (
        <nav aria-label="Recovery actions" className="flex flex-wrap gap-4">
          <Link to="/pt-hub/settings/billing" className="font-medium underline">
            Billing and recovery
          </Link>
          <Link to="/pt-hub/settings/security" className="underline">
            Account security
          </Link>
          <Link to="/contact" className="underline">
            Privacy and export
          </Link>
          <Link to="/pt-hub/settings/billing" className="underline">
            Manage commitments
          </Link>
        </nav>
      )}
    </section>
  );
}

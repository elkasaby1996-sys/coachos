import { Link } from "react-router-dom";
import { useClientCoachingAccess } from "./use-commercial-access";
export function ClientCoachingNotice({
  clientId,
}: {
  clientId: string | null;
}) {
  const query = useClientCoachingAccess(clientId);
  if (!clientId || query.isPending || query.data?.serviceMode === "interactive")
    return null;
  return (
    <aside
      role="status"
      className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm"
    >
      <p>
        {query.isError
          ? "Coaching availability could not be checked. Please retry before submitting."
          : query.data?.serviceMode === "existing_delivery"
            ? "Your existing coaching and submissions remain available."
            : "Coaching interaction is currently unavailable. You can still read historical content and use your independent account."}
      </p>
      {query.isError && (
        <button onClick={() => void query.refetch()} className="underline">
          Retry
        </button>
      )}{" "}
      <Link to="/app/find-coach" className="underline">
        Find a coach
      </Link>
    </aside>
  );
}

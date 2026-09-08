import { ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "../ui/button";

export function PageBackLink({ to, label }: { to: string; label: string }) {
  return (
    <Button asChild variant="ghost" size="icon" className="shrink-0">
      <Link to={to} aria-label={label} title={label}>
        <ArrowLeft className="h-5 w-5" aria-hidden="true" />
      </Link>
    </Button>
  );
}

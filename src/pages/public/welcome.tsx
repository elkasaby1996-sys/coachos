import { Link } from "react-router-dom";
import { Button } from "../../components/ui/button";
import { AuthBackdrop } from "../../components/common/auth-backdrop";

export function WelcomePage() {
  return (
    <AuthBackdrop contentClassName="max-w-xl">
      <div className="auth-shell-card max-w-xl">
        <div className="space-y-2 text-center">
          <h1 className="auth-shell-title">Welcome to Repsync</h1>
          <p className="auth-shell-subtitle">
            Choose how you want to continue.
          </p>
        </div>

        <div className="mt-6 space-y-3">
          <Button asChild className="h-11 w-full">
            <Link to="/login">Sign in</Link>
          </Button>
          <Button asChild variant="secondary" className="h-11 w-full">
            <Link to="/signup">Sign up</Link>
          </Button>
          <p className="pt-1 text-center text-xs text-muted-foreground">
            Clients joining a coach should use their invite link.
          </p>
        </div>
      </div>
    </AuthBackdrop>
  );
}

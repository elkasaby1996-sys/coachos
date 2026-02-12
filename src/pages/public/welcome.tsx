import { Link } from "react-router-dom";
import { Button } from "../../components/ui/button";
import { AuthBackdrop } from "../../components/common/auth-backdrop";

export function WelcomePage() {
  return (
    <AuthBackdrop contentClassName="max-w-xl">
      <div className="relative z-10 w-full max-w-xl rounded-2xl border border-border/70 bg-card/85 p-6 shadow-[0_30px_60px_-40px_oklch(var(--primary)/0.5)] backdrop-blur-xl">
        <div className="space-y-2 text-center">
          <h1 className="font-serif text-3xl tracking-tight text-foreground sm:text-4xl">Welcome to CoachOS</h1>
          <p className="text-sm text-muted-foreground">Choose how you want to continue.</p>
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

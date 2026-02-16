import { FormEvent, useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Button } from "../../components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../../components/ui/dialog";
import { Input } from "../../components/ui/input";
import { useAuth } from "../../lib/auth";
import { AuthBackdrop } from "../../components/common/auth-backdrop";

export function NoWorkspacePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { loading, session } = useAuth();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [inviteCode, setInviteCode] = useState("");
  const [inviteError, setInviteError] = useState<string | null>(null);

  useEffect(() => {
    if (loading) return;
    if (!session) {
      if (location.pathname !== "/login") {
        navigate("/login", { replace: true });
      }
    }
  }, [loading, location.pathname, navigate, session]);

  if (loading) {
    return (
      <AuthBackdrop contentClassName="max-w-md">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Loading</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Checking workspace membership...
          </CardContent>
        </Card>
      </AuthBackdrop>
    );
  }

  if (!session) return null;

  const handleInviteSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedCode = inviteCode.trim();
    if (!trimmedCode) {
      setInviteError("Please enter an invite code.");
      return;
    }
    setInviteError(null);
    setIsDialogOpen(false);
    setInviteCode("");
    navigate(`/invite/${trimmedCode}`);
  };

  return (
    <AuthBackdrop contentClassName="max-w-md">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>No workspace found</CardTitle>
          <p className="text-sm text-muted-foreground">
            We couldn't match your account to a workspace. Please ask your coach
            for an invite.
          </p>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Button asChild variant="secondary">
            <Link to="/login">Back to login</Link>
          </Button>
          <Dialog
            open={isDialogOpen}
            onOpenChange={(open) => {
              setIsDialogOpen(open);
              if (open) {
                setInviteError(null);
              }
            }}
          >
            <DialogTrigger asChild>
              <Button>Use an invite code</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Enter invite code</DialogTitle>
                <DialogDescription>
                  Paste the invite code your coach provided to continue.
                </DialogDescription>
              </DialogHeader>
              <form className="space-y-4" onSubmit={handleInviteSubmit}>
                <Input
                  autoFocus
                  placeholder="Invite code"
                  value={inviteCode}
                  onChange={(event) => setInviteCode(event.target.value)}
                />
                {inviteError ? (
                  <div className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
                    {inviteError}
                  </div>
                ) : null}
                <DialogFooter className="gap-2 sm:gap-0">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => setIsDialogOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button type="submit">Continue</Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </CardContent>
      </Card>
    </AuthBackdrop>
  );
}

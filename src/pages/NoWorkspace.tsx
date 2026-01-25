import { useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { useAuth } from "../providers/AuthProvider";

export function NoWorkspacePage() {
  const { roleError } = useAuth();
  const [isSigningOut, setIsSigningOut] = useState(false);

  const handleSignOut = async () => {
    setIsSigningOut(true);
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error("signOut error", error);
    }
    setIsSigningOut(false);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>No workspace yet</CardTitle>
          <p className="text-sm text-muted-foreground">
            You're logged in, but not assigned to a workspace yet.
          </p>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {roleError ? (
            <div className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
              {roleError}
            </div>
          ) : null}
          <Button variant="secondary" disabled>
            Create PT Workspace (run SQL for now)
          </Button>
          <Button asChild>
            <Link to="/join/sample">Join with Invite Code</Link>
          </Button>
          <Button variant="ghost" onClick={handleSignOut} disabled={isSigningOut}>
            {isSigningOut ? "Signing out..." : "Logout"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

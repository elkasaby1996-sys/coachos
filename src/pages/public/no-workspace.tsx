import { Link } from "react-router-dom";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";

export function NoWorkspacePage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>No workspace found</CardTitle>
          <p className="text-sm text-muted-foreground">
            We couldn't match your account to a workspace. Please ask your coach for an invite.
          </p>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Button asChild variant="secondary">
            <Link to="/login">Back to login</Link>
          </Button>
          <Button asChild>
            <Link to="/join/sample">Use an invite code</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

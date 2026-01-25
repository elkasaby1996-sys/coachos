import { Link } from "react-router-dom";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Input } from "../../components/ui/input";

export function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Welcome to CoachOS</CardTitle>
          <p className="text-sm text-muted-foreground">
            Sign in to manage your athletes or access your client portal.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Email</label>
            <Input placeholder="you@coachos.com" type="email" />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Password</label>
            <Input placeholder="••••••••" type="password" />
          </div>
          <Button className="w-full">Sign in</Button>
          <div className="text-center text-sm text-muted-foreground">
            Joining a workspace?{" "}
            <Link className="text-foreground underline" to="/join/sample">
              Use your invite code
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

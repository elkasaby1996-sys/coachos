import { useParams } from "react-router-dom";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { Badge } from "../../components/ui/badge";

export function JoinPage() {
  const { code } = useParams();
  const isExpired = code === "expired";

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle>Join your coach</CardTitle>
          <p className="text-sm text-muted-foreground">
            Enter your details to accept the invite and access your plan.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between rounded-lg border border-border bg-muted px-3 py-2 text-sm">
            <span>Invite code</span>
            <Badge variant={isExpired ? "danger" : "success"}>{code ?? ""}</Badge>
          </div>
          {isExpired ? (
            <div className="rounded-lg border border-danger/30 bg-danger/10 p-3 text-sm text-danger">
              This invite has expired or has already been used. Please request a new link.
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <label className="text-sm font-medium">Email</label>
                <Input placeholder="athlete@email.com" type="email" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Password</label>
                <Input placeholder="••••••••" type="password" />
              </div>
              <Button className="w-full">Accept invite</Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

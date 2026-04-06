import { AuthBackdrop } from "./auth-backdrop";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";

export function AuthPageLoader({
  title = "Loading",
  message = "Checking your account...",
}: {
  title?: string;
  message?: string;
}) {
  return (
    <AuthBackdrop contentClassName="max-w-md">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{title}</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          {message}
        </CardContent>
      </Card>
    </AuthBackdrop>
  );
}

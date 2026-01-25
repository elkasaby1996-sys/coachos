import { ThemeToggle } from "../../components/common/theme-toggle";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Button } from "../../components/ui/button";

export function ClientProfilePage() {
  return (
    <div className="space-y-6 pb-16 md:pb-0">
      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
          <p className="text-sm text-muted-foreground">Manage your preferences and theme.</p>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium">Theme</p>
            <p className="text-xs text-muted-foreground">Switch between light and dark.</p>
          </div>
          <ThemeToggle />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">Sign out or update your details.</p>
          <Button variant="secondary">Sign out</Button>
        </CardContent>
      </Card>
    </div>
  );
}

import { Link } from "react-router-dom";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Input } from "../../components/ui/input";

export function PtSettingsPage() {
  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Settings</h2>
        <p className="text-sm text-muted-foreground">Manage workspace branding and account access.</p>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle>Workspace branding</CardTitle>
            <p className="text-sm text-muted-foreground">
              Customize the workspace name and logo shown to clients.
            </p>
          </div>
          <Button variant="secondary" size="sm">
            Upload logo
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input defaultValue="Velocity PT Lab" />
          <div className="rounded-lg border border-dashed border-border bg-muted/40 p-6 text-center text-xs text-muted-foreground">
            Logo placeholder
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
          <p className="text-sm text-muted-foreground">Signed in as coach@velocitylab.com</p>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium">Email</p>
            <p className="text-xs text-muted-foreground">coach@velocitylab.com</p>
          </div>
          <Button variant="secondary" size="sm">
            Change password
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Subscription</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Subscription management will be available in a future update.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle>Baseline templates</CardTitle>
            <p className="text-sm text-muted-foreground">
              Manage performance marker templates shown in the baseline wizard.
            </p>
          </div>
          <Button asChild size="sm">
            <Link to="/pt/settings/baseline">Manage templates</Link>
          </Button>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle>Exercise library</CardTitle>
            <p className="text-sm text-muted-foreground">
              Create and manage exercises used in workout templates.
            </p>
          </div>
          <Button asChild size="sm">
            <Link to="/pt/settings/exercises">Manage exercises</Link>
          </Button>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Danger zone</CardTitle>
          <p className="text-sm text-muted-foreground">Log out of this workspace.</p>
        </CardHeader>
        <CardContent>
          <Button variant="secondary">Logout</Button>
        </CardContent>
      </Card>
    </div>
  );
}

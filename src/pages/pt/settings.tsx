import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";

export function PtSettingsPage() {
  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold tracking-tight">Settings</h2>
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
    </div>
  );
}

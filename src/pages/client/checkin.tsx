import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Input } from "../../components/ui/input";

export function ClientCheckinPage() {
  return (
    <div className="space-y-6 pb-16 md:pb-0">
      <Card>
        <CardHeader>
          <CardTitle>Weekly check-in</CardTitle>
          <p className="text-sm text-muted-foreground">Week ending Saturday</p>
        </CardHeader>
        <CardContent className="grid gap-4">
          <Input placeholder="Sleep quality (1-10)" />
          <Input placeholder="Steps" />
          <Input placeholder="Adherence %" />
          <Input placeholder="Stress (1-10)" />
          <Input placeholder="Energy (1-10)" />
          <Input placeholder="Notes" />
          <Button>Submit check-in</Button>
        </CardContent>
      </Card>
    </div>
  );
}

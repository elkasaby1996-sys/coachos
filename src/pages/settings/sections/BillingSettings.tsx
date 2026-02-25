import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../../../components/ui/tooltip";
import { SettingsBlock, SettingsPageShell, SettingsRow } from "./shared";

export function BillingSettings() {
  return (
    <SettingsPageShell
      title="Billing"
      description="Review your current plan and billing controls."
    >
      <SettingsBlock
        title="Plan"
        description="Billing portal integration can be connected to Stripe when enabled."
        noBorder
      >
        <SettingsRow
          label="Current plan"
          hint="You can continue using all current workspace capabilities."
        >
          <div className="flex items-center gap-2">
            <Badge variant="secondary">Pro</Badge>
            <span className="text-sm text-muted-foreground">Monthly</span>
          </div>
        </SettingsRow>

        <SettingsRow
          label="Billing management"
          hint="Portal link will open a secure subscription management page."
        >
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <Button type="button" variant="secondary" disabled>
                    Manage billing
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent>Coming soon</TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm text-muted-foreground">
            Billing is coming soon. Your current plan remains active without interruption.
          </div>
        </SettingsRow>
      </SettingsBlock>
    </SettingsPageShell>
  );
}

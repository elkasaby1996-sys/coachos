import { useEffect, useState } from "react";
import { AlertTriangle, BellRing, Save, ShieldCheck } from "lucide-react";
import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { Switch } from "../../../components/ui/switch";
import type { PTAccountSettingsDraft } from "../types";
import { PtHubSectionCard } from "./pt-hub-section-card";

function PreferenceRow({
  label,
  hint,
  checked,
  onCheckedChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-[22px] border border-border/60 bg-background/35 px-4 py-4">
      <div className="space-y-1">
        <p className="text-sm font-medium text-foreground">{label}</p>
        <p className="text-xs leading-5 text-muted-foreground">{hint}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}

export function PtHubSettingsPanel({
  email,
  userId,
  initialSettings,
  saving,
  onSave,
}: {
  email: string;
  userId: string;
  initialSettings: PTAccountSettingsDraft;
  saving: boolean;
  onSave: (settings: PTAccountSettingsDraft) => Promise<void>;
}) {
  const [form, setForm] = useState<PTAccountSettingsDraft>(initialSettings);

  useEffect(() => {
    setForm(initialSettings);
  }, [initialSettings]);

  const hasChanges = JSON.stringify(form) !== JSON.stringify(initialSettings);

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_360px]">
      <div className="space-y-6">
        <PtHubSectionCard
          title="Coach account"
          description="Identity and base operating settings for the business-side PT Hub."
        >
          <div className="app-form-grid">
            <Field label="Account email" className="app-form-col-6">
              <Input value={email} readOnly disabled />
            </Field>
            <Field label="Trainer ID" className="app-form-col-6">
              <Input value={userId} readOnly disabled />
            </Field>
            <Field label="Default timezone" className="app-form-col-6">
              <Input
                value={form.timezone}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, timezone: event.target.value }))
                }
              />
            </Field>
            <Field label="City or region" className="app-form-col-6">
              <Input
                value={form.city}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, city: event.target.value }))
                }
                placeholder="City or region"
              />
            </Field>
          </div>
        </PtHubSectionCard>

        <PtHubSectionCard
          title="Brand contacts"
          description="Public-facing and billing-ready contact details for your coaching brand."
        >
          <div className="app-form-grid">
            <Field label="Contact email" className="app-form-col-6">
              <Input
                value={form.contactEmail}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    contactEmail: event.target.value,
                  }))
                }
                placeholder="coach@yourbrand.com"
              />
            </Field>
            <Field label="Support email" className="app-form-col-6">
              <Input
                value={form.supportEmail}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    supportEmail: event.target.value,
                  }))
                }
                placeholder="support@yourbrand.com"
              />
            </Field>
            <Field label="Phone" className="app-form-col-12">
              <Input
                value={form.phone}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, phone: event.target.value }))
                }
                placeholder="+966 ..."
              />
            </Field>
          </div>
        </PtHubSectionCard>

        <PtHubSectionCard
          title="Signal preferences"
          description="Keep PT Hub communication focused on the business signals that matter."
        >
          <div className="space-y-4">
            <PreferenceRow
              label="Client alerts"
              hint="Activity digests, missed check-ins, and action-needed summaries."
              checked={form.clientAlerts}
              onCheckedChange={(checked) =>
                setForm((prev) => ({ ...prev, clientAlerts: checked }))
              }
            />
            <PreferenceRow
              label="Weekly digest"
              hint="A weekly business snapshot of workspace movement and profile readiness."
              checked={form.weeklyDigest}
              onCheckedChange={(checked) =>
                setForm((prev) => ({ ...prev, weeklyDigest: checked }))
              }
            />
            <PreferenceRow
              label="Product updates"
              hint="Non-critical Repsync updates and release notes."
              checked={form.productUpdates}
              onCheckedChange={(checked) =>
                setForm((prev) => ({ ...prev, productUpdates: checked }))
              }
            />
          </div>
        </PtHubSectionCard>
      </div>

      <div className="space-y-6">
        <PtHubSectionCard
          title="Profile visibility"
          description="Control how exposed your coach brand is while launch infrastructure evolves."
        >
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {(["draft", "private", "listed"] as const).map((value) => (
                <Button
                  key={value}
                  type="button"
                  variant={
                    form.profileVisibility === value ? "default" : "secondary"
                  }
                  onClick={() =>
                    setForm((prev) => ({ ...prev, profileVisibility: value }))
                  }
                >
                  {value === "draft"
                    ? "Draft"
                    : value === "private"
                      ? "Private"
                      : "Ready to list"}
                </Button>
              ))}
            </div>
            <p className="text-sm leading-6 text-muted-foreground">
              Set the profile to Ready to list when the brand, offer, and proof
              are aligned enough for public traffic.
            </p>
          </div>
        </PtHubSectionCard>

        <PtHubSectionCard
          title="Security"
          description="Authentication controls still live in the existing account flow."
        >
          <div className="rounded-[22px] border border-warning/30 bg-warning/10 p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 text-warning" />
              <div className="space-y-1">
                <p className="text-sm font-medium text-foreground">
                  Password and deeper authentication controls are external
                </p>
                <p className="text-sm leading-6 text-muted-foreground">
                  Password reset and advanced authentication settings still
                  route through the main Repsync account settings flow.
                </p>
              </div>
            </div>
          </div>
        </PtHubSectionCard>

        <PtHubSectionCard
          title="Platform subscription"
          description="Billing stays explicit here without inventing live infrastructure where it does not exist."
        >
          <div className="rounded-[22px] border border-border/60 bg-background/35 p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-foreground">
                  {form.subscriptionPlan}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {form.subscriptionStatus}
                </p>
              </div>
              <Badge variant="muted">Billing placeholder</Badge>
            </div>
          </div>
        </PtHubSectionCard>

        <PtHubSectionCard
          title="Save changes"
          description="Lock in PT Hub operating preferences before returning to delivery work."
        >
          <div className="space-y-4">
            <div className="rounded-[22px] border border-border/60 bg-background/35 p-4">
              <div className="flex items-start gap-3">
                {form.weeklyDigest ? (
                  <BellRing className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                ) : (
                  <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                )}
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {hasChanges
                      ? "Unsaved changes"
                      : "Everything is up to date"}
                  </p>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    {hasChanges
                      ? "Review and save your PT Hub operating preferences before leaving this page."
                      : "Your PT Hub settings are aligned with the saved account state."}
                  </p>
                </div>
              </div>
            </div>

            <Button
              className="w-full"
              disabled={saving || !hasChanges}
              onClick={() => onSave(form)}
            >
              <Save className="h-4 w-4" />
              {saving ? "Saving..." : "Save settings"}
            </Button>
          </div>
        </PtHubSectionCard>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="mb-2 block text-sm font-medium text-foreground">
        {label}
      </label>
      {children}
    </div>
  );
}

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
          title="Account info"
          description="Identity and default business settings for the trainer layer."
        >
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Account email">
              <Input value={email} readOnly disabled />
            </Field>
            <Field label="Trainer ID">
              <Input value={userId} readOnly disabled />
            </Field>
            <Field label="Default timezone">
              <Input
                value={form.timezone}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, timezone: event.target.value }))
                }
              />
            </Field>
            <Field label="City or region">
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
          title="Contact info"
          description="Business-facing contact details used for future public and billing flows."
        >
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Contact email">
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
            <Field label="Support email">
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
            <Field label="Phone" className="md:col-span-2">
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
          title="Notification preferences"
          description="Keep PT Hub communication focused on the signals you actually need."
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
              hint="Non-critical CoachOS updates and release notes."
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
          description="Publishing intent and future marketplace discoverability start here."
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
              A profile must be set to Ready to list before PT Hub will allow
              publishing.
            </p>
          </div>
        </PtHubSectionCard>

        <PtHubSectionCard
          title="Security"
          description="Authentication management still lives in the existing account flow."
        >
          <div className="rounded-[22px] border border-warning/30 bg-warning/10 p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 text-warning" />
              <div className="space-y-1">
                <p className="text-sm font-medium text-foreground">
                  Password and deeper auth controls are external
                </p>
                <p className="text-sm leading-6 text-muted-foreground">
                  Password reset and advanced authentication settings still
                  route through the existing account settings experience.
                </p>
              </div>
            </div>
          </div>
        </PtHubSectionCard>

        <PtHubSectionCard
          title="Subscription"
          description="Billing stays honest here without pretending live infrastructure exists where it does not."
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
          description="Keep trainer-level business settings current before moving back into workspace operations."
        >
          <div className="space-y-4">
            <div className="rounded-[22px] border border-border/60 bg-background/35 p-4">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-border/70 bg-background/70 text-primary">
                  {form.weeklyDigest ? (
                    <BellRing className="h-4 w-4" />
                  ) : (
                    <ShieldCheck className="h-4 w-4" />
                  )}
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {hasChanges
                      ? "Unsaved changes"
                      : "Everything is up to date"}
                  </p>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    {hasChanges
                      ? "Review and save the business-layer preferences before leaving this page."
                      : "Your PT Hub settings are currently aligned with the saved account state."}
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

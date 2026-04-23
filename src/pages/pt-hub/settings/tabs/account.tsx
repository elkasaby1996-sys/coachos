import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useQueryClient } from "@tanstack/react-query";
import { FieldCharacterMeta } from "../../../../components/common/field-character-meta";
import { Button } from "../../../../components/ui/button";
import { Input } from "../../../../components/ui/input";
import { Select } from "../../../../components/ui/select";
import {
  getCharacterLimit,
  getCharacterLimitState,
  hasCharacterLimitError,
} from "../../../../lib/character-limits";
import { useSessionAuth } from "../../../../lib/auth";
import {
  savePtHubSettings,
  usePtHubSettings,
} from "../../../../features/pt-hub/lib/pt-hub";
import {
  DisabledSettingField,
  SettingsFieldRow,
  SettingsSectionCard,
} from "../../../../features/settings/components/settings-primitives";
import { useDirtyNavigationGuard } from "../../../../features/settings/hooks/use-dirty-navigation-guard";

const COUNTRY_OPTIONS = [
  "Saudi Arabia",
  "United Arab Emirates",
  "United States",
  "United Kingdom",
  "Australia",
  "Bahrain",
  "Canada",
  "Egypt",
  "France",
  "Germany",
  "India",
  "Ireland",
  "Jordan",
  "Kuwait",
  "Lebanon",
  "Netherlands",
  "New Zealand",
  "Oman",
  "Pakistan",
  "Qatar",
  "South Africa",
  "Spain",
  "Turkey",
];

const TIMEZONE_BY_COUNTRY: Record<string, string> = {
  "Saudi Arabia": "Asia/Riyadh",
  "United Arab Emirates": "Asia/Dubai",
  "United States": "America/New_York",
  "United Kingdom": "Europe/London",
  Australia: "Australia/Sydney",
  Bahrain: "Asia/Bahrain",
  Canada: "America/Toronto",
  Egypt: "Africa/Cairo",
  France: "Europe/Paris",
  Germany: "Europe/Berlin",
  India: "Asia/Kolkata",
  Ireland: "Europe/Dublin",
  Jordan: "Asia/Amman",
  Kuwait: "Asia/Kuwait",
  Lebanon: "Asia/Beirut",
  Netherlands: "Europe/Amsterdam",
  "New Zealand": "Pacific/Auckland",
  Oman: "Asia/Muscat",
  Pakistan: "Asia/Karachi",
  Qatar: "Asia/Qatar",
  "South Africa": "Africa/Johannesburg",
  Spain: "Europe/Madrid",
  Turkey: "Europe/Istanbul",
};

const DIAL_CODE_BY_COUNTRY: Record<string, string> = {
  "Saudi Arabia": "+966",
  "United Arab Emirates": "+971",
  "United States": "+1",
  "United Kingdom": "+44",
  Australia: "+61",
  Bahrain: "+973",
  Canada: "+1",
  Egypt: "+20",
  France: "+33",
  Germany: "+49",
  India: "+91",
  Ireland: "+353",
  Jordan: "+962",
  Kuwait: "+965",
  Lebanon: "+961",
  Netherlands: "+31",
  "New Zealand": "+64",
  Oman: "+968",
  Pakistan: "+92",
  Qatar: "+974",
  "South Africa": "+27",
  Spain: "+34",
  Turkey: "+90",
};

function getTimezoneForCountry(country: string) {
  if (!country) return Intl.DateTimeFormat().resolvedOptions().timeZone;
  return (
    TIMEZONE_BY_COUNTRY[country] ??
    Intl.DateTimeFormat().resolvedOptions().timeZone
  );
}

function getDialCodeForCountry(country: string) {
  return DIAL_CODE_BY_COUNTRY[country] ?? "";
}

function applyCountryDialCode(params: {
  currentPhone: string;
  previousCountry: string;
  nextCountry: string;
}) {
  const trimmedCurrentPhone = params.currentPhone.trim();
  const previousDialCode = getDialCodeForCountry(params.previousCountry);
  const nextDialCode = getDialCodeForCountry(params.nextCountry);

  if (!nextDialCode) return params.currentPhone;
  if (!trimmedCurrentPhone) return `${nextDialCode} `;

  if (previousDialCode && trimmedCurrentPhone.startsWith(previousDialCode)) {
    const remaining = trimmedCurrentPhone.slice(previousDialCode.length).trim();
    return remaining ? `${nextDialCode} ${remaining}` : `${nextDialCode} `;
  }

  if (/^\+\d{1,4}$/.test(trimmedCurrentPhone)) {
    return `${nextDialCode} `;
  }

  return params.currentPhone;
}

type AccountFormState = {
  fullName: string;
  contactEmail: string;
  phone: string;
  country: string;
  timezone: string;
  city: string;
};

const emptyState: AccountFormState = {
  fullName: "",
  contactEmail: "",
  phone: "",
  country: "",
  timezone: "",
  city: "",
};

function getInitialState(params: {
  fullName: string;
  contactEmail: string;
  phone: string;
  country: string;
  timezone: string;
  city: string;
}): AccountFormState {
  return {
    fullName: params.fullName,
    contactEmail: params.contactEmail,
    phone: params.phone,
    country: params.country,
    timezone: params.timezone,
    city: params.city,
  };
}

export function PtHubSettingsAccountTab() {
  const queryClient = useQueryClient();
  const { user } = useSessionAuth();
  const settingsQuery = usePtHubSettings();
  const [form, setForm] = useState<AccountFormState>(emptyState);
  const [navActionSlot, setNavActionSlot] = useState<HTMLElement | null>(null);
  const [saving, setSaving] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [showRequiredErrors, setShowRequiredErrors] = useState(false);

  const initialState = useMemo(() => {
    if (!settingsQuery.data) return emptyState;

    return getInitialState({
      fullName: settingsQuery.data.fullName,
      contactEmail: settingsQuery.data.contactEmail,
      phone: settingsQuery.data.phone,
      country: settingsQuery.data.country,
      timezone: settingsQuery.data.timezone,
      city: settingsQuery.data.city,
    });
  }, [settingsQuery.data]);

  useEffect(() => {
    setForm(initialState);
  }, [initialState]);

  const isDirty = JSON.stringify(form) !== JSON.stringify(initialState);
  const requiredErrors = {
    fullName: form.fullName.trim() ? null : "Full name is required.",
    contactEmail: form.contactEmail.trim()
      ? null
      : "Contact email is required.",
    country: form.country.trim() ? null : "Country is required.",
    phone: form.phone.trim() ? null : "Phone is required.",
    city: form.city.trim() ? null : "City is required.",
  } as const;
  const hasRequiredErrors = Object.values(requiredErrors).some(Boolean);
  const getFieldErrorText = (
    requiredError: string | null,
    limitError: string | null,
  ) => {
    if (showRequiredErrors && requiredError) return requiredError;
    return limitError;
  };
  const fullNameLimitState = getCharacterLimitState({
    value: form.fullName,
    kind: "full_name",
    fieldLabel: "Full name",
  });
  const contactEmailLimitState = getCharacterLimitState({
    value: form.contactEmail,
    kind: "email",
    fieldLabel: "Contact email",
  });
  const phoneLimitState = getCharacterLimitState({
    value: form.phone,
    kind: "default_text",
    fieldLabel: "Phone",
  });
  const cityLimitState = getCharacterLimitState({
    value: form.city,
    kind: "default_text",
    fieldLabel: "City",
  });
  const hasOverLimitErrors = hasCharacterLimitError([
    fullNameLimitState,
    contactEmailLimitState,
    phoneLimitState,
    cityLimitState,
  ]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    setNavActionSlot(document.getElementById("settings-nav-action-slot"));
  }, []);

  const saveAccountTab = async () => {
    if (!user?.id || !settingsQuery.data) return false;
    setShowRequiredErrors(true);
    if (hasRequiredErrors) {
      setErrorText("Please complete all required fields.");
      return false;
    }
    if (hasOverLimitErrors) return false;

    setSaving(true);
    setErrorText(null);
    try {
      await savePtHubSettings({
        userId: user.id,
        settings: {
          ...settingsQuery.data,
          fullName: form.fullName,
          contactEmail: form.contactEmail,
          phone: form.phone,
          country: form.country,
          timezone: form.timezone,
          city: form.city,
        },
      });

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["pt-hub-settings"] }),
        queryClient.invalidateQueries({ queryKey: ["pt-hub-overview"] }),
      ]);

      return true;
    } catch (error) {
      setErrorText(
        error instanceof Error
          ? error.message
          : "Unable to save account settings.",
      );
      return false;
    } finally {
      setSaving(false);
    }
  };

  const discard = () => {
    setForm(initialState);
    setErrorText(null);
    setShowRequiredErrors(false);
  };

  const { guardDialog } = useDirtyNavigationGuard({
    isDirty,
    onDiscard: discard,
    onSave: saveAccountTab,
  });

  if (!settingsQuery.data) {
    return (
      <SettingsSectionCard
        title="Account"
        description="Loading account settings..."
      >
        <p className="text-sm text-muted-foreground">
          Please wait while we load your account details.
        </p>
      </SettingsSectionCard>
    );
  }

  return (
    <div className="space-y-4">
      {navActionSlot
        ? createPortal(
            <Button
              type="button"
              onClick={() => void saveAccountTab()}
              disabled={
                !isDirty || saving || hasOverLimitErrors || hasRequiredErrors
              }
            >
              {saving ? "Saving..." : "Save changes"}
            </Button>,
            navActionSlot,
          )
        : null}

      {guardDialog}

      {errorText ? (
        <div className="rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
          {errorText}
        </div>
      ) : null}

      <SettingsSectionCard
        title="Account Identity"
        description="Global PT account identity and contact settings."
      >
        <SettingsFieldRow
          label="Account email"
          hint="Authentication identity (read-only)."
        >
          <DisabledSettingField value={user?.email ?? "No email"} />
        </SettingsFieldRow>

        <SettingsFieldRow
          label="Trainer ID"
          hint="Secondary identifier (read-only)."
        >
          <DisabledSettingField value={user?.id ?? "Unavailable"} />
        </SettingsFieldRow>

        <SettingsFieldRow
          label="Full name"
          hint="Shown in the profile pill across all your workspaces."
        >
          <Input
            isInvalid={
              fullNameLimitState.overLimit ||
              (showRequiredErrors && Boolean(requiredErrors.fullName))
            }
            value={form.fullName}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, fullName: event.target.value }))
            }
            placeholder="Your full name"
          />
          <FieldCharacterMeta
            count={fullNameLimitState.count}
            limit={fullNameLimitState.limit}
            errorText={getFieldErrorText(
              requiredErrors.fullName,
              fullNameLimitState.errorText,
            )}
          />
        </SettingsFieldRow>

        <SettingsFieldRow
          label="Contact email"
          hint="Primary PT Hub business contact."
        >
          <Input
            type="email"
            isInvalid={
              contactEmailLimitState.overLimit ||
              (showRequiredErrors && Boolean(requiredErrors.contactEmail))
            }
            value={form.contactEmail}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, contactEmail: event.target.value }))
            }
            placeholder="coach@yourbrand.com"
          />
          <FieldCharacterMeta
            count={contactEmailLimitState.count}
            limit={contactEmailLimitState.limit}
            errorText={getFieldErrorText(
              requiredErrors.contactEmail,
              contactEmailLimitState.errorText,
            )}
          />
        </SettingsFieldRow>

        <SettingsFieldRow
          label="Country & Phone"
          hint="Country updates timezone and auto-suggests a dial code. You can still edit the phone code manually."
        >
          <div className="app-form-grid">
            <div className="app-form-col-4 space-y-2">
              <Select
                isInvalid={
                  showRequiredErrors && Boolean(requiredErrors.country)
                }
                className="w-full"
                contentClassName="max-h-64 overflow-y-auto"
                value={form.country}
                onChange={(event) =>
                  setForm((prev) => {
                    const nextCountry = event.target.value;
                    return {
                      ...prev,
                      country: nextCountry,
                      timezone: getTimezoneForCountry(nextCountry),
                      phone: applyCountryDialCode({
                        currentPhone: prev.phone,
                        previousCountry: prev.country,
                        nextCountry,
                      }),
                    };
                  })
                }
              >
                <option value="">Select country</option>
                {COUNTRY_OPTIONS.map((country) => (
                  <option key={country} value={country}>
                    {country}
                  </option>
                ))}
              </Select>
              {showRequiredErrors && requiredErrors.country ? (
                <p role="alert" className="text-xs text-danger">
                  {requiredErrors.country}
                </p>
              ) : null}
            </div>

            <div className="app-form-col-8 space-y-2">
              <Input
                isInvalid={
                  phoneLimitState.overLimit ||
                  (showRequiredErrors && Boolean(requiredErrors.phone))
                }
                value={form.phone}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, phone: event.target.value }))
                }
                placeholder={`${
                  getDialCodeForCountry(form.country) || "+974"
                } 555 123 456`}
              />
              <FieldCharacterMeta
                count={phoneLimitState.count}
                limit={phoneLimitState.limit}
                errorText={getFieldErrorText(
                  requiredErrors.phone,
                  phoneLimitState.errorText,
                )}
              />
            </div>
          </div>
        </SettingsFieldRow>

        <SettingsFieldRow
          label="Timezone"
          hint="Auto-filled from your selected country."
        >
          <Input value={form.timezone} readOnly />
        </SettingsFieldRow>

        <SettingsFieldRow label="City" hint="Your city.">
          <Input
            isInvalid={
              cityLimitState.overLimit ||
              (showRequiredErrors && Boolean(requiredErrors.city))
            }
            value={form.city}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, city: event.target.value }))
            }
            placeholder="Riyadh"
          />
          <FieldCharacterMeta
            count={cityLimitState.count}
            limit={cityLimitState.limit}
            errorText={getFieldErrorText(
              requiredErrors.city,
              cityLimitState.errorText,
            )}
          />
        </SettingsFieldRow>
      </SettingsSectionCard>
    </div>
  );
}

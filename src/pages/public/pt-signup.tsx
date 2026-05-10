import { useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { Dumbbell } from "lucide-react";
import { AuthPageLoader } from "../../components/common/auth-page-loader";
import { FieldCharacterMeta } from "../../components/common/field-character-meta";
import { AuthComponent } from "../../components/ui/sign-up";
import { Input } from "../../components/ui/input";
import {
  getCharacterLimitState,
  hasCharacterLimitError,
} from "../../lib/character-limits";
import {
  ensurePtProfile,
  getUserDisplayName,
  persistSignupIntent,
  syncPtAccountIdentity,
  updatePtProfile,
} from "../../lib/account-profiles";
import {
  buildAuthCallbackUrl,
  signInWithOAuth,
  signUpWithEmailPassword,
} from "../../lib/auth-helpers";
import { supabase } from "../../lib/supabase";
import {
  getAuthenticatedRedirectPath,
  useBootstrapAuth,
  useSessionAuth,
} from "../../lib/auth";

const COUNTRY_OPTIONS = [
  { name: "Saudi Arabia", dialCode: "+966", defaultCity: "Riyadh" },
  { name: "United Arab Emirates", dialCode: "+971", defaultCity: "Dubai" },
  { name: "United States", dialCode: "+1", defaultCity: "New York" },
  { name: "United Kingdom", dialCode: "+44", defaultCity: "London" },
  { name: "Australia", dialCode: "+61", defaultCity: "Sydney" },
  { name: "Bahrain", dialCode: "+973", defaultCity: "Manama" },
  { name: "Canada", dialCode: "+1", defaultCity: "Toronto" },
  { name: "Egypt", dialCode: "+20", defaultCity: "Cairo" },
  { name: "France", dialCode: "+33", defaultCity: "Paris" },
  { name: "Germany", dialCode: "+49", defaultCity: "Berlin" },
  { name: "India", dialCode: "+91", defaultCity: "Mumbai" },
  { name: "Ireland", dialCode: "+353", defaultCity: "Dublin" },
  { name: "Jordan", dialCode: "+962", defaultCity: "Amman" },
  { name: "Kuwait", dialCode: "+965", defaultCity: "Kuwait City" },
  { name: "Lebanon", dialCode: "+961", defaultCity: "Beirut" },
  { name: "Netherlands", dialCode: "+31", defaultCity: "Amsterdam" },
  { name: "New Zealand", dialCode: "+64", defaultCity: "Auckland" },
  { name: "Oman", dialCode: "+968", defaultCity: "Muscat" },
  { name: "Pakistan", dialCode: "+92", defaultCity: "Karachi" },
  { name: "Qatar", dialCode: "+974", defaultCity: "Doha" },
  { name: "South Africa", dialCode: "+27", defaultCity: "Cape Town" },
  { name: "Spain", dialCode: "+34", defaultCity: "Madrid" },
  { name: "Turkey", dialCode: "+90", defaultCity: "Istanbul" },
];

const ptDetailFieldClassName =
  "border-border/70 bg-card/55 shadow-[inset_0_1px_0_oklch(1_0_0/0.62),0_10px_28px_-24px_oklch(var(--primary)/0.55)] backdrop-blur-xl focus-visible:ring-primary/45";

function getCountryDialCode(country: string) {
  return (
    COUNTRY_OPTIONS.find((option) => option.name === country)?.dialCode ?? ""
  );
}

function normalizePhoneWithCountry(phone: string, country: string) {
  const trimmedPhone = phone.trim();
  if (!trimmedPhone) return "";
  if (trimmedPhone.startsWith("+")) return trimmedPhone;

  const dialCode = getCountryDialCode(country);
  return dialCode ? `${dialCode} ${trimmedPhone}` : trimmedPhone;
}

async function getPtNextPath(userId: string) {
  const { data: workspaceRows, error: workspaceError } = await supabase
    .from("workspace_members")
    .select("workspace_id, role")
    .eq("user_id", userId)
    .limit(25);

  if (workspaceError) throw workspaceError;

  const hasWorkspace = (workspaceRows ?? []).some((row) =>
    row.role?.startsWith("pt"),
  );
  if (!hasWorkspace) return "/pt/onboarding/workspace";
  return "/pt-hub";
}

export function PtSignupPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const {
    accountType,
    bootstrapResolved,
    clientAccountComplete,
    clientWorkspaceOnboardingHardGateRequired,
    hasWorkspaceMembership,
    pendingInviteToken,
    ptProfileComplete,
    ptWorkspaceComplete,
  } = useBootstrapAuth();
  const { authLoading, session, user } = useSessionAuth();
  const [fullName, setFullName] = useState("");
  const [country, setCountry] = useState("");
  const [city, setCity] = useState("");
  const [phone, setPhone] = useState("");
  const [googleBusy, setGoogleBusy] = useState(false);
  const redirectParam = new URLSearchParams(location.search).get("redirect");
  const inviteRedirect =
    redirectParam?.startsWith("/team-invites/") === true ? redirectParam : null;
  const fullNameLimitState = getCharacterLimitState({
    value: fullName,
    kind: "full_name",
    fieldLabel: "Full name",
  });
  const cityLimitState = getCharacterLimitState({
    value: city,
    kind: "default_text",
    fieldLabel: "City",
  });
  const phoneLimitState = getCharacterLimitState({
    value: phone,
    kind: "default_text",
    fieldLabel: "Phone number",
  });
  const hasOverLimitErrors = hasCharacterLimitError([
    fullNameLimitState,
    cityLimitState,
    phoneLimitState,
  ]);

  if (session && !bootstrapResolved) {
    return <AuthPageLoader message="Restoring your coach account..." />;
  }

  if (!authLoading && session) {
    return (
      <Navigate
        to={
          inviteRedirect ??
          getAuthenticatedRedirectPath({
            accountType,
            hasWorkspaceMembership,
            ptWorkspaceComplete,
            ptProfileComplete,
            clientAccountComplete,
            clientWorkspaceOnboardingHardGateRequired,
            pendingInviteToken,
          })
        }
        replace
      />
    );
  }

  const persistPtSignupDraft = () => {
    persistSignupIntent("pt");
    window.localStorage.setItem("coachos_pt_signup_full_name", fullName.trim());
    window.localStorage.setItem("coachos_pt_signup_country", country.trim());
    window.localStorage.setItem("coachos_pt_signup_city", city.trim());
    window.localStorage.setItem(
      "coachos_pt_signup_phone",
      normalizePhoneWithCountry(phone, country),
    );
  };

  const handleEmailSignup = async ({
    email,
    password,
  }: {
    email: string;
    password: string;
  }) => {
    if (hasOverLimitErrors) {
      return { error: "Please reduce over-limit fields before continuing." };
    }
    if (!fullName.trim()) {
      return { error: "Full name is required." };
    }
    if (!country.trim()) {
      return { error: "Country is required." };
    }
    if (!city.trim()) {
      return { error: "City is required." };
    }
    if (!phone.trim()) {
      return { error: "Phone number is required." };
    }
    if (!/\S+@\S+\.\S+/.test(email.trim())) {
      return { error: "Enter a valid email address." };
    }
    if (password.length < 6) {
      return { error: "Password must be at least 6 characters." };
    }

    try {
      persistPtSignupDraft();
      const normalizedPhone = normalizePhoneWithCountry(phone, country);
      const redirectTo = buildAuthCallbackUrl({
        type: "signup",
        intent: "pt",
        next: inviteRedirect ?? "/pt/onboarding/workspace",
      });
      const { data, error: signUpError } = await signUpWithEmailPassword(
        email.trim(),
        password,
        redirectTo,
        {
          full_name: fullName.trim(),
          display_name: fullName.trim(),
          name: fullName.trim(),
          account_type: "pt",
        },
      );
      if (signUpError) throw signUpError;

      const activeUserId = data.session?.user?.id ?? user?.id;
      if (activeUserId) {
        await ensurePtProfile({
          userId: activeUserId,
          fullName,
        });
        await updatePtProfile(activeUserId, {
          full_name: fullName,
          phone: normalizedPhone,
          location_country: country,
          location_city: city,
          onboarding_completed_at: new Date().toISOString(),
        });
        await syncPtAccountIdentity({
          userId: activeUserId,
          fullName,
          contactEmail: email.trim(),
          supportEmail: email.trim(),
          phone: normalizedPhone,
          country,
          city,
        });
      }

      if (data.session?.user?.id) {
        navigate(
          inviteRedirect ?? (await getPtNextPath(data.session.user.id)),
          {
            replace: true,
          },
        );
        return { success: true };
      }

      return {
        notice:
          "Account created. Verify your email, then sign in to continue PT onboarding.",
      };
    } catch (nextError) {
      return {
        error:
          nextError instanceof Error
            ? nextError.message
            : "Unable to create PT account.",
      };
    }
  };

  const handleGoogle = async () => {
    if (hasOverLimitErrors) {
      return { error: "Please reduce over-limit fields before continuing." };
    }
    if (!fullName.trim()) {
      return { error: "Full name is required before continuing with Google." };
    }
    if (!country.trim() || !city.trim() || !phone.trim()) {
      return {
        error:
          "Full name, country, city, and phone are required before continuing with Google.",
      };
    }
    setGoogleBusy(true);
    try {
      persistPtSignupDraft();
      const { error: oauthError } = await signInWithOAuth(
        "google",
        buildAuthCallbackUrl({
          type: "oauth",
          intent: "pt",
          next: inviteRedirect ?? "/pt/onboarding/workspace",
        }),
      );
      if (oauthError) throw oauthError;
      return { notice: "Redirecting to Google..." };
    } catch (nextError) {
      return {
        error:
          nextError instanceof Error
            ? nextError.message
            : "Unable to continue with Google.",
      };
    } finally {
      setGoogleBusy(false);
    }
  };

  return (
    <AuthComponent
      mode="signup"
      brandName="RepSync"
      logo={
        <div className="rounded-md bg-primary p-1.5 text-primary-foreground">
          <Dumbbell className="h-4 w-4" />
        </div>
      }
      title="Create PT account"
      subtitle=""
      primaryLabel="Create PT account"
      secondaryLinkHref={
        inviteRedirect
          ? `/login?redirect=${encodeURIComponent(inviteRedirect)}`
          : "/login"
      }
      secondaryLinkLabel="Already have an account? Sign in"
      submitDisabled={hasOverLimitErrors}
      socialDisabled={googleBusy || hasOverLimitErrors}
      preFields={
        <div className="app-form-grid">
          <div className="app-form-col-12 space-y-2">
            <label htmlFor="pt-full-name" className="text-sm font-medium">
              Full name
            </label>
            <Input
              id="pt-full-name"
              className={ptDetailFieldClassName}
              isInvalid={fullNameLimitState.overLimit}
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              placeholder={getUserDisplayName(user) || "Coach name"}
            />
            <FieldCharacterMeta
              count={fullNameLimitState.count}
              limit={fullNameLimitState.limit}
              errorText={fullNameLimitState.errorText}
            />
          </div>
          <div className="app-form-col-6 space-y-2">
            <label htmlFor="pt-country" className="text-sm font-medium">
              Country
            </label>
            <select
              id="pt-country"
              value={country}
              onChange={(event) => {
                const nextCountry = event.target.value;
                const nextDialCode = getCountryDialCode(nextCountry);
                const currentDialCode = getCountryDialCode(country);
                const trimmedPhone = phone.trim();
                let nextPhone = phone;

                if (!trimmedPhone) {
                  nextPhone = nextDialCode ? `${nextDialCode} ` : "";
                } else if (
                  currentDialCode &&
                  trimmedPhone.startsWith(currentDialCode)
                ) {
                  nextPhone = `${nextDialCode}${trimmedPhone.slice(currentDialCode.length)}`;
                }

                setCountry(nextCountry);
                setCity(getCountryDefaultCity(nextCountry));
                setPhone(nextPhone);
              }}
              className={`app-field flex min-h-[2.75rem] w-full px-3.5 py-2 text-sm ${ptDetailFieldClassName}`}
            >
              <option value="">Select country</option>
              {COUNTRY_OPTIONS.map((option) => (
                <option key={option.name} value={option.name}>
                  {option.name}
                </option>
              ))}
            </select>
          </div>
          <div className="app-form-col-6 space-y-2">
            <label htmlFor="pt-city" className="text-sm font-medium">
              City
            </label>
            <Input
              id="pt-city"
              className={ptDetailFieldClassName}
              isInvalid={cityLimitState.overLimit}
              value={city}
              onChange={(event) => setCity(event.target.value)}
              placeholder={
                country ? getCountryDefaultCity(country) || "City" : "City"
              }
            />
            <FieldCharacterMeta
              count={cityLimitState.count}
              limit={cityLimitState.limit}
              errorText={cityLimitState.errorText}
            />
          </div>
          <div className="app-form-col-12 space-y-2">
            <label htmlFor="pt-phone" className="text-sm font-medium">
              Phone number
            </label>
            <Input
              id="pt-phone"
              type="tel"
              className={ptDetailFieldClassName}
              isInvalid={phoneLimitState.overLimit}
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              placeholder={
                country
                  ? `${getCountryDialCode(country)} 5X XXX XXXX`
                  : "+966 5X XXX XXXX"
              }
            />
            <FieldCharacterMeta
              count={phoneLimitState.count}
              limit={phoneLimitState.limit}
              errorText={phoneLimitState.errorText}
            />
          </div>
        </div>
      }
      onEmailPasswordSubmit={handleEmailSignup}
      onGoogle={handleGoogle}
    />
  );
}

function getCountryDefaultCity(country: string) {
  return (
    COUNTRY_OPTIONS.find((option) => option.name === country)?.defaultCity ?? ""
  );
}

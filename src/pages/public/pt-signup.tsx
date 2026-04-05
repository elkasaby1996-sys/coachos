import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { Dumbbell, Globe } from "lucide-react";
import { AuthBackdrop } from "../../components/common/auth-backdrop";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import {
  ensurePtProfile,
  getUserDisplayName,
  updatePtProfile,
} from "../../lib/account-profiles";
import { signInWithOAuth, signUpWithEmailPassword } from "../../lib/auth-helpers";
import { supabase } from "../../lib/supabase";
import { getAuthenticatedRedirectPath, useAuth } from "../../lib/auth";

const COUNTRY_OPTIONS = [
  { name: "Saudi Arabia", dialCode: "+966" },
  { name: "United Arab Emirates", dialCode: "+971" },
  { name: "United States", dialCode: "+1" },
  { name: "United Kingdom", dialCode: "+44" },
  { name: "Australia", dialCode: "+61" },
  { name: "Bahrain", dialCode: "+973" },
  { name: "Canada", dialCode: "+1" },
  { name: "Egypt", dialCode: "+20" },
  { name: "France", dialCode: "+33" },
  { name: "Germany", dialCode: "+49" },
  { name: "India", dialCode: "+91" },
  { name: "Ireland", dialCode: "+353" },
  { name: "Jordan", dialCode: "+962" },
  { name: "Kuwait", dialCode: "+965" },
  { name: "Lebanon", dialCode: "+961" },
  { name: "Netherlands", dialCode: "+31" },
  { name: "New Zealand", dialCode: "+64" },
  { name: "Oman", dialCode: "+968" },
  { name: "Pakistan", dialCode: "+92" },
  { name: "Qatar", dialCode: "+974" },
  { name: "South Africa", dialCode: "+27" },
  { name: "Spain", dialCode: "+34" },
  { name: "Turkey", dialCode: "+90" },
];

function getCountryDialCode(country: string) {
  return COUNTRY_OPTIONS.find((option) => option.name === country)?.dialCode ?? "";
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
  const {
    accountType,
    clientAccountComplete,
    clientWorkspaceOnboardingHardGateRequired,
    hasWorkspaceMembership,
    loading,
    pendingInviteToken,
    ptProfileComplete,
    ptWorkspaceComplete,
    session,
    user,
  } = useAuth();
  const [fullName, setFullName] = useState("");
  const [country, setCountry] = useState("");
  const [city, setCity] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busyAction, setBusyAction] = useState<"idle" | "email" | "google">(
    "idle",
  );
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  if (!loading && session) {
    return (
      <Navigate
        to={getAuthenticatedRedirectPath({
          accountType,
          hasWorkspaceMembership,
          ptWorkspaceComplete,
          ptProfileComplete,
          clientAccountComplete,
          clientWorkspaceOnboardingHardGateRequired,
          pendingInviteToken,
        })}
        replace
      />
    );
  }

  const persistPtSignupDraft = () => {
    window.localStorage.setItem("coachos_signup_intent", "pt");
    window.localStorage.setItem("coachos_pt_signup_full_name", fullName.trim());
    window.localStorage.setItem("coachos_pt_signup_country", country.trim());
    window.localStorage.setItem("coachos_pt_signup_city", city.trim());
    window.localStorage.setItem(
      "coachos_pt_signup_phone",
      normalizePhoneWithCountry(phone, country),
    );
  };

  const handleEmailSignup = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!fullName.trim()) {
      setError("Full name is required.");
      return;
    }
    if (!country.trim()) {
      setError("Country is required.");
      return;
    }
    if (!city.trim()) {
      setError("City is required.");
      return;
    }
    if (!phone.trim()) {
      setError("Phone number is required.");
      return;
    }
    if (!/\S+@\S+\.\S+/.test(email.trim())) {
      setError("Enter a valid email address.");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setBusyAction("email");
    setError(null);
    setNotice(null);
    try {
      persistPtSignupDraft();
      const normalizedPhone = normalizePhoneWithCountry(phone, country);
      const redirectTo = `${window.location.origin}/pt/onboarding/workspace`;
      const { data, error: signUpError } = await signUpWithEmailPassword(
        email.trim(),
        password,
        redirectTo,
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
      }

      if (data.session?.user?.id) {
        navigate(await getPtNextPath(data.session.user.id), { replace: true });
        return;
      }

      setNotice(
        "Account created. Verify your email, then sign in to continue PT onboarding.",
      );
    } catch (nextError) {
      setError(
        nextError instanceof Error ? nextError.message : "Unable to create PT account.",
      );
    } finally {
      setBusyAction("idle");
    }
  };

  const handleGoogle = async () => {
    if (!fullName.trim()) {
      setError("Full name is required before continuing with Google.");
      return;
    }
    if (!country.trim() || !city.trim() || !phone.trim()) {
      setError("Full name, country, city, and phone are required before continuing with Google.");
      return;
    }
    setBusyAction("google");
    setError(null);
    setNotice(null);
    try {
      persistPtSignupDraft();
      const { error: oauthError } = await signInWithOAuth(
        "google",
        `${window.location.origin}/pt/onboarding/workspace`,
      );
      if (oauthError) throw oauthError;
    } catch (nextError) {
      setError(
        nextError instanceof Error ? nextError.message : "Unable to continue with Google.",
      );
      setBusyAction("idle");
    }
  };

  return (
    <AuthBackdrop contentClassName="max-w-lg">
      <Card className="w-full rounded-[28px] border-border/70 bg-card/88 shadow-[0_32px_90px_-52px_rgba(0,0,0,0.72)] backdrop-blur-xl">
        <CardHeader className="space-y-3 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary">
            <Dumbbell className="h-5 w-5" />
          </div>
          <div className="space-y-1.5">
            <CardTitle className="text-2xl">Create PT account</CardTitle>
            <p className="text-sm text-muted-foreground">
              Start with your personal details now, then create your workspace.
            </p>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <form className="space-y-4" onSubmit={handleEmailSignup}>
            <div className="space-y-2">
              <label htmlFor="pt-full-name" className="text-sm font-medium">
                Full name
              </label>
              <Input
                id="pt-full-name"
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
                placeholder={getUserDisplayName(user) || "Coach name"}
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="pt-email" className="text-sm font-medium">
                Email
              </label>
              <Input
                id="pt-email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="coach@example.com"
              />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
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
                    setPhone(nextPhone);
                  }}
                  className="app-field flex min-h-[2.75rem] w-full px-3.5 py-2 text-sm"
                >
                  <option value="">Select country</option>
                  {COUNTRY_OPTIONS.map((option) => (
                    <option key={option.name} value={option.name}>
                      {option.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <label htmlFor="pt-city" className="text-sm font-medium">
                  City
                </label>
                <Input
                  id="pt-city"
                  value={city}
                  onChange={(event) => setCity(event.target.value)}
                  placeholder="Riyadh"
                />
              </div>
            </div>
            <div className="space-y-2">
              <label htmlFor="pt-phone" className="text-sm font-medium">
                Phone number
              </label>
              <Input
                id="pt-phone"
                type="tel"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                placeholder={country ? `${getCountryDialCode(country)} 5X XXX XXXX` : "+966 5X XXX XXXX"}
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="pt-password" className="text-sm font-medium">
                Password
              </label>
              <Input
                id="pt-password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="At least 6 characters"
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="pt-confirm-password" className="text-sm font-medium">
                Confirm password
              </label>
              <Input
                id="pt-confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                placeholder="Re-enter your password"
              />
            </div>

            {error ? (
              <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </div>
            ) : null}
            {notice ? (
              <div className="rounded-xl border border-primary/30 bg-primary/10 px-3 py-2 text-sm text-primary">
                {notice}
              </div>
            ) : null}

            <Button className="h-11 w-full" type="submit" disabled={busyAction !== "idle"}>
              {busyAction === "email" ? "Creating..." : "Create PT account"}
            </Button>
          </form>

          <div className="flex items-center gap-3 text-xs uppercase tracking-[0.24em] text-muted-foreground">
            <div className="h-px flex-1 bg-border/60" />
            <span>or</span>
            <div className="h-px flex-1 bg-border/60" />
          </div>

          <Button
            variant="secondary"
            className="h-11 w-full"
            onClick={() => void handleGoogle()}
            disabled={busyAction !== "idle"}
          >
            <Globe className="h-4 w-4" />
            {busyAction === "google" ? "Redirecting..." : "Continue with Google"}
          </Button>

          <p className="text-center text-sm text-muted-foreground">
            Already have an account? <Link className="text-foreground underline" to="/login">Sign in</Link>
          </p>
        </CardContent>
      </Card>
    </AuthBackdrop>
  );
}

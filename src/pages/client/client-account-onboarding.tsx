import { useEffect, useMemo, useState } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { AuthBackdrop } from "../../components/common/auth-backdrop";
import {
  clearPendingInviteToken,
  ensureClientProfile,
  getPendingInviteToken,
  getUserAvatarUrl,
  getUserDisplayName,
  persistPendingInviteToken,
  updateClientCanonicalProfile,
} from "../../lib/account-profiles";
import { useBootstrapAuth, useSessionAuth } from "../../lib/auth";

type FormState = {
  fullName: string;
  dateOfBirth: string;
  sex: string;
  heightValue: string;
  heightUnit: string;
  weightValueCurrent: string;
  weightUnit: string;
  phone: string;
  avatarUrl: string;
};

const emptyForm: FormState = {
  fullName: "",
  dateOfBirth: "",
  sex: "",
  heightValue: "",
  heightUnit: "cm",
  weightValueCurrent: "",
  weightUnit: "kg",
  phone: "",
  avatarUrl: "",
};

export function ClientAccountOnboardingPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { session, authLoading } = useSessionAuth();
  const {
    accountType,
    bootstrapPath,
    clientProfile,
    patchBootstrap,
    refreshRole,
  } = useBootstrapAuth();
  const [form, setForm] = useState<FormState>(emptyForm);
  const [bootstrapping, setBootstrapping] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pendingInviteToken = useMemo(
    () => searchParams.get("invite") ?? getPendingInviteToken(searchParams.toString()) ?? null,
    [searchParams],
  );

  useEffect(() => {
    if (!session?.user) return;
    let active = true;

    const load = async () => {
      setBootstrapping(true);
      setError(null);
      try {
        if (pendingInviteToken) {
          persistPendingInviteToken(pendingInviteToken);
        }

        const ensuredProfile =
          clientProfile ??
          (await ensureClientProfile({
            userId: session.user.id,
            fullName:
              window.localStorage.getItem("coachos_client_signup_name") ??
              getUserDisplayName(session.user),
            avatarUrl: getUserAvatarUrl(session.user),
            email: session.user.email ?? null,
          }));

        if (!active || !ensuredProfile) return;
        setForm({
          fullName:
            ensuredProfile.full_name ??
            ensuredProfile.display_name ??
            window.localStorage.getItem("coachos_client_signup_name") ??
            getUserDisplayName(session.user),
          dateOfBirth: ensuredProfile.date_of_birth ?? ensuredProfile.dob ?? "",
          sex: ensuredProfile.sex ?? ensuredProfile.gender ?? "",
          heightValue: String(
            ensuredProfile.height_value ?? ensuredProfile.height_cm ?? "",
          ),
          heightUnit:
            ensuredProfile.height_unit ??
            (ensuredProfile.unit_preference === "imperial" ? "in" : "cm"),
          weightValueCurrent: String(
            ensuredProfile.weight_value_current ??
              ensuredProfile.current_weight ??
              "",
          ),
          weightUnit:
            ensuredProfile.weight_unit ??
            (ensuredProfile.unit_preference === "imperial" ? "lb" : "kg"),
          phone: ensuredProfile.phone ?? "",
          avatarUrl:
            ensuredProfile.avatar_url ??
            ensuredProfile.photo_url ??
            getUserAvatarUrl(session.user),
        });
      } catch (nextError) {
        if (!active) return;
        setError(
          nextError instanceof Error
            ? nextError.message
            : "Unable to load your account profile.",
        );
      } finally {
        if (active) setBootstrapping(false);
      }
    };

    load();
    return () => {
      active = false;
    };
  }, [clientProfile, pendingInviteToken, session]);

  if (authLoading) {
    return (
      <AuthBackdrop contentClassName="max-w-xl">
        <Card className="w-full">
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Loading your account...
          </CardContent>
        </Card>
      </AuthBackdrop>
    );
  }

  if (!session) return <Navigate to="/login" replace />;
  if (accountType === "pt") {
    return <Navigate to={bootstrapPath ?? "/pt-hub"} replace />;
  }

  const handleSave = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!clientProfile?.id && !session.user.id) return;
    if (!form.fullName.trim()) {
      setError("Full name is required.");
      return;
    }
    if (!form.dateOfBirth) {
      setError("Date of birth is required.");
      return;
    }
    if (!form.sex.trim()) {
      setError("Sex / gender is required.");
      return;
    }
    if (!form.heightValue.trim() || Number(form.heightValue) <= 0) {
      setError("Height is required.");
      return;
    }
    if (!form.weightValueCurrent.trim() || Number(form.weightValueCurrent) <= 0) {
      setError("Current weight is required.");
      return;
    }
    if (!form.phone.trim()) {
      setError("Phone is required.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const profile =
        clientProfile ??
        (await ensureClientProfile({
          userId: session.user.id,
          fullName: form.fullName,
          avatarUrl: form.avatarUrl,
          email: session.user.email ?? null,
        }));
      if (!profile?.id) {
        throw new Error("Client account profile could not be created.");
      }

      await updateClientCanonicalProfile(profile.id, {
        full_name: form.fullName,
        avatar_url: form.avatarUrl,
        phone: form.phone,
        date_of_birth: form.dateOfBirth,
        sex: form.sex,
        height_value: Number(form.heightValue),
        height_unit: form.heightUnit,
        weight_value_current: Number(form.weightValueCurrent),
        weight_unit: form.weightUnit,
        account_onboarding_completed_at: new Date().toISOString(),
      });
      patchBootstrap({
        accountType: "client",
        role: "client",
        clientAccountComplete: true,
        clientProfile: {
          ...profile,
          full_name: form.fullName,
          avatar_url: form.avatarUrl,
          phone: form.phone,
          date_of_birth: form.dateOfBirth,
          sex: form.sex,
          height_value: Number(form.heightValue),
          height_unit: form.heightUnit,
          weight_value_current: Number(form.weightValueCurrent),
          weight_unit: form.weightUnit,
          account_onboarding_completed_at: new Date().toISOString(),
        },
        activeClientId: profile.id,
      });
      window.localStorage.removeItem("coachos_client_signup_name");
      await refreshRole?.();

      if (pendingInviteToken) {
        persistPendingInviteToken(pendingInviteToken);
        navigate(`/invite/${pendingInviteToken}`, { replace: true });
        return;
      }

      clearPendingInviteToken();
      navigate("/app/home", { replace: true });
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : "Unable to save your account profile.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <AuthBackdrop contentClassName="max-w-xl">
      <Card className="w-full rounded-[28px] border-border/70 bg-card/88 shadow-[0_32px_90px_-52px_rgba(0,0,0,0.72)] backdrop-blur-xl">
        <div data-testid="client-account-onboarding-page" />
        <CardHeader className="space-y-2">
          <CardTitle>Finish your client account</CardTitle>
          <p className="text-sm text-muted-foreground">
            This is your canonical client profile. We'll prefill these details wherever they show up later.
          </p>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4 md:grid-cols-2" onSubmit={handleSave}>
            <div className="space-y-2 md:col-span-2">
              <label htmlFor="client-account-full-name" className="text-sm font-medium">
                Full name
              </label>
              <Input
                id="client-account-full-name"
                value={form.fullName}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, fullName: event.target.value }))
                }
                disabled={bootstrapping}
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="client-account-dob" className="text-sm font-medium">
                Date of birth
              </label>
              <Input
                id="client-account-dob"
                type="date"
                value={form.dateOfBirth}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, dateOfBirth: event.target.value }))
                }
                disabled={bootstrapping}
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="client-account-sex" className="text-sm font-medium">
                Sex / gender
              </label>
              <select
                id="client-account-sex"
                className="h-11 w-full rounded-xl border border-border/70 bg-background px-3 text-sm text-foreground"
                value={form.sex}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, sex: event.target.value }))
                }
                disabled={bootstrapping}
              >
                <option value="">Select</option>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
                <option value="Prefer not to say">Prefer not to say</option>
              </select>
            </div>

            <div className="space-y-2">
              <label htmlFor="client-account-height" className="text-sm font-medium">
                Height
              </label>
              <div className="grid grid-cols-[minmax(0,1fr)_120px] gap-3">
                <Input
                  id="client-account-height"
                  type="number"
                  inputMode="decimal"
                  value={form.heightValue}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, heightValue: event.target.value }))
                  }
                  disabled={bootstrapping}
                />
                <select
                  className="h-11 rounded-xl border border-border/70 bg-background px-3 text-sm text-foreground"
                  value={form.heightUnit}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, heightUnit: event.target.value }))
                  }
                  disabled={bootstrapping}
                >
                  <option value="cm">cm</option>
                  <option value="in">in</option>
                </select>
              </div>
            </div>

            <div className="space-y-2">
              <label htmlFor="client-account-weight" className="text-sm font-medium">
                Current weight
              </label>
              <div className="grid grid-cols-[minmax(0,1fr)_120px] gap-3">
                <Input
                  id="client-account-weight"
                  type="number"
                  inputMode="decimal"
                  value={form.weightValueCurrent}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      weightValueCurrent: event.target.value,
                    }))
                  }
                  disabled={bootstrapping}
                />
                <select
                  className="h-11 rounded-xl border border-border/70 bg-background px-3 text-sm text-foreground"
                  value={form.weightUnit}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, weightUnit: event.target.value }))
                  }
                  disabled={bootstrapping}
                >
                  <option value="kg">kg</option>
                  <option value="lb">lb</option>
                </select>
              </div>
            </div>

            <div className="space-y-2">
              <label htmlFor="client-account-phone" className="text-sm font-medium">
                Phone
              </label>
              <Input
                id="client-account-phone"
                value={form.phone}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, phone: event.target.value }))
                }
                disabled={bootstrapping}
                placeholder="+966 555 123 456"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="client-account-avatar" className="text-sm font-medium">
                Avatar URL
              </label>
              <Input
                id="client-account-avatar"
                value={form.avatarUrl}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, avatarUrl: event.target.value }))
                }
                disabled={bootstrapping}
                placeholder="https://..."
              />
            </div>

            {error ? (
              <div className="md:col-span-2 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </div>
            ) : null}

            <div className="md:col-span-2 flex flex-wrap gap-3 pt-2">
              <Button type="submit" className="h-11" disabled={saving || bootstrapping}>
                {saving ? "Saving..." : pendingInviteToken ? "Save and continue invite" : "Finish account setup"}
              </Button>
              <Button
                type="button"
                variant="secondary"
                className="h-11"
                onClick={() => navigate("/app/home", { replace: true })}
                disabled={saving}
              >
                Skip for now
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </AuthBackdrop>
  );
}

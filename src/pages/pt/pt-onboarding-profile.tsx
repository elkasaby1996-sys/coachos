import { useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { AuthBackdrop } from "../../components/common/auth-backdrop";
import {
  ensurePtProfile,
  getUserAvatarUrl,
  getUserDisplayName,
  updatePtProfile,
} from "../../lib/account-profiles";
import { useAuth } from "../../lib/auth";

type FormState = {
  fullName: string;
  coachBusinessName: string;
  phone: string;
  avatarUrl: string;
  headline: string;
  bio: string;
  locationCountry: string;
  locationCity: string;
  languages: string;
  specialties: string;
  startingPrice: string;
};

const emptyForm: FormState = {
  fullName: "",
  coachBusinessName: "",
  phone: "",
  avatarUrl: "",
  headline: "",
  bio: "",
  locationCountry: "",
  locationCity: "",
  languages: "",
  specialties: "",
  startingPrice: "",
};

function splitCsv(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function PtProfileOnboardingPage() {
  const navigate = useNavigate();
  const {
    session,
    loading,
    accountType,
    hasWorkspaceMembership,
    ptProfile,
    refreshRole,
  } = useAuth();
  const [form, setForm] = useState<FormState>(emptyForm);
  const [bootstrapping, setBootstrapping] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!session?.user) return;
    let active = true;

    const load = async () => {
      setBootstrapping(true);
      setError(null);
      try {
        const ensured =
          ptProfile ??
          (await ensurePtProfile({
            userId: session.user.id,
            fullName: getUserDisplayName(session.user),
            coachBusinessName:
              window.localStorage.getItem("coachos_pt_workspace_name") ?? "",
          }));

        if (!active) return;
        setForm({
          fullName: ensured.full_name ?? getUserDisplayName(session.user),
          coachBusinessName:
            ensured.coach_business_name ??
            window.localStorage.getItem("coachos_pt_workspace_name") ??
            "",
          phone: ensured.phone ?? "",
          avatarUrl: ensured.avatar_url ?? getUserAvatarUrl(session.user),
          headline: ensured.headline ?? "",
          bio: ensured.bio ?? "",
          locationCountry: ensured.location_country ?? "",
          locationCity: ensured.location_city ?? "",
          languages: ensured.languages?.join(", ") ?? "",
          specialties: ensured.specialties?.join(", ") ?? "",
          startingPrice:
            ensured.starting_price !== null && ensured.starting_price !== undefined
              ? String(ensured.starting_price)
              : "",
        });
      } catch (nextError) {
        if (!active) return;
        setError(
          nextError instanceof Error
            ? nextError.message
            : "Unable to load your coach profile.",
        );
      } finally {
        if (active) setBootstrapping(false);
      }
    };

    load();
    return () => {
      active = false;
    };
  }, [ptProfile, session]);

  if (loading) {
    return (
      <AuthBackdrop contentClassName="max-w-2xl">
        <Card className="w-full">
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Loading your coach profile...
          </CardContent>
        </Card>
      </AuthBackdrop>
    );
  }

  if (!session) return <Navigate to="/login" replace />;
  if (accountType === "client") return <Navigate to="/app/home" replace />;
  if (!hasWorkspaceMembership) return <Navigate to="/pt/onboarding/workspace" replace />;

  const handleSave = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!form.fullName.trim()) {
      setError("Full name is required.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await updatePtProfile(session.user.id, {
        full_name: form.fullName,
        coach_business_name: form.coachBusinessName,
        phone: form.phone,
        avatar_url: form.avatarUrl,
        headline: form.headline,
        bio: form.bio,
        location_country: form.locationCountry,
        location_city: form.locationCity,
        languages: splitCsv(form.languages),
        specialties: splitCsv(form.specialties),
        starting_price: form.startingPrice ? Number(form.startingPrice) : null,
        onboarding_completed_at: new Date().toISOString(),
      });
      await refreshRole?.();
      navigate("/pt-hub", { replace: true });
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : "Unable to save your coach profile.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <AuthBackdrop contentClassName="max-w-2xl">
      <Card className="w-full rounded-[28px] border-border/70 bg-card/88 shadow-[0_32px_90px_-52px_rgba(0,0,0,0.72)] backdrop-blur-xl">
        <CardHeader className="space-y-2">
          <CardTitle>Finish your coach profile</CardTitle>
          <p className="text-sm text-muted-foreground">
            These are your canonical PT profile details. We'll reuse them in PT Hub, settings, and your public profile.
          </p>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4 md:grid-cols-2" onSubmit={handleSave}>
            <div className="space-y-2">
              <label className="text-sm font-medium">Full name</label>
              <Input
                value={form.fullName}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, fullName: event.target.value }))
                }
                disabled={bootstrapping}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Coach / business name</label>
              <Input
                value={form.coachBusinessName}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    coachBusinessName: event.target.value,
                  }))
                }
                disabled={bootstrapping}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Phone</label>
              <Input
                value={form.phone}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, phone: event.target.value }))
                }
                disabled={bootstrapping}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Avatar URL</label>
              <Input
                value={form.avatarUrl}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, avatarUrl: event.target.value }))
                }
                disabled={bootstrapping}
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <label className="text-sm font-medium">Headline</label>
              <Input
                value={form.headline}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, headline: event.target.value }))
                }
                disabled={bootstrapping}
                placeholder="Strength coach for busy professionals"
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <label className="text-sm font-medium">Bio</label>
              <textarea
                className="min-h-[140px] w-full rounded-2xl border border-border/70 bg-background px-3 py-2.5 text-sm text-foreground"
                value={form.bio}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, bio: event.target.value }))
                }
                disabled={bootstrapping}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Country</label>
              <Input
                value={form.locationCountry}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    locationCountry: event.target.value,
                  }))
                }
                disabled={bootstrapping}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">City</label>
              <Input
                value={form.locationCity}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, locationCity: event.target.value }))
                }
                disabled={bootstrapping}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Languages</label>
              <Input
                value={form.languages}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, languages: event.target.value }))
                }
                disabled={bootstrapping}
                placeholder="Arabic, English"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Specialties</label>
              <Input
                value={form.specialties}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, specialties: event.target.value }))
                }
                disabled={bootstrapping}
                placeholder="Fat loss, strength, lifestyle coaching"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Starting price</label>
              <Input
                type="number"
                inputMode="decimal"
                value={form.startingPrice}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, startingPrice: event.target.value }))
                }
                disabled={bootstrapping}
              />
            </div>

            {error ? (
              <div className="md:col-span-2 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </div>
            ) : null}

            <div className="md:col-span-2 flex gap-3 pt-2">
              <Button type="submit" className="h-11" disabled={saving || bootstrapping}>
                {saving ? "Saving..." : "Finish PT profile"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </AuthBackdrop>
  );
}

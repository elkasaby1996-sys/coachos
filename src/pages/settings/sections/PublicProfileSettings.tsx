import { useEffect, useMemo, useState } from "react";
import { Button } from "../../../components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../../components/ui/dialog";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";
import { Switch } from "../../../components/ui/switch";
import {
  SettingsActions,
  SettingsBlock,
  SettingsInlineSeparator,
  SettingsPageShell,
  SettingsRow,
  SettingsToast,
} from "./shared";
import { useWorkspace } from "../../../lib/use-workspace";

type TrainingMode = "online" | "in_person" | "hybrid";

type PublicProfileForm = {
  listed: boolean;
  displayName: string;
  headline: string;
  bio: string;
  specialties: string[];
  location: string;
  trainingMode: TrainingMode;
  languages: string[];
  startingPrice: string;
  profilePhoto: string;
  coverPhoto: string;
};

const defaultForm: PublicProfileForm = {
  listed: false,
  displayName: "",
  headline: "",
  bio: "",
  specialties: [],
  location: "",
  trainingMode: "online",
  languages: [],
  startingPrice: "",
  profilePhoto: "",
  coverPhoto: "",
};

function normalizeTagInput(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function PublicProfileSettings() {
  const { workspaceId } = useWorkspace();
  const storageKey = useMemo(
    () => `coachos-public-profile-${workspaceId ?? "default"}`,
    [workspaceId],
  );
  const [form, setForm] = useState<PublicProfileForm>(defaultForm);
  const [initialForm, setInitialForm] =
    useState<PublicProfileForm>(defaultForm);
  const [specialtiesInput, setSpecialtiesInput] = useState("");
  const [languagesInput, setLanguagesInput] = useState("");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastVariant, setToastVariant] = useState<"success" | "error">(
    "success",
  );

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as PublicProfileForm;
      setForm(parsed);
      setInitialForm(parsed);
      setSpecialtiesInput(parsed.specialties.join(", "));
      setLanguagesInput(parsed.languages.join(", "));
    } catch {
      // keep defaults
    }
  }, [storageKey]);

  useEffect(() => {
    if (!toastMessage) return;
    const timeout = window.setTimeout(() => setToastMessage(null), 2400);
    return () => window.clearTimeout(timeout);
  }, [toastMessage]);

  const hasChanges = JSON.stringify(form) !== JSON.stringify(initialForm);

  const handleSave = async () => {
    if (!hasChanges) return;
    if (!form.displayName.trim()) {
      setToastVariant("error");
      setToastMessage("Public display name is required.");
      return;
    }

    setSaving(true);
    try {
      await new Promise((resolve) => window.setTimeout(resolve, 600));
      window.localStorage.setItem(storageKey, JSON.stringify(form));
      setInitialForm(form);
      setToastVariant("success");
      setToastMessage("Public profile saved.");
    } catch {
      setToastVariant("error");
      setToastMessage("Unable to save public profile.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <SettingsToast message={toastMessage} variant={toastVariant} />
      <SettingsPageShell
        title="Public Profile"
        description="Configure how you appear in the marketplace listing and discovery surfaces."
      >
        <SettingsBlock
          title="Marketplace Listing"
          description="This profile powers discoverability and trust before prospects book you."
          noBorder
        >
          <SettingsRow
            label="Marketplace visibility"
            hint="Turn this on to list your profile publicly."
          >
            <div className="flex items-center justify-between rounded-lg border border-border bg-muted/30 px-4 py-3">
              <div>
                <p className="text-sm font-medium">
                  List my profile on marketplace
                </p>
                <p className="text-xs text-muted-foreground">
                  You can save drafts while this is off.
                </p>
              </div>
              <Switch
                checked={form.listed}
                onCheckedChange={(checked) =>
                  setForm((prev) => ({ ...prev, listed: checked }))
                }
                data-testid="public-profile-listed-switch"
              />
            </div>
          </SettingsRow>

          <SettingsInlineSeparator />

          <SettingsRow
            label="Public display name"
            hint="Visible as your listing title."
          >
            <Input
              value={form.displayName}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  displayName: event.target.value,
                }))
              }
              placeholder="Coach name"
            />
          </SettingsRow>

          <SettingsRow
            label="Headline"
            hint="Short one-line value proposition."
          >
            <Input
              value={form.headline}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, headline: event.target.value }))
              }
              placeholder="Strength coach for busy professionals"
            />
          </SettingsRow>

          <SettingsRow
            label="Bio"
            hint="Tell prospects what outcomes you help create."
          >
            <textarea
              className="min-h-[120px] w-full app-field px-3 py-2 text-sm"
              value={form.bio}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, bio: event.target.value }))
              }
              placeholder="Your approach, credentials, and coaching style"
            />
          </SettingsRow>

          <SettingsRow label="Specialties" hint="Comma-separated tags.">
            <Input
              value={specialtiesInput}
              onChange={(event) => {
                setSpecialtiesInput(event.target.value);
                setForm((prev) => ({
                  ...prev,
                  specialties: normalizeTagInput(event.target.value),
                }));
              }}
              placeholder="Weight loss, Strength, Mobility"
            />
            <div className="flex flex-wrap gap-2">
              {form.specialties.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full border border-border bg-muted/40 px-2 py-1 text-xs"
                >
                  {tag}
                </span>
              ))}
            </div>
          </SettingsRow>

          <SettingsRow label="Location" hint="City/region shown on listing.">
            <Input
              value={form.location}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, location: event.target.value }))
              }
              placeholder="Dubai, UAE"
            />
          </SettingsRow>

          <SettingsRow label="Training mode" hint="How you deliver coaching.">
            <select
              value={form.trainingMode}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  trainingMode: event.target.value as TrainingMode,
                }))
              }
              className="h-10 w-full app-field px-3 text-sm"
            >
              <option value="online">Online</option>
              <option value="in_person">In-person</option>
              <option value="hybrid">Hybrid</option>
            </select>
          </SettingsRow>

          <SettingsRow label="Languages" hint="Comma-separated languages.">
            <Input
              value={languagesInput}
              onChange={(event) => {
                setLanguagesInput(event.target.value);
                setForm((prev) => ({
                  ...prev,
                  languages: normalizeTagInput(event.target.value),
                }));
              }}
              placeholder="English, Arabic"
            />
            <div className="flex flex-wrap gap-2">
              {form.languages.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full border border-border bg-muted/40 px-2 py-1 text-xs"
                >
                  {tag}
                </span>
              ))}
            </div>
          </SettingsRow>

          <SettingsRow
            label="Starting price"
            hint="Optional monthly starting price."
          >
            <Input
              type="number"
              min={0}
              value={form.startingPrice}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  startingPrice: event.target.value,
                }))
              }
              placeholder="149"
            />
          </SettingsRow>

          <SettingsRow
            label="Profile media"
            hint="Upload hooks can be wired to storage later."
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-dashed border-border bg-muted/30 p-4">
                <Label className="mb-2 block text-xs uppercase tracking-[0.14em] text-muted-foreground">
                  Profile photo
                </Label>
                <Input
                  value={form.profilePhoto}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      profilePhoto: event.target.value,
                    }))
                  }
                  placeholder="Image URL or upload later"
                />
              </div>
              <div className="rounded-lg border border-dashed border-border bg-muted/30 p-4">
                <Label className="mb-2 block text-xs uppercase tracking-[0.14em] text-muted-foreground">
                  Cover image
                </Label>
                <Input
                  value={form.coverPhoto}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      coverPhoto: event.target.value,
                    }))
                  }
                  placeholder="Image URL or upload later"
                />
              </div>
            </div>
          </SettingsRow>

          <SettingsActions>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setPreviewOpen(true)}
            >
              Preview public profile
            </Button>
            <Button
              type="button"
              onClick={handleSave}
              disabled={!hasChanges || saving}
              data-testid="save-profile-button"
            >
              {saving ? "Saving..." : "Save profile"}
            </Button>
          </SettingsActions>
        </SettingsBlock>
      </SettingsPageShell>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Public profile preview</DialogTitle>
            <DialogDescription>
              Preview route will point to <code>/coaches/[slug]</code> once
              marketplace pages are enabled.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-4">
            <p className="text-lg font-semibold">
              {form.displayName || "Coach profile"}
            </p>
            <p className="text-sm text-muted-foreground">
              {form.headline || "Headline"}
            </p>
            <p className="text-sm text-foreground">
              {form.bio || "Bio preview"}
            </p>
            <p className="text-xs text-muted-foreground">
              {form.location || "Location"} -{" "}
              {form.trainingMode.replace("_", " ")}
            </p>
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setPreviewOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

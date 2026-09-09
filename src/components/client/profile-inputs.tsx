import { useId, useState } from "react";
import { supabase } from "../../lib/supabase";
import { Button } from "../ui/button";

export function ProfilePhotoPicker({
  value,
  onChange,
  onBusyChange,
  disabled = false,
}: {
  value: string;
  onChange: (url: string) => void;
  onBusyChange?: (busy: boolean) => void;
  disabled?: boolean;
}) {
  const id = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <div className="space-y-3">
      {value && (
        <img
          src={value}
          alt="Profile photo preview"
          className="h-20 w-20 rounded-full object-cover"
        />
      )}
      <label htmlFor={id} className="block text-sm font-medium">
        {value ? "Replace profile photo" : "Choose profile photo"}
      </label>
      <input
        id={id}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        disabled={disabled || busy}
        className="block min-h-11 max-w-full text-base"
        onChange={async (event) => {
          const file = event.target.files?.[0];
          if (!file) return;
          setError("");
          if (
            !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
            file.size > 5 * 1024 * 1024
          ) {
            setError("Choose a JPG, PNG, or WebP photo smaller than 5 MB.");
            return;
          }
          setBusy(true);
          onBusyChange?.(true);
          try {
            const {
              data: { user },
            } = await supabase.auth.getUser();
            if (!user)
              throw new Error("Sign in again before uploading a photo.");
            const path = `${user.id}/avatars/${crypto.randomUUID()}.${file.type.split("/")[1]}`;
            const { error: uploadError } = await supabase.storage
              .from("pt_profile_media")
              .upload(path, file, { contentType: file.type, upsert: false });
            if (uploadError) throw uploadError;
            onChange(
              supabase.storage.from("pt_profile_media").getPublicUrl(path).data
                .publicUrl,
            );
          } catch {
            setError(
              "The photo could not be uploaded. Your previous photo is unchanged. Try choosing the file again.",
            );
          } finally {
            setBusy(false);
            onBusyChange?.(false);
            event.target.value = "";
          }
        }}
      />
      <p className="text-sm text-muted-foreground">
        JPG, PNG, or WebP, up to 5 MB. Profile photos use a public image link.
        Save your profile to apply this change.
      </p>
      {busy && <p role="status">Uploading photo…</p>}
      {error && <p role="alert">{error}</p>}
      {value && (
        <Button
          type="button"
          variant="secondary"
          disabled={disabled || busy}
          onClick={() => onChange("")}
        >
          Remove photo
        </Button>
      )}
    </div>
  );
}

export function isValidTimezone(value: string) {
  if (!value.trim()) return false;
  try {
    new Intl.DateTimeFormat("en", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}
export function TimezonePicker({
  value,
  onChange,
  id,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  id: string;
  disabled?: boolean;
}) {
  const device = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const zones = (
    Intl as typeof Intl & { supportedValuesOf?: (key: string) => string[] }
  ).supportedValuesOf?.("timeZone") ?? ["UTC", device];
  return (
    <div className="space-y-2">
      <input
        id={id}
        aria-label="Timezone"
        list={`${id}-options`}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="app-field min-h-11 w-full px-3 text-base"
        aria-invalid={!isValidTimezone(value)}
      />
      <datalist id={`${id}-options`}>
        {[...new Set(["UTC", device, ...zones])].map((zone) => (
          <option key={zone} value={zone}>
            {zone.replace(/_/g, " ").replace(/\//g, " / ")}
          </option>
        ))}
      </datalist>
      {!isValidTimezone(value) && (
        <p role="alert" className="text-sm">
          Choose a timezone from the list.
        </p>
      )}
      <Button
        type="button"
        variant="ghost"
        disabled={disabled}
        onClick={() => onChange(device)}
      >
        Use device timezone: {device.replace(/_/g, " ")}
      </Button>
    </div>
  );
}

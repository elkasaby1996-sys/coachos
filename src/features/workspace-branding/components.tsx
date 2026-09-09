import { useId, useState } from "react";
import * as Avatar from "@radix-ui/react-avatar";
import { Button } from "../../components/ui/button";
import { supabase } from "../../lib/supabase";
import { cn } from "../../lib/utils";
import { isLogoUrl, type WorkspaceBranding } from "./branding";

export function WorkspaceLogo({
  name,
  url,
  className,
}: {
  name: string;
  url?: string | null;
  className?: string;
}) {
  return (
    <Avatar.Root
      className={cn(
        "inline-flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border bg-background text-sm font-semibold",
        className,
      )}
    >
      <Avatar.Image
        src={url && isLogoUrl(url) ? url : undefined}
        alt={`${name} logo`}
        className="h-full w-full object-contain p-1"
      />
      <Avatar.Fallback>
        {name.trim().charAt(0).toUpperCase() || "W"}
      </Avatar.Fallback>
    </Avatar.Root>
  );
}

export function WorkspaceWelcome({
  branding,
}: {
  branding: WorkspaceBranding | null | undefined;
}) {
  if (
    !branding?.client_welcome_title?.trim() &&
    !branding?.client_welcome_message?.trim()
  )
    return null;
  return (
    <section
      aria-label="Workspace welcome"
      className="mb-5 flex items-start gap-4 rounded-2xl border border-border bg-card p-5 sm:p-6"
    >
      {branding.logo_url ? (
        <WorkspaceLogo
          name={branding.name || "Workspace"}
          url={branding.logo_url}
          className="hidden h-14 w-14 sm:inline-flex"
        />
      ) : null}
      <div className="min-w-0 space-y-2">
        <h2 className="text-xl font-semibold [overflow-wrap:anywhere]">
          {branding.client_welcome_title?.trim() ||
            `Welcome to ${branding.name || "your workspace"}`}
        </h2>
        {branding.client_welcome_message?.trim() ? (
          <p className="whitespace-pre-wrap text-sm leading-6 text-muted-foreground [overflow-wrap:anywhere]">
            {branding.client_welcome_message}
          </p>
        ) : null}
      </div>
    </section>
  );
}

export function WorkspaceLogoPicker({
  workspaceId,
  value,
  onChange,
  disabled,
  onBusyChange,
}: {
  workspaceId: string;
  value: string;
  onChange: (url: string) => void;
  disabled: boolean;
  onBusyChange: (busy: boolean) => void;
}) {
  const id = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <div className="space-y-3">
      <WorkspaceLogo name="Workspace" url={value} className="h-20 w-20" />
      <label htmlFor={id} className="block text-sm font-medium">
        {value ? "Replace workspace logo" : "Upload workspace logo"}
      </label>
      <input
        id={id}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        disabled={disabled || busy}
        className="block min-h-11 w-full max-w-full text-sm"
        onChange={async (event) => {
          const input = event.currentTarget;
          const file = input.files?.[0];
          if (!file) return;
          setError("");
          if (
            !["image/png", "image/jpeg", "image/webp"].includes(file.type) ||
            file.size > 5 * 1024 * 1024
          ) {
            setError("Choose a PNG, JPG, or WebP image up to 5 MB.");
            input.value = "";
            return;
          }
          setBusy(true);
          onBusyChange(true);
          try {
            const path = `${workspaceId}/${crypto.randomUUID()}.${file.type.split("/")[1]}`;
            const bucket = supabase.storage.from("workspace_branding");
            const { error: uploadError } = await bucket.upload(path, file, {
              contentType: file.type,
              upsert: false,
            });
            if (uploadError) throw uploadError;
            onChange(bucket.getPublicUrl(path).data.publicUrl);
          } catch {
            setError("Could not upload the logo. Please try again.");
          } finally {
            setBusy(false);
            onBusyChange(false);
            input.value = "";
          }
        }}
      />
      <p className="text-xs text-muted-foreground">
        PNG, JPG, or WebP, up to 5 MB. A square image with a transparent
        background works best. Save changes to apply it.
      </p>
      {busy ? (
        <p role="status" className="text-sm">
          Uploading logo…
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
      {value ? (
        <Button
          type="button"
          variant="secondary"
          disabled={disabled || busy}
          onClick={() => onChange("")}
        >
          Remove logo
        </Button>
      ) : null}
    </div>
  );
}

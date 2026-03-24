import { ReactElement, useEffect, useMemo, useState } from "react";
import { Check, Copy, Link2, Sparkles } from "lucide-react";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../ui/dialog";
import { Input } from "../ui/input";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../lib/auth";
import { getWorkspaceIdForUser } from "../../lib/workspace";

type InviteRecord = {
  id: string;
  workspace_id: string;
  role?: string | null;
  code: string;
  expires_at: string | null;
  max_uses: number;
  uses: number;
  created_by_user_id: string;
  created_at: string;
};

type ExpirySelection = "1h" | "24h" | "7d" | "never";

const expiryOptions: Array<{ value: ExpirySelection; label: string }> = [
  { value: "1h", label: "1 hour" },
  { value: "24h", label: "24 hours" },
  { value: "7d", label: "7 days" },
  { value: "never", label: "Never" },
];

function buildInviteCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 8; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

function getExpiryTimestamp(selection: ExpirySelection): string | null {
  const now = new Date();
  if (selection === "never") return null;
  if (selection === "1h") now.setHours(now.getHours() + 1);
  if (selection === "24h") now.setDate(now.getDate() + 1);
  if (selection === "7d") now.setDate(now.getDate() + 7);
  return now.toISOString();
}

function getExpiryLabel(selection: ExpirySelection) {
  return (
    expiryOptions.find((option) => option.value === selection)?.label ?? ""
  );
}

function getInviteMeta(selection: ExpirySelection) {
  const expiry =
    selection === "never"
      ? "No expiry"
      : `Expires in ${getExpiryLabel(selection).toLowerCase()}`;
  return `${expiry} • 1 use only`;
}

export function InviteClientDialog({ trigger }: { trigger: ReactElement }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [expirySelection, setExpirySelection] =
    useState<ExpirySelection>("24h");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [invite, setInvite] = useState<InviteRecord | null>(null);

  useEffect(() => {
    if (!copied) return;
    const timeout = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(timeout);
  }, [copied]);

  const inviteLink = useMemo(() => {
    if (!invite?.code) return "";
    return `${window.location.origin}/invite/${invite.code}`;
  }, [invite]);

  const handleGenerate = async () => {
    if (!user?.id) {
      setError("You must be logged in to create an invite.");
      return;
    }

    setIsSaving(true);
    setError(null);
    setCopied(false);

    try {
      const workspaceId = await getWorkspaceIdForUser(user.id);
      if (!workspaceId) {
        throw new Error("Workspace not found for this PT.");
      }

      const code = buildInviteCode();
      const expiresAt = getExpiryTimestamp(expirySelection);

      const { data, error: insertError } = await supabase
        .from("invites")
        .insert({
          code,
          workspace_id: workspaceId,
          created_by_user_id: user.id,
          expires_at: expiresAt,
          max_uses: 1,
          uses: 0,
        })
        .select("*")
        .single();

      if (insertError) {
        throw insertError;
      }

      setInvite(data as InviteRecord);
    } catch (err: any) {
      console.error("Failed to create invite", err);
      setError(err?.message ?? "Failed to create invite.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleCopy = async () => {
    if (!inviteLink) return;
    try {
      await navigator.clipboard.writeText(inviteLink);
      setCopied(true);
    } catch {
      setError("Failed to copy link.");
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) {
          setError(null);
          setCopied(false);
        }
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>

      <DialogContent className="overflow-hidden border-border/80 bg-[oklch(0.21_0.015_255)] p-0 shadow-[0_0_0_1px_oklch(1_0_0/0.03),0_28px_72px_-34px_rgb(0_0_0/0.85)] sm:max-w-[540px]">
        <div className="border-b border-border/70 bg-[oklch(0.23_0.015_255)] px-6 pb-4 pt-5 sm:px-6">
          <DialogHeader className="max-w-[410px] gap-1.5 pr-10">
            <DialogTitle className="text-[1.15rem] tracking-tight">
              Invite client
            </DialogTitle>
            <DialogDescription className="text-sm leading-5 text-muted-foreground/90">
              Create a secure single-use link for a client to join your
              workspace.
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="space-y-4 px-6 py-4 sm:px-6">
          {error ? (
            <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          ) : null}

          <section className="space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-0.5">
                <p className="text-sm font-medium text-foreground">
                  Invite settings
                </p>
                <p className="text-xs text-muted-foreground/90">
                  Single-use link
                </p>
              </div>
              <div className="flex flex-wrap gap-2 pt-0.5">
                <Badge
                  variant="muted"
                  className="border-border/70 bg-secondary/30 text-foreground/90"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  Secure
                </Badge>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {expiryOptions.map((option) => {
                const active = expirySelection === option.value;
                return (
                  <Button
                    key={option.value}
                    type="button"
                    variant="ghost"
                    className={`h-10 justify-center rounded-xl border px-3 text-sm ${
                      active
                        ? "border-primary/50 bg-primary/14 text-foreground shadow-[0_0_0_1px_oklch(var(--primary)/0.18),0_10px_24px_-18px_oklch(var(--primary)/0.7)]"
                        : "border-border/70 bg-secondary/22 text-muted-foreground hover:border-border hover:bg-secondary/38 hover:text-foreground"
                    }`}
                    onClick={() => setExpirySelection(option.value)}
                  >
                    {option.label}
                  </Button>
                );
              })}
            </div>
          </section>

          <section className="space-y-3">
            <div className="space-y-0.5">
              <p className="text-sm font-medium text-foreground">Invite link</p>
              {!invite ? (
                <p className="text-sm text-muted-foreground/90">
                  No invite generated yet.
                </p>
              ) : null}
            </div>

            {!invite ? (
              <div className="flex items-center gap-3 rounded-xl border border-dashed border-border/70 bg-secondary/16 px-4 py-4 text-sm text-muted-foreground/90">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border/70 bg-[oklch(0.24_0.015_255)] text-muted-foreground">
                  <Link2 className="h-4 w-4" />
                </div>
                <div className="space-y-0.5">
                  <p className="font-medium text-foreground">
                    No invite generated yet
                  </p>
                  <p>Choose an expiry and generate a secure link.</p>
                </div>
              </div>
            ) : (
              <div className="space-y-2.5">
                <div className="flex flex-col gap-2.5 sm:flex-row sm:items-start">
                  <Input
                    value={inviteLink}
                    readOnly
                    className="h-11 border-border/75 bg-[oklch(0.18_0.012_255)] text-foreground shadow-[inset_0_1px_0_oklch(1_0_0/0.03)] placeholder:text-muted-foreground/50 selection:bg-primary/25"
                  />
                  <div className="flex shrink-0 flex-col gap-1.5 sm:w-[124px]">
                    <Button type="button" onClick={handleCopy} className="h-11">
                      {copied ? (
                        <>
                          <Check className="h-4 w-4" />
                          Copied
                        </>
                      ) : (
                        <>
                          <Copy className="h-4 w-4" />
                          Copy link
                        </>
                      )}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 px-1.5 text-muted-foreground hover:bg-transparent hover:text-foreground"
                      onClick={handleGenerate}
                      disabled={isSaving}
                    >
                      {isSaving ? "Regenerating..." : "Regenerate"}
                    </Button>
                  </div>
                </div>

                <div className="text-xs text-muted-foreground/90">
                  {getInviteMeta(expirySelection)}
                </div>
              </div>
            )}
          </section>
        </div>

        <DialogFooter className="border-t border-border/70 bg-[oklch(0.22_0.014_255)] px-6 py-2.5 sm:px-6">
          {invite ? (
            <Button
              type="button"
              variant="secondary"
              onClick={() => setOpen(false)}
            >
              Done
            </Button>
          ) : (
            <>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handleGenerate}
                disabled={isSaving}
              >
                {isSaving ? "Generating..." : "Generate invite link"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

import { ReactElement, useMemo, useState } from "react";
import { Copy, Link2 } from "lucide-react";
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
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../lib/auth";
import { getWorkspaceIdForUser } from "../../lib/workspace";
import { Alert, AlertDescription, AlertTitle } from "../ui/alert";

type InviteRecord = {
  code: string;
  invite_link?: string | null;
  expires_at: string | null;
};

const expiryOptions = [
  { label: "No expiry", value: "none" },
  { label: "24 hours", value: "24h" },
  { label: "7 days", value: "7d" },
  { label: "30 days", value: "30d" },
];

function buildInviteCode() {
  return `INV-${crypto.randomUUID().split("-")[0].toUpperCase()}`;
}

function getExpiryTimestamp(selection: string) {
  if (selection === "none") return null;
  const now = new Date();
  switch (selection) {
    case "24h":
      now.setHours(now.getHours() + 24);
      break;
    case "7d":
      now.setDate(now.getDate() + 7);
      break;
    case "30d":
      now.setDate(now.getDate() + 30);
      break;
    default:
      return null;
  }
  return now.toISOString();
}

function formatExpiry(expiresAt: string | null) {
  if (!expiresAt) return "Never expires";
  const date = new Date(expiresAt);
  return `Expires ${date.toLocaleDateString()} ${date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}

export function InviteClientDialog({ trigger }: { trigger: ReactElement }) {
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [expirySelection, setExpirySelection] = useState("7d");
  const [invite, setInvite] = useState<InviteRecord | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const inviteLink = useMemo(() => {
    if (!invite?.code) return "";
    return invite.invite_link ?? `${window.location.origin}/join/${invite.code}`;
  }, [invite]);

  const showToast = (message: string) => {
    setToastMessage(message);
    window.setTimeout(() => setToastMessage(null), 4000);
  };

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

      const expiresAt = getExpiryTimestamp(expirySelection);
      const code = buildInviteCode();

      const { data, error: insertError } = await supabase
        .from("invites")
        .insert({
          workspace_id: workspaceId,
          code,
          max_uses: 1,
          uses: 0,
          expires_at: expiresAt,
          created_by_user_id: user.id,
        })
        .select("code, expires_at")
        .single();

      if (insertError) {
        console.error("create invite error", insertError);
        showToast(insertError.message);
        setError(insertError.message);
        return;
      }

      setInvite((data as InviteRecord) ?? null);
      if (!data) {
        showToast("Invite generated, but no data was returned.");
      }
    } catch (err) {
      console.error("Failed to create invite", err);
      const message = err instanceof Error ? err.message : "Failed to create invite.";
      setError(message);
      showToast(message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCopy = async () => {
    if (!inviteLink) return;
    try {
      await navigator.clipboard.writeText(inviteLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy", err);
    }
  };

  const handleClose = () => {
    setInvite(null);
    setError(null);
    setCopied(false);
    setToastMessage(null);
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        setIsOpen(open);
        if (!open) handleClose();
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite a new client</DialogTitle>
          <DialogDescription>Generate a single-use link to onboard a new athlete.</DialogDescription>
        </DialogHeader>

        {toastMessage ? (
          <Alert className="border-danger/30 bg-danger/10 text-danger">
            <AlertTitle>Invite error</AlertTitle>
            <AlertDescription className="text-danger">{toastMessage}</AlertDescription>
          </Alert>
        ) : null}

        <div className="space-y-4 text-sm">
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Expiry (optional)
            </label>
            <div className="grid gap-2 sm:grid-cols-2">
              {expiryOptions.map((option) => (
                <Button
                  key={option.value}
                  type="button"
                  variant={expirySelection === option.value ? "default" : "secondary"}
                  size="sm"
                  onClick={() => setExpirySelection(option.value)}
                >
                  {option.label}
                </Button>
              ))}
            </div>
          </div>

          {invite ? (
            <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs text-muted-foreground">Invite link</div>
                <Badge variant="success">Single-use</Badge>
              </div>
              <div className="flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-xs">
                <Link2 className="h-4 w-4 text-muted-foreground" />
                <span className="break-all">{inviteLink}</span>
              </div>
              <div className="text-xs text-muted-foreground">{formatExpiry(invite.expires_at)}</div>
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-border bg-muted/20 p-4 text-xs text-muted-foreground">
              Generate a link to share with your new client.
            </div>
          )}

          {error ? (
            <Alert className="border-danger/30 bg-danger/10 text-danger">
              <AlertTitle>Unable to generate invite</AlertTitle>
              <AlertDescription className="text-danger">{error}</AlertDescription>
            </Alert>
          ) : null}
        </div>

        <DialogFooter className="gap-2 sm:gap-3">
          {invite ? (
            <>
              <Button type="button" variant="secondary" onClick={handleCopy}>
                <Copy className="mr-2 h-4 w-4" />
                {copied ? "Copied" : "Copy link"}
              </Button>
              <Button type="button" onClick={() => setIsOpen(false)}>
                Done
              </Button>
            </>
          ) : (
            <Button type="button" onClick={handleGenerate} disabled={isSaving}>
              {isSaving ? "Generating..." : "Generate invite"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

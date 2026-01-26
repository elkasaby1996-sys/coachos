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

function buildInviteCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 8; i++) out += chars[Math.floor(Math.random() * chars.length)];
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

export function InviteClientDialog({ trigger }: { trigger: ReactElement }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [expirySelection, setExpirySelection] = useState<ExpirySelection>("24h");

  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [invite, setInvite] = useState<InviteRecord | null>(null);

  const inviteLink = useMemo(() => {
    if (!invite?.code) return "";
    return `${window.location.origin}/join/${invite.code}`;
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

      // ✅ FIX: use created_by_user_id (not created_by)
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
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Failed to copy link.");
    }
  };

  const handleOpen = () => {
    if (!inviteLink) return;
    window.open(inviteLink, "_blank", "noopener,noreferrer");
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) {
          setError(null);
          setCopied(false);
          // keep invite around so user can re-copy if they reopen quickly
        }
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>

      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Invite a client</DialogTitle>
          <DialogDescription>
            Generate a single-use invite link for a client to join your workspace.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {error && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <div className="rounded-xl border bg-card p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm font-medium">Expiry</div>
              <div className="flex gap-2">
                {(["1h", "24h", "7d", "never"] as ExpirySelection[]).map((opt) => (
                  <Button
                    key={opt}
                    type="button"
                    variant={expirySelection === opt ? "default" : "secondary"}
                    size="sm"
                    onClick={() => setExpirySelection(opt)}
                  >
                    {opt === "never" ? "Never" : opt}
                  </Button>
                ))}
              </div>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Single-use invite (max uses = 1). You can generate another any time.
            </p>
          </div>

          {invite ? (
            <div className="rounded-xl border bg-card p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm text-muted-foreground">Invite code</div>
                  <div className="text-xl font-semibold tracking-tight">{invite.code}</div>
                </div>
                <Badge variant="secondary">Single-use</Badge>
              </div>

              <div className="text-sm break-all rounded-lg border bg-muted/20 p-3">
                {inviteLink}
              </div>

              <div className="flex gap-2">
                <Button type="button" variant="secondary" onClick={handleCopy} className="gap-2">
                  <Copy className="h-4 w-4" />
                  {copied ? "Copied" : "Copy link"}
                </Button>
                <Button type="button" variant="secondary" onClick={handleOpen} className="gap-2">
                  <Link2 className="h-4 w-4" />
                  Open
                </Button>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border bg-card p-4">
              <p className="text-sm text-muted-foreground">
                Click Generate to create an invite link.
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
            Close
          </Button>
          <Button type="button" onClick={handleGenerate} disabled={isSaving}>
            {isSaving ? "Generating..." : "Generate invite"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


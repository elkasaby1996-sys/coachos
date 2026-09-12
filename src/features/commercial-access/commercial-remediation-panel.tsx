import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "../../components/ui/dialog";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { Button } from "../../components/ui/button";
import { useSessionAuth } from "../../lib/auth";
import { supabase } from "../../lib/supabase";
const row = z
  .object({ id: z.uuid(), label: z.string(), workspaceId: z.uuid().optional() })
  .strict();
const schema = z
  .object({
    clients: z.array(row),
    members: z.array(row),
    invites: z.array(row),
    packages: z.array(row),
  })
  .strict();
type Kind = keyof z.infer<typeof schema>;
export function CommercialRemediationPanel() {
  const { user } = useSessionAuth();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<{
    kind: Kind;
    item: z.infer<typeof row>;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const query = useQuery({
    queryKey: ["commercial-remediation", user?.id],
    enabled: !!user && open,
    queryFn: async () => {
      const { data, error } = await supabase.rpc(
        "get_my_commercial_remediation",
      );
      if (error) throw new Error("Commitments could not be loaded.");
      return schema.parse(data);
    },
  });
  const labels = {
    clients: "Remove relationship",
    members: "Suspend member",
    invites: "Revoke invite",
    packages: "Archive package",
  };
  async function confirm() {
    if (!pending || busy) return;
    setBusy(true);
    setError(null);
    const { kind, item } = pending;
    const result =
      kind === "clients"
        ? await supabase.rpc("pt_archive_client_relationship", {
            p_client_id: item.id,
          })
        : kind === "members"
          ? await supabase.rpc("update_workspace_team_member_status", {
              p_workspace_id: item.workspaceId,
              p_member_id: item.id,
              p_status: "suspended",
            })
          : kind === "invites"
            ? await supabase.rpc("revoke_workspace_team_invite", {
                p_workspace_id: item.workspaceId,
                p_invite_id: item.id,
              })
            : await supabase.rpc("update_my_pt_package", {
                p_package_id: item.id,
                p_input: { status: "archived", is_public: false },
              });
    setBusy(false);
    if (result.error) {
      setError(
        "This change could not be completed. Your selection is preserved. Please retry or contact support.",
      );
      return;
    }
    setPending(null);
    await query.refetch();
  }
  return (
    <section className="mt-6 space-y-3">
      <h2 className="text-lg font-semibold">Manage commitments</h2>
      <p className="text-sm text-muted-foreground">
        You can reduce commitments while recovering access. Nothing changes
        automatically.
      </p>
      <Button variant="secondary" onClick={() => setOpen(!open)}>
        {open ? "Hide commitments" : "Review commitments"}
      </Button>
      {open && query.isPending && <p role="status">Loading commitments…</p>}
      {query.isError && (
        <p role="alert">
          Commitments could not be loaded.{" "}
          <button onClick={() => void query.refetch()}>Retry</button>
        </p>
      )}
      {open &&
        query.data &&
        (Object.keys(labels) as Kind[]).map((kind) => (
          <ul key={kind} aria-label={kind} className="space-y-2">
            {query.data[kind].map((item) => (
              <li
                key={item.id}
                className="flex flex-wrap items-center justify-between gap-2 border-b py-2"
              >
                <span>{item.label}</span>
                <Button
                  variant="secondary"
                  onClick={() => setPending({ kind, item })}
                >
                  {labels[kind]}
                </Button>
              </li>
            ))}
          </ul>
        ))}
      {pending && (
        <Dialog
          open
          onOpenChange={(value) => {
            if (!value && !busy) setPending(null);
          }}
        >
          <DialogContent>
            <DialogTitle>
              {labels[pending.kind]}: {pending.item.label}?
            </DialogTitle>
            <DialogDescription>
              This uses the existing authorized flow and preserves history.
            </DialogDescription>
            {error && <p role="alert">{error}</p>}
            <Button disabled={busy} onClick={() => void confirm()}>
              Confirm
            </Button>{" "}
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => setPending(null)}
            >
              Keep unchanged
            </Button>
          </DialogContent>
        </Dialog>
      )}
    </section>
  );
}

// @ts-nocheck
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil } from "lucide-react";
import { EmptyState } from "../../../components/ui/coachos";
import { Skeleton } from "../../../components/ui/coachos/skeleton";
import { Button } from "../../../components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../../../components/ui/card";
import { useSessionAuth } from "../../../lib/auth";
import { supabase } from "../../../lib/supabase";
import { getSupabaseErrorMessage } from "../../../lib/supabase-errors";

type PtClientNotesTabProps = {
  clientId: string | null;
  workspaceId: string | null;
  enabled: boolean;
};

const getErrorMessage = (error: unknown) => getSupabaseErrorMessage(error);

const getFriendlyErrorMessage = () =>
  "Unable to load data right now. Please try again.";

const formatShortDateTime = (
  value: string | null | undefined,
  fallback = "Not scheduled",
) => {
  if (!value) return fallback;
  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

export function PtClientNotesTab({
  clientId,
  workspaceId,
  enabled,
}: PtClientNotesTabProps) {
  const { user } = useSessionAuth();
  const queryClient = useQueryClient();
  const [noteDraft, setNoteDraft] = useState("");
  const [noteStatus, setNoteStatus] = useState<"idle" | "saving" | "error">(
    "idle",
  );
  const [noteMessage, setNoteMessage] = useState<string | null>(null);

  const notesQuery = useQuery({
    queryKey: ["pt-client-notes", clientId, workspaceId],
    enabled: enabled && !!clientId && !!workspaceId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("coach_activity_log")
        .select("id, actor_user_id, created_at, metadata")
        .eq("client_id", clientId ?? "")
        .eq("workspace_id", workspaceId ?? "")
        .eq("action", "pt_note")
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data ?? [];
    },
  });

  const handleSaveNote = async () => {
    const trimmed = noteDraft.trim();
    if (!clientId || !workspaceId || !user?.id || trimmed.length === 0) return;
    setNoteStatus("saving");
    setNoteMessage(null);
    const { error } = await supabase.from("coach_activity_log").insert({
      client_id: clientId,
      workspace_id: workspaceId,
      actor_user_id: user.id,
      action: "pt_note",
      metadata: {
        note: trimmed,
        preview: trimmed.slice(0, 140),
      },
    });

    if (error) {
      setNoteStatus("error");
      setNoteMessage(getErrorMessage(error));
      return;
    }

    setNoteDraft("");
    setNoteStatus("idle");
    setNoteMessage("Note added.");
    await queryClient.invalidateQueries({
      queryKey: ["pt-client-notes", clientId, workspaceId],
    });
    await queryClient.invalidateQueries({
      queryKey: ["coach-activity-log", clientId, workspaceId],
    });
  };

  const notes = notesQuery.data ?? [];

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(280px,0.9fr)_minmax(0,1.1fr)]">
      <Card className="border-border/70 bg-card/80">
        <CardHeader>
          <CardTitle>Add note</CardTitle>
          <p className="text-sm text-muted-foreground">
            Capture coaching context, handoff details, or anything you want
            visible on this client over time.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <textarea
            className="min-h-[220px] w-full rounded-xl border border-border/60 bg-background/70 px-3 py-3 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            value={noteDraft}
            onChange={(event) => setNoteDraft(event.target.value)}
            placeholder="Add a coaching note about goals, communication, programming decisions, or anything that matters for the next PT touchpoint."
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button
              variant="secondary"
              disabled={
                noteStatus === "saving" || noteDraft.trim().length === 0
              }
              onClick={handleSaveNote}
            >
              {noteStatus === "saving" ? "Saving..." : "Add note"}
            </Button>
            {noteMessage ? (
              <span className="text-xs text-muted-foreground">
                {noteMessage}
              </span>
            ) : (
              <span className="text-xs text-muted-foreground">
                Notes are visible only inside this client workspace.
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/70 bg-card/80">
        <CardHeader>
          <CardTitle>Recent notes</CardTitle>
          <p className="text-sm text-muted-foreground">
            A running PT-side note trail for future planning and handoff.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          {notesQuery.isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : notesQuery.error ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              {getFriendlyErrorMessage()}
            </div>
          ) : notes.length > 0 ? (
            notes.map((note) => {
              const noteText =
                typeof note.metadata?.note === "string"
                  ? note.metadata.note
                  : typeof note.metadata?.preview === "string"
                    ? note.metadata.preview
                    : "No note body recorded.";
              return (
                <div
                  key={note.id}
                  className="rounded-2xl border border-border/60 bg-background/35 p-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-foreground">
                      {note.actor_user_id === user?.id ? "You" : "Coach note"}
                    </p>
                    <span className="text-xs text-muted-foreground">
                      {formatShortDateTime(note.created_at)}
                    </span>
                  </div>
                  <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
                    {noteText}
                  </p>
                </div>
              );
            })
          ) : (
            <EmptyState
              title="No PT notes yet"
              description="Use notes to capture coaching context, decision history, and anything another coach would need when they open this client."
              icon={<Pencil className="h-5 w-5" />}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

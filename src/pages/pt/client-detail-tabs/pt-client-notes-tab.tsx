// @ts-nocheck
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Trash2 } from "lucide-react";
import { EmptyState } from "../../../components/ui/coachos";
import { Skeleton } from "../../../components/ui/coachos/skeleton";
import { Button } from "../../../components/ui/button";
import { Textarea } from "../../../components/ui/textarea";
import { FieldCharacterMeta } from "../../../components/common/field-character-meta";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../../../components/ui/card";
import { useSessionAuth } from "../../../lib/auth";
import { supabase } from "../../../lib/supabase";
import { getSupabaseErrorMessage } from "../../../lib/supabase-errors";
import { getCharacterLimitState } from "../../../lib/character-limits";

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
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editingNoteDraft, setEditingNoteDraft] = useState("");
  const [noteActionStatus, setNoteActionStatus] = useState<
    "idle" | "saving" | "error"
  >("idle");
  const [noteActionMessage, setNoteActionMessage] = useState<string | null>(
    null,
  );
  const noteLimitState = getCharacterLimitState({
    value: noteDraft,
    kind: "default_text",
    fieldLabel: "Note",
  });
  const editingNoteLimitState = getCharacterLimitState({
    value: editingNoteDraft,
    kind: "default_text",
    fieldLabel: "Note",
  });

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
    if (noteLimitState.overLimit) {
      setNoteStatus("error");
      setNoteMessage(noteLimitState.errorText);
      return;
    }
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

  const handleEditNote = (note: {
    id: string;
    metadata?: { note?: unknown; preview?: unknown } | null;
  }) => {
    const noteText =
      typeof note.metadata?.note === "string"
        ? note.metadata.note
        : typeof note.metadata?.preview === "string"
          ? note.metadata.preview
          : "";
    setEditingNoteId(note.id);
    setEditingNoteDraft(noteText);
    setNoteActionMessage(null);
    setNoteActionStatus("idle");
  };

  const handleCancelEditNote = () => {
    setEditingNoteId(null);
    setEditingNoteDraft("");
    setNoteActionMessage(null);
    setNoteActionStatus("idle");
  };

  const handleSaveEditedNote = async (note: {
    id: string;
    metadata?: Record<string, unknown> | null;
  }) => {
    const trimmed = editingNoteDraft.trim();
    if (editingNoteLimitState.overLimit) {
      setNoteActionStatus("error");
      setNoteActionMessage(editingNoteLimitState.errorText);
      return;
    }
    if (!clientId || !workspaceId || !user?.id || trimmed.length === 0) return;
    setNoteActionStatus("saving");
    setNoteActionMessage(null);

    const metadata =
      note.metadata && typeof note.metadata === "object" ? note.metadata : {};
    const { error } = await supabase
      .from("coach_activity_log")
      .update({
        metadata: {
          ...metadata,
          note: trimmed,
          preview: trimmed.slice(0, 140),
          edited_at: new Date().toISOString(),
        },
      })
      .eq("id", note.id)
      .eq("client_id", clientId)
      .eq("workspace_id", workspaceId)
      .eq("action", "pt_note")
      .eq("actor_user_id", user.id);

    if (error) {
      setNoteActionStatus("error");
      setNoteActionMessage(getErrorMessage(error));
      return;
    }

    setEditingNoteId(null);
    setEditingNoteDraft("");
    setNoteActionStatus("idle");
    setNoteActionMessage("Note updated.");
    await queryClient.invalidateQueries({
      queryKey: ["pt-client-notes", clientId, workspaceId],
    });
    await queryClient.invalidateQueries({
      queryKey: ["coach-activity-log", clientId, workspaceId],
    });
  };

  const handleDeleteNote = async (noteId: string) => {
    if (!clientId || !workspaceId || !user?.id) return;
    const confirmed = window.confirm("Delete this note?");
    if (!confirmed) return;
    setNoteActionStatus("saving");
    setNoteActionMessage(null);

    const { error } = await supabase
      .from("coach_activity_log")
      .delete()
      .eq("id", noteId)
      .eq("client_id", clientId)
      .eq("workspace_id", workspaceId)
      .eq("action", "pt_note")
      .eq("actor_user_id", user.id);

    if (error) {
      setNoteActionStatus("error");
      setNoteActionMessage(getErrorMessage(error));
      return;
    }

    if (editingNoteId === noteId) {
      setEditingNoteId(null);
      setEditingNoteDraft("");
    }
    setNoteActionStatus("idle");
    setNoteActionMessage("Note deleted.");
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
          <Textarea
            isInvalid={noteLimitState.overLimit}
            className="min-h-[220px] bg-background/70"
            value={noteDraft}
            onChange={(event) => setNoteDraft(event.target.value)}
            placeholder="Add a coaching note about goals, communication, programming decisions, or anything that matters for the next PT touchpoint."
          />
          <FieldCharacterMeta
            count={noteLimitState.count}
            limit={noteLimitState.limit}
            errorText={noteLimitState.errorText}
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button
              variant="secondary"
              disabled={
                noteStatus === "saving" ||
                noteDraft.trim().length === 0 ||
                noteLimitState.overLimit
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
          {noteActionMessage ? (
            <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
              {noteActionMessage}
            </div>
          ) : null}
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
              const canManageNote = note.actor_user_id === user?.id;
              const isEditing = editingNoteId === note.id;
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
                  {isEditing ? (
                    <div className="mt-3 space-y-2">
                      <Textarea
                        isInvalid={editingNoteLimitState.overLimit}
                        className="min-h-[120px] bg-background/70"
                        value={editingNoteDraft}
                        onChange={(event) =>
                          setEditingNoteDraft(event.target.value)
                        }
                      />
                      <FieldCharacterMeta
                        count={editingNoteLimitState.count}
                        limit={editingNoteLimitState.limit}
                        errorText={editingNoteLimitState.errorText}
                      />
                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={
                            noteActionStatus === "saving" ||
                            editingNoteDraft.trim().length === 0 ||
                            editingNoteLimitState.overLimit
                          }
                          onClick={() => handleSaveEditedNote(note)}
                        >
                          {noteActionStatus === "saving"
                            ? "Saving..."
                            : "Save changes"}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={handleCancelEditNote}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
                      {noteText}
                    </p>
                  )}
                  {canManageNote && !isEditing ? (
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label="Edit note"
                        onClick={() => handleEditNote(note)}
                      >
                        <Pencil className="mr-1 h-3.5 w-3.5" />
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive hover:text-destructive"
                        aria-label="Delete note"
                        disabled={noteActionStatus === "saving"}
                        onClick={() => handleDeleteNote(note.id)}
                      >
                        <Trash2 className="mr-1 h-3.5 w-3.5" />
                        Delete
                      </Button>
                    </div>
                  ) : null}
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

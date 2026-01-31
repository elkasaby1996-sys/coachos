import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, AlertDescription, AlertTitle } from "../../components/ui/alert";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";
import { Input } from "../../components/ui/input";
import { Skeleton } from "../../components/ui/skeleton";
import { useAuth } from "../../lib/auth";
import { supabase } from "../../lib/supabase";
import { getWorkspaceIdForUser } from "../../lib/workspace";

type MarkerTemplate = {
  id: string;
  workspace_id: string | null;
  name: string | null;
  value_type: "number" | "text" | null;
  unit_label: string | null;
  help_text: string | null;
  sort_order: number | null;
  is_active: boolean | null;
  created_at: string | null;
};

type MarkerFormState = {
  name: string;
  value_type: "number" | "text";
  unit_label: string;
  help_text: string;
  sort_order: string;
  is_active: boolean;
};

type ErrorDetails = {
  code?: string | null;
  message?: string | null;
};

const emptyForm: MarkerFormState = {
  name: "",
  value_type: "number",
  unit_label: "",
  help_text: "",
  sort_order: "10",
  is_active: true,
};

const getSupabaseErrorDetails = (error: unknown): ErrorDetails => {
  if (!error) return { code: null, message: "Something went wrong." };
  if (typeof error === "string") return { code: null, message: error };
  if (error instanceof Error) {
    const err = error as Error & { code?: string | null };
    return { code: err.code ?? null, message: err.message ?? "Something went wrong." };
  }
  if (typeof error === "object") {
    const err = error as { code?: string | null; message?: string | null; details?: string | null };
    return {
      code: err.code ?? null,
      message: err.message ?? err.details ?? "Something went wrong.",
    };
  }
  return { code: null, message: "Something went wrong." };
};

const normalizeSortOrder = (value: string) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 10;
  return Math.max(0, Math.round(parsed));
};

export function PtBaselineTemplatesPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [formState, setFormState] = useState<MarkerFormState>(emptyForm);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving">("idle");
  const [inlineError, setInlineError] = useState<ErrorDetails | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [statusVariant, setStatusVariant] = useState<"success" | "error">("success");

  useEffect(() => {
    if (!statusMessage) return;
    const timer = window.setTimeout(() => setStatusMessage(null), 3000);
    return () => window.clearTimeout(timer);
  }, [statusMessage]);

  const workspaceQuery = useQuery({
    queryKey: ["pt-workspace", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const workspaceId = await getWorkspaceIdForUser(user?.id ?? "");
      if (!workspaceId) throw new Error("Workspace not found for this PT.");
      return workspaceId;
    },
  });

  const workspaceId = workspaceQuery.data ?? null;

  const templatesQuery = useQuery({
    queryKey: ["baseline_marker_templates", workspaceId],
    enabled: !!workspaceId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("baseline_marker_templates")
        .select("id, workspace_id, name, value_type, unit_label, help_text, sort_order, is_active, created_at")
        .eq("workspace_id", workspaceId ?? "")
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as MarkerTemplate[];
    },
  });

  const templates = templatesQuery.data ?? [];

  const maxSortOrder = useMemo(() => {
    if (!templates.length) return 0;
    return templates.reduce((max, item) => Math.max(max, item.sort_order ?? 0), 0);
  }, [templates]);

  const invalidateTemplates = async () => {
    if (!workspaceId) return;
    await queryClient.invalidateQueries({
      queryKey: ["baseline_marker_templates", workspaceId],
    });
    await queryClient.invalidateQueries({
      queryKey: ["baseline-marker-templates", workspaceId],
    });
  };

  const openCreateDialog = () => {
    setEditId(null);
    setFormState({
      ...emptyForm,
      sort_order: String(maxSortOrder ? maxSortOrder + 10 : 10),
    });
    setInlineError(null);
    setDialogOpen(true);
  };

  const openEditDialog = (template: MarkerTemplate) => {
    setEditId(template.id);
    setFormState({
      name: template.name ?? "",
      value_type: template.value_type ?? "number",
      unit_label: template.unit_label ?? "",
      help_text: template.help_text ?? "",
      sort_order: String(template.sort_order ?? 10),
      is_active: template.is_active ?? true,
    });
    setInlineError(null);
    setDialogOpen(true);
  };

  const handleSaveTemplate = async () => {
    if (!workspaceId || !user?.id) return;
    if (!formState.name.trim()) {
      setInlineError({ code: "validation", message: "Name is required." });
      return;
    }
    setSaveStatus("saving");
    setInlineError(null);

    const payload = {
      name: formState.name.trim(),
      value_type: formState.value_type,
      unit_label: formState.unit_label.trim() || null,
      help_text: formState.help_text.trim() || null,
      sort_order: normalizeSortOrder(formState.sort_order),
      is_active: formState.is_active,
    };

    if (editId) {
      const { error } = await supabase
        .from("baseline_marker_templates")
        .update(payload)
        .eq("id", editId)
        .eq("workspace_id", workspaceId);
      if (error) {
        setInlineError(getSupabaseErrorDetails(error));
        setSaveStatus("idle");
        return;
      }
      setStatusVariant("success");
      setStatusMessage("Template updated.");
    } else {
      const { error } = await supabase.from("baseline_marker_templates").insert({
        workspace_id: workspaceId,
        ...payload,
        created_by_user_id: user.id,
      });
      if (error) {
        setInlineError(getSupabaseErrorDetails(error));
        setSaveStatus("idle");
        return;
      }
      setStatusVariant("success");
      setStatusMessage("Template created.");
    }

    setSaveStatus("idle");
    setDialogOpen(false);
    await invalidateTemplates();
  };

  const handleToggleActive = async (template: MarkerTemplate) => {
    if (!workspaceId) return;
    const nextValue = !(template.is_active ?? true);
    const { error } = await supabase
      .from("baseline_marker_templates")
      .update({ is_active: nextValue })
      .eq("id", template.id)
      .eq("workspace_id", workspaceId);
    if (error) {
      setStatusVariant("error");
      setStatusMessage(null);
      setInlineError(getSupabaseErrorDetails(error));
      return;
    }
    setStatusVariant("success");
    setStatusMessage(nextValue ? "Template enabled." : "Template disabled.");
    await invalidateTemplates();
  };

  const normalizeOrder = async () => {
    if (!workspaceId || templates.length === 0) return;
    const ordered = [...templates].sort((a, b) => {
      const orderA = a.sort_order ?? 0;
      const orderB = b.sort_order ?? 0;
      if (orderA !== orderB) return orderA - orderB;
      return new Date(a.created_at ?? 0).getTime() - new Date(b.created_at ?? 0).getTime();
    });
    const updates = ordered.map((item, index) => ({
      id: item.id,
      sort_order: (index + 1) * 10,
    }));
    for (const update of updates) {
      const { error } = await supabase
        .from("baseline_marker_templates")
        .update({ sort_order: update.sort_order })
        .eq("id", update.id)
        .eq("workspace_id", workspaceId);
      if (error) {
        setInlineError(getSupabaseErrorDetails(error));
        return;
      }
    }
    await invalidateTemplates();
  };

  const handleMove = async (template: MarkerTemplate, direction: "up" | "down") => {
    if (!workspaceId) return;
    const ordered = [...templates];
    const index = ordered.findIndex((item) => item.id === template.id);
    if (index === -1) return;
    const swapIndex = direction === "up" ? index - 1 : index + 1;
    if (swapIndex < 0 || swapIndex >= ordered.length) return;
    const target = ordered[swapIndex];
    const currentOrder = template.sort_order ?? 0;
    const targetOrder = target.sort_order ?? 0;

    if (currentOrder === targetOrder) {
      await normalizeOrder();
      return;
    }

    const { error: firstError } = await supabase
      .from("baseline_marker_templates")
      .update({ sort_order: targetOrder })
      .eq("id", template.id)
      .eq("workspace_id", workspaceId);
    if (firstError) {
      setInlineError(getSupabaseErrorDetails(firstError));
      return;
    }

    const { error: secondError } = await supabase
      .from("baseline_marker_templates")
      .update({ sort_order: currentOrder })
      .eq("id", target.id)
      .eq("workspace_id", workspaceId);
    if (secondError) {
      setInlineError(getSupabaseErrorDetails(secondError));
      return;
    }

    setStatusVariant("success");
    setStatusMessage("Order updated.");
    await invalidateTemplates();
  };

  const handleDelete = async (template: MarkerTemplate) => {
    if (!workspaceId) return;
    const confirmed = window.confirm(
      `Delete "${template.name ?? "template"}"? This cannot be undone.`
    );
    if (!confirmed) return;
    const { error } = await supabase
      .from("baseline_marker_templates")
      .delete()
      .eq("id", template.id)
      .eq("workspace_id", workspaceId);
    if (error) {
      setInlineError(getSupabaseErrorDetails(error));
      return;
    }
    setStatusVariant("success");
    setStatusMessage("Template deleted.");
    await invalidateTemplates();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Baseline templates</h2>
          <p className="text-sm text-muted-foreground">
            Create the performance markers clients will log during baseline.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild variant="secondary" size="sm">
            <Link to="/pt/settings">Back to settings</Link>
          </Button>
          <Button size="sm" onClick={openCreateDialog}>
            New template
          </Button>
        </div>
      </div>

      {statusMessage ? (
        <Alert className={statusVariant === "error" ? "border-danger/30" : "border-emerald-200"}>
          <AlertTitle>{statusVariant === "error" ? "Error" : "Saved"}</AlertTitle>
          <AlertDescription>{statusMessage}</AlertDescription>
        </Alert>
      ) : null}

      {inlineError ? (
        <Alert className="border-danger/30">
          <AlertTitle>Supabase error</AlertTitle>
          <AlertDescription>
            <div className="space-y-1 text-xs text-muted-foreground">
              <div>code: {inlineError.code ?? "n/a"}</div>
              <div>message: {inlineError.message ?? "n/a"}</div>
            </div>
          </AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Templates</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {workspaceQuery.isLoading || templatesQuery.isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : templatesQuery.error ? (
            <Alert className="border-danger/30">
              <AlertTitle>Supabase error</AlertTitle>
              <AlertDescription>
                <div className="space-y-1 text-xs text-muted-foreground">
                  <div>code: {getSupabaseErrorDetails(templatesQuery.error).code ?? "n/a"}</div>
                  <div>
                    message: {getSupabaseErrorDetails(templatesQuery.error).message ?? "n/a"}
                  </div>
                </div>
              </AlertDescription>
            </Alert>
          ) : templates.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border bg-muted/30 p-4 text-sm text-muted-foreground">
              No templates yet. Add your first baseline marker (e.g., Bench 1RM, Pull-ups reps).
            </div>
          ) : (
            <div className="space-y-3">
              {templates.map((template, index) => (
                <div
                  key={template.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-background p-3"
                >
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold">{template.name ?? "Template"}</p>
                      <Badge variant="muted">
                        {(template.value_type ?? "number") === "number" ? "Number" : "Text"}
                      </Badge>
                      {template.unit_label ? (
                        <Badge variant="default">{template.unit_label}</Badge>
                      ) : null}
                      {!template.is_active ? <Badge variant="warning">Inactive</Badge> : null}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Unit: {template.unit_label ?? "—"} · Order: {template.sort_order ?? "—"}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>Active</span>
                      <input
                        type="checkbox"
                        checked={template.is_active ?? false}
                        onChange={() => handleToggleActive(template)}
                        className="h-4 w-4 rounded border-border"
                        aria-label={`Toggle ${template.name ?? "template"} active`}
                      />
                    </label>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={index === 0}
                      onClick={() => handleMove(template, "up")}
                    >
                      Move up
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={index === templates.length - 1}
                      onClick={() => handleMove(template, "down")}
                    >
                      Move down
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => openEditDialog(template)}>
                      Edit
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => handleDelete(template)}>
                      Delete
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[560px]">
          <DialogHeader>
            <DialogTitle>{editId ? "Edit template" : "New template"}</DialogTitle>
            <DialogDescription>
              Configure the baseline marker clients will log.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <label className="text-xs font-semibold text-muted-foreground">Name *</label>
              <Input
                value={formState.name}
                onChange={(event) =>
                  setFormState((prev) => ({ ...prev, name: event.target.value }))
                }
                placeholder="Bench Press 1RM"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-semibold text-muted-foreground">Value type</label>
              <select
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={formState.value_type}
                onChange={(event) =>
                  setFormState((prev) => ({
                    ...prev,
                    value_type: event.target.value as "number" | "text",
                  }))
                }
              >
                <option value="number">Number</option>
                <option value="text">Text</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-semibold text-muted-foreground">Unit label</label>
              <Input
                value={formState.unit_label}
                onChange={(event) =>
                  setFormState((prev) => ({ ...prev, unit_label: event.target.value }))
                }
                placeholder="kg, reps, min"
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <label className="text-xs font-semibold text-muted-foreground">Help text</label>
              <textarea
                className="min-h-[96px] w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={formState.help_text}
                onChange={(event) =>
                  setFormState((prev) => ({ ...prev, help_text: event.target.value }))
                }
                placeholder="Instructions for clients"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-semibold text-muted-foreground">Sort order</label>
              <Input
                type="number"
                min="0"
                value={formState.sort_order}
                onChange={(event) =>
                  setFormState((prev) => ({ ...prev, sort_order: event.target.value }))
                }
              />
            </div>
            <div className="flex items-center gap-2 sm:col-span-2">
              <input
                id="template-active"
                type="checkbox"
                className="h-4 w-4 rounded border-border"
                checked={formState.is_active}
                onChange={(event) =>
                  setFormState((prev) => ({ ...prev, is_active: event.target.checked }))
                }
              />
              <label htmlFor="template-active" className="text-sm text-muted-foreground">
                Active
              </label>
            </div>
            {inlineError ? (
              <Alert className="border-danger/30 sm:col-span-2">
                <AlertTitle>Supabase error</AlertTitle>
                <AlertDescription>
                  <div className="space-y-1 text-xs text-muted-foreground">
                    <div>code: {inlineError.code ?? "n/a"}</div>
                    <div>message: {inlineError.message ?? "n/a"}</div>
                  </div>
                </AlertDescription>
              </Alert>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveTemplate} disabled={saveStatus === "saving"}>
              {saveStatus === "saving" ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

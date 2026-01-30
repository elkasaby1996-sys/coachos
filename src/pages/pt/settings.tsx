import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { Badge } from "../../components/ui/badge";
import { Skeleton } from "../../components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "../../components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";
import { useAuth } from "../../lib/auth";
import { supabase } from "../../lib/supabase";
import { getWorkspaceIdForUser } from "../../lib/workspace";

type MarkerTemplate = {
  id: string;
  workspace_id: string | null;
  name: string | null;
  unit: string | null;
  value_type: "number" | "text" | null;
  sort_order: number | null;
  is_active: boolean | null;
  created_at: string | null;
  created_by_user_id: string | null;
};

type MarkerFormState = {
  name: string;
  unit: string;
  value_type: "number" | "text";
  is_active: boolean;
};

const emptyForm: MarkerFormState = {
  name: "",
  unit: "",
  value_type: "number",
  is_active: true,
};

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "Something went wrong.";

export function PtSettingsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastVariant, setToastVariant] = useState<"success" | "error">("success");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [formState, setFormState] = useState<MarkerFormState>(emptyForm);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving">("idle");
  const [inlineError, setInlineError] = useState<string | null>(null);

  useEffect(() => {
    if (!toastMessage) return;
    const timer = window.setTimeout(() => setToastMessage(null), 3000);
    return () => window.clearTimeout(timer);
  }, [toastMessage]);

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
        .select("*")
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

  const openCreateDialog = () => {
    setEditId(null);
    setFormState(emptyForm);
    setInlineError(null);
    setDialogOpen(true);
  };

  const openEditDialog = (template: MarkerTemplate) => {
    setEditId(template.id);
    setFormState({
      name: template.name ?? "",
      unit: template.unit ?? "",
      value_type: template.value_type ?? "number",
      is_active: template.is_active ?? true,
    });
    setInlineError(null);
    setDialogOpen(true);
  };

  const invalidateTemplates = async () => {
    if (!workspaceId) return;
    await queryClient.invalidateQueries({
      queryKey: ["baseline_marker_templates", workspaceId],
    });
    await queryClient.invalidateQueries({
      queryKey: ["baseline-marker-templates", workspaceId],
    });
  };

  const handleSaveTemplate = async () => {
    if (!workspaceId || !user?.id) return;
    if (!formState.name.trim()) {
      setInlineError("Name is required.");
      return;
    }
    setSaveStatus("saving");
    setInlineError(null);

    if (editId) {
      const { error } = await supabase
        .from("baseline_marker_templates")
        .update({
          name: formState.name.trim(),
          unit: formState.unit.trim() || null,
          value_type: formState.value_type,
          is_active: formState.is_active,
        })
        .eq("id", editId)
        .eq("workspace_id", workspaceId);
      if (error) {
        setToastVariant("error");
        setToastMessage(error.message ?? "Failed to update marker.");
        setSaveStatus("idle");
        return;
      }
      setToastVariant("success");
      setToastMessage("Marker updated.");
    } else {
      const sortOrder = maxSortOrder + 10;
      const { error } = await supabase
        .from("baseline_marker_templates")
        .insert({
          workspace_id: workspaceId,
          name: formState.name.trim(),
          unit: formState.unit.trim() || null,
          value_type: formState.value_type,
          sort_order: sortOrder,
          is_active: formState.is_active,
          created_by_user_id: user.id,
        });
      if (error) {
        setToastVariant("error");
        setToastMessage(error.message ?? "Failed to create marker.");
        setSaveStatus("idle");
        return;
      }
      setToastVariant("success");
      setToastMessage("Marker created.");
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
      setToastVariant("error");
      setToastMessage(error.message ?? "Failed to update status.");
      return;
    }
    setToastVariant("success");
    setToastMessage(nextValue ? "Marker enabled." : "Marker disabled.");
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
        setToastVariant("error");
        setToastMessage(error.message ?? "Failed to normalize order.");
        return;
      }
    }
    setToastVariant("success");
    setToastMessage("Order normalized.");
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
      setToastVariant("error");
      setToastMessage(firstError.message ?? "Failed to reorder markers.");
      return;
    }

    const { error: secondError } = await supabase
      .from("baseline_marker_templates")
      .update({ sort_order: currentOrder })
      .eq("id", target.id)
      .eq("workspace_id", workspaceId);
    if (secondError) {
      setToastVariant("error");
      setToastMessage(secondError.message ?? "Failed to reorder markers.");
      return;
    }

    setToastVariant("success");
    setToastMessage("Order updated.");
    await invalidateTemplates();
  };

  const handleSoftDelete = async (template: MarkerTemplate) => {
    if (!workspaceId) return;
    const confirmed = window.confirm(
      `Disable "${template.name ?? "marker"}"? This will hide it from clients.`
    );
    if (!confirmed) return;
    const { error } = await supabase
      .from("baseline_marker_templates")
      .update({ is_active: false })
      .eq("id", template.id)
      .eq("workspace_id", workspaceId);
    if (error) {
      setToastVariant("error");
      setToastMessage(error.message ?? "Failed to disable marker.");
      return;
    }
    setToastVariant("success");
    setToastMessage("Marker disabled.");
    await invalidateTemplates();
  };

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Settings</h2>
        <p className="text-sm text-muted-foreground">Manage workspace branding and account access.</p>
      </div>

      {toastMessage ? (
        <Alert className={toastVariant === "error" ? "border-danger/30" : "border-emerald-200"}>
          <AlertTitle>{toastVariant === "error" ? "Error" : "Saved"}</AlertTitle>
          <AlertDescription>{toastMessage}</AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle>Workspace branding</CardTitle>
            <p className="text-sm text-muted-foreground">
              Customize the workspace name and logo shown to clients.
            </p>
          </div>
          <Button variant="secondary" size="sm">
            Upload logo
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input defaultValue="Velocity PT Lab" />
          <div className="rounded-lg border border-dashed border-border bg-muted/40 p-6 text-center text-xs text-muted-foreground">
            Logo placeholder
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
          <p className="text-sm text-muted-foreground">Signed in as coach@velocitylab.com</p>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium">Email</p>
            <p className="text-xs text-muted-foreground">coach@velocitylab.com</p>
          </div>
          <Button variant="secondary" size="sm">
            Change password
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Subscription</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Subscription management will be available in a future update.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Danger zone</CardTitle>
          <p className="text-sm text-muted-foreground">Log out of this workspace.</p>
        </CardHeader>
        <CardContent>
          <Button variant="secondary">Logout</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle>Performance Markers</CardTitle>
            <p className="text-sm text-muted-foreground">
              Manage baseline performance markers shown to clients.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" size="sm" onClick={normalizeOrder}>
              Normalize order
            </Button>
            <Button size="sm" onClick={openCreateDialog}>
              Add marker
            </Button>
          </div>
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
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>{getErrorMessage(templatesQuery.error)}</AlertDescription>
            </Alert>
          ) : templates.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border bg-muted/30 p-4 text-sm text-muted-foreground">
              No markers yet. Add your first marker (e.g., Bench 1RM, Pull-ups reps).
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
                      <p className="text-sm font-semibold">{template.name ?? "Marker"}</p>
                      <Badge variant="muted">
                        {(template.value_type ?? "number") === "number" ? "Number" : "Text"}
                      </Badge>
                      {template.unit ? (
                        <Badge variant="default">{template.unit}</Badge>
                      ) : null}
                      {!template.is_active ? (
                        <Badge variant="warning">Inactive</Badge>
                      ) : null}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Order: {template.sort_order ?? "—"}
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
                        aria-label={`Toggle ${template.name ?? "marker"} active`}
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
                    <Button size="sm" variant="secondary" onClick={() => handleSoftDelete(template)}>
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
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>{editId ? "Edit marker" : "New marker"}</DialogTitle>
            <DialogDescription>
              Configure the performance marker your clients will log.
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
              <label className="text-xs font-semibold text-muted-foreground">Unit</label>
              <Input
                value={formState.unit}
                onChange={(event) =>
                  setFormState((prev) => ({ ...prev, unit: event.target.value }))
                }
                placeholder="kg, reps, min"
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
            <div className="flex items-center gap-2 sm:col-span-2">
              <input
                id="marker-active"
                type="checkbox"
                className="h-4 w-4 rounded border-border"
                checked={formState.is_active}
                onChange={(event) =>
                  setFormState((prev) => ({ ...prev, is_active: event.target.checked }))
                }
              />
              <label htmlFor="marker-active" className="text-sm text-muted-foreground">
                Active
              </label>
            </div>
            {inlineError ? (
              <Alert className="border-danger/30 sm:col-span-2">
                <AlertTitle>Error</AlertTitle>
                <AlertDescription>{inlineError}</AlertDescription>
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

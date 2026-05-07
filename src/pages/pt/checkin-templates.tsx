import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowDown,
  ArrowUp,
  Copy,
  GripVertical,
  LayoutTemplate,
  Lock,
  Plus,
  Sparkles,
  Trash2,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "../../components/ui/alert";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Switch } from "../../components/ui/switch";
import {
  DashboardCard,
  EmptyState,
  Skeleton,
  StatusPill,
} from "../../components/ui/coachos";
import { WorkspacePageHeader } from "../../components/pt/workspace-page-header";
import { supabase } from "../../lib/supabase";
import { safeSelect } from "../../lib/supabase-safe";
import { cn } from "../../lib/utils";
import { useWorkspace } from "../../lib/use-workspace";
import {
  checkinQuestionTypeOptions,
  createEmptyCheckinQuestionDraft,
  formatDuplicateTemplateName,
  getCheckinQuestionOptions,
  mapCheckinQuestionToDraft,
  normalizeCheckinChoiceOptions,
  type CheckinQuestionDraft,
  type CheckinQuestionLike,
  type SupportedCheckinQuestionType,
  validateCheckinQuestionDraft,
} from "../../lib/checkin-template";

type CheckinTemplateRow = {
  id: string;
  name: string | null;
  description: string | null;
  is_active: boolean | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type CheckinQuestionRow = CheckinQuestionLike & {
  id: string;
  template_id: string;
};

type TemplateEditorState = {
  sourceTemplateId: string | null;
  name: string;
  description: string;
  isActive: boolean;
  questions: CheckinQuestionDraft[];
};

type TemplateUsage = {
  assignedClientCount: number;
  totalCheckinCount: number;
  submittedCheckinCount: number;
  isWorkspaceDefault: boolean;
};

const templateStatusMap = {
  active: { label: "Active", variant: "success" },
  inactive: { label: "Inactive", variant: "muted" },
} as const;

const requiredStatusMap = {
  required: { label: "Required", variant: "warning" },
  optional: { label: "Optional", variant: "muted" },
} as const;

const emptyTemplateEditor = (): TemplateEditorState => ({
  sourceTemplateId: null,
  name: "",
  description: "",
  isActive: true,
  questions: [createEmptyCheckinQuestionDraft(0)],
});

const normalizeQuestionSignature = (questions: CheckinQuestionDraft[]) =>
  JSON.stringify(
    questions.map((question, index) => ({
      questionText: question.questionText.trim(),
      helpText: question.helpText.trim(),
      type: question.type,
      isRequired: question.isRequired,
      options:
        question.type === "choice"
          ? normalizeCheckinChoiceOptions(question.options)
          : getCheckinQuestionOptions({ type: question.type, options: [] }),
      order: index,
    })),
  );

function buildEditorFromTemplate(
  template: CheckinTemplateRow,
  questions: CheckinQuestionRow[],
) {
  return {
    sourceTemplateId: template.id,
    name: template.name ?? "",
    description: template.description ?? "",
    isActive: template.is_active !== false,
    questions:
      questions.length > 0
        ? questions.map((question, index) =>
            mapCheckinQuestionToDraft(question, index),
          )
        : [createEmptyCheckinQuestionDraft(0)],
  };
}

export function PtCheckinTemplatesPage() {
  const {
    workspaceId,
    loading: workspaceLoading,
    error: workspaceError,
  } = useWorkspace();
  const queryClient = useQueryClient();
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(
    null,
  );
  const [creatingNewTemplate, setCreatingNewTemplate] = useState(false);
  const [editor, setEditor] =
    useState<TemplateEditorState>(emptyTemplateEditor);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastVariant, setToastVariant] = useState<"success" | "error">(
    "success",
  );
  const [saveState, setSaveState] = useState<"idle" | "saving" | "duplicating">(
    "idle",
  );

  useEffect(() => {
    if (!toastMessage) return;
    const timeout = setTimeout(() => setToastMessage(null), 2400);
    return () => clearTimeout(timeout);
  }, [toastMessage]);

  const workspaceDetailsQuery = useQuery({
    queryKey: ["pt-checkin-template-workspace", workspaceId],
    enabled: !!workspaceId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workspaces")
        .select("id, default_checkin_template_id")
        .eq("id", workspaceId ?? "")
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as {
        id: string;
        default_checkin_template_id: string | null;
      } | null;
    },
  });

  const templatesQuery = useQuery({
    queryKey: ["pt-checkin-templates", workspaceId],
    enabled: !!workspaceId,
    queryFn: async () => {
      const { data, error } = await safeSelect<CheckinTemplateRow>({
        table: "checkin_templates",
        columns:
          "id, workspace_id, name, description, is_active, created_at, updated_at",
        fallbackColumns:
          "id, workspace_id, name, description, is_active, created_at",
        filter: (query) =>
          query
            .eq("workspace_id", workspaceId ?? "")
            .order("is_active", { ascending: false })
            .order("updated_at", { ascending: false }),
      });
      if (error) throw error;
      return (data ?? []) as CheckinTemplateRow[];
    },
  });

  const templateRows = useMemo(
    () => templatesQuery.data ?? [],
    [templatesQuery.data],
  );
  const templateIds = useMemo(
    () => templateRows.map((template) => template.id),
    [templateRows],
  );
  const selectedTemplate =
    templateRows.find((template) => template.id === selectedTemplateId) ?? null;

  const questionsQuery = useQuery({
    queryKey: ["pt-checkin-template-questions", selectedTemplateId],
    enabled: !!selectedTemplateId,
    queryFn: async () => {
      const { data, error } = await safeSelect<CheckinQuestionRow>({
        table: "checkin_questions",
        columns:
          "id, template_id, question_text, prompt, type, options, is_required, sort_order, position",
        fallbackColumns:
          "id, template_id, question_text, prompt, is_required, sort_order, position",
        filter: (query) =>
          query
            .eq("template_id", selectedTemplateId ?? "")
            .order("sort_order", { ascending: true })
            .order("position", { ascending: true }),
      });
      if (error) throw error;
      return (data ?? []) as CheckinQuestionRow[];
    },
  });

  const selectedQuestions = useMemo(() => {
    const rows = questionsQuery.data ?? [];
    return [...rows].sort((a, b) => {
      const aOrder = a.sort_order ?? a.position ?? 0;
      const bOrder = b.sort_order ?? b.position ?? 0;
      return aOrder - bOrder;
    });
  }, [questionsQuery.data]);

  const clientAssignmentsQuery = useQuery({
    queryKey: ["pt-checkin-template-client-assignments", workspaceId],
    enabled: !!workspaceId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, checkin_template_id")
        .eq("workspace_id", workspaceId ?? "");
      if (error) throw error;
      return (data ?? []) as Array<{
        id: string;
        checkin_template_id: string | null;
      }>;
    },
  });

  const checkinUsageQuery = useQuery({
    queryKey: ["pt-checkin-template-checkins", templateIds],
    enabled: templateIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("checkins")
        .select("template_id, submitted_at")
        .in("template_id", templateIds);
      if (error) throw error;
      return (data ?? []) as Array<{
        template_id: string | null;
        submitted_at: string | null;
      }>;
    },
  });

  const usageByTemplateId = useMemo(() => {
    const map = new Map<string, TemplateUsage>();

    templateRows.forEach((template) => {
      map.set(template.id, {
        assignedClientCount: 0,
        totalCheckinCount: 0,
        submittedCheckinCount: 0,
        isWorkspaceDefault:
          template.id ===
          workspaceDetailsQuery.data?.default_checkin_template_id,
      });
    });

    (clientAssignmentsQuery.data ?? []).forEach((client) => {
      if (!client.checkin_template_id) return;
      const current = map.get(client.checkin_template_id);
      if (!current) return;
      current.assignedClientCount += 1;
    });

    (checkinUsageQuery.data ?? []).forEach((checkin) => {
      if (!checkin.template_id) return;
      const current = map.get(checkin.template_id);
      if (!current) return;
      current.totalCheckinCount += 1;
      if (checkin.submitted_at) {
        current.submittedCheckinCount += 1;
      }
    });

    return map;
  }, [
    checkinUsageQuery.data,
    clientAssignmentsQuery.data,
    templateRows,
    workspaceDetailsQuery.data?.default_checkin_template_id,
  ]);

  useEffect(() => {
    if (workspaceLoading || templatesQuery.isLoading) return;
    if (creatingNewTemplate) return;
    if (selectedTemplateId) return;
    if (templateRows.length === 0) return;
    setSelectedTemplateId(templateRows[0]!.id);
  }, [
    creatingNewTemplate,
    selectedTemplateId,
    templateRows,
    templatesQuery.isLoading,
    workspaceLoading,
  ]);

  useEffect(() => {
    if (!selectedTemplate || questionsQuery.isLoading) return;
    setEditor(buildEditorFromTemplate(selectedTemplate, selectedQuestions));
  }, [questionsQuery.isLoading, selectedQuestions, selectedTemplate]);

  const selectedTemplateUsage = selectedTemplateId
    ? (usageByTemplateId.get(selectedTemplateId) ?? null)
    : null;

  const structuralEditsLocked = Boolean(
    selectedTemplateUsage &&
    (selectedTemplateUsage.isWorkspaceDefault ||
      selectedTemplateUsage.assignedClientCount > 0 ||
      selectedTemplateUsage.totalCheckinCount > 0),
  );

  const originalQuestionSignature = useMemo(
    () =>
      selectedTemplate
        ? normalizeQuestionSignature(
            selectedQuestions.map((question, index) =>
              mapCheckinQuestionToDraft(question, index),
            ),
          )
        : "[]",
    [selectedQuestions, selectedTemplate],
  );

  const editorQuestionSignature = useMemo(
    () => normalizeQuestionSignature(editor.questions),
    [editor.questions],
  );

  const metadataChanged = Boolean(
    selectedTemplate &&
    (editor.name.trim() !== (selectedTemplate.name ?? "").trim() ||
      editor.description.trim() !==
        (selectedTemplate.description ?? "").trim() ||
      editor.isActive !== (selectedTemplate.is_active !== false)),
  );

  const structuralChanges = selectedTemplate
    ? originalQuestionSignature !== editorQuestionSignature
    : editor.name.trim().length > 0 ||
      editor.description.trim().length > 0 ||
      editor.questions.some(
        (question) =>
          question.questionText.trim().length > 0 ||
          question.helpText.trim().length > 0 ||
          question.type !== "text" ||
          question.isRequired ||
          normalizeCheckinChoiceOptions(question.options).length > 0,
      );

  const hasUnsavedChanges = selectedTemplate
    ? metadataChanged || structuralChanges
    : structuralChanges;

  const saveLabel =
    saveState === "saving"
      ? "Saving..."
      : selectedTemplate && structuralChanges && structuralEditsLocked
        ? "Save as new version"
        : selectedTemplate
          ? "Save template"
          : "Create template";

  const activeTemplateCount = templateRows.filter(
    (template) => template.is_active !== false,
  ).length;

  const updateEditor = (
    updater: (current: TemplateEditorState) => TemplateEditorState,
  ) => {
    setEditor((current) => updater(current));
  };

  const setQuestionDraft = (
    questionId: string,
    updater: (question: CheckinQuestionDraft) => CheckinQuestionDraft,
  ) => {
    updateEditor((current) => ({
      ...current,
      questions: current.questions.map((question) =>
        question.id === questionId ? updater(question) : question,
      ),
    }));
  };

  const syncTemplateQueries = async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: ["pt-checkin-templates", workspaceId],
      }),
      queryClient.invalidateQueries({
        queryKey: ["pt-checkin-template-workspace", workspaceId],
      }),
      queryClient.invalidateQueries({
        queryKey: ["pt-checkin-template-client-assignments", workspaceId],
      }),
      queryClient.invalidateQueries({
        queryKey: ["pt-checkin-template-checkins"],
      }),
      queryClient.invalidateQueries({
        queryKey: ["pt-settings-checkin-templates", workspaceId],
      }),
      queryClient.invalidateQueries({
        queryKey: ["client-checkin-latest-template", workspaceId],
      }),
    ]);
  };

  const buildQuestionRows = (
    templateId: string,
    questions: CheckinQuestionDraft[],
  ) =>
    questions.map((question, index) => {
      const options =
        question.type === "choice"
          ? normalizeCheckinChoiceOptions(question.options)
          : question.type === "yes_no"
            ? ["Yes", "No"]
            : [];
      return {
        id: question.id,
        template_id: templateId,
        sort_order: (index + 1) * 10,
        position: (index + 1) * 10,
        type: question.type,
        question_text: question.questionText.trim(),
        prompt: question.helpText.trim(),
        is_required: question.isRequired,
        options,
      };
    });

  const validateEditor = () => {
    if (!workspaceId) return "Workspace context is missing.";
    if (!editor.name.trim()) return "Template name is required.";
    if (editor.questions.length === 0) {
      return "Add at least one question before saving.";
    }
    for (const [index, question] of editor.questions.entries()) {
      const error = validateCheckinQuestionDraft(question, index);
      if (error) return error;
    }
    if (
      selectedTemplate &&
      selectedTemplate.is_active !== false &&
      !editor.isActive &&
      selectedTemplateUsage &&
      (selectedTemplateUsage.isWorkspaceDefault ||
        selectedTemplateUsage.assignedClientCount > 0)
    ) {
      return "Reassign the workspace default and any client overrides before deactivating this template.";
    }
    return null;
  };

  const saveQuestions = async (
    templateId: string,
    previousQuestions: CheckinQuestionRow[],
    questions: CheckinQuestionDraft[],
  ) => {
    const rows = buildQuestionRows(templateId, questions);
    const { error: upsertError } = await supabase
      .from("checkin_questions")
      .upsert(rows, { onConflict: "id" });
    if (upsertError) throw upsertError;

    const previousIds = previousQuestions.map((question) => question.id);
    const nextIds = new Set(rows.map((row) => row.id));
    const removedIds = previousIds.filter((id) => !nextIds.has(id));

    if (removedIds.length > 0) {
      const { error: deleteError } = await supabase
        .from("checkin_questions")
        .delete()
        .in("id", removedIds);
      if (deleteError) throw deleteError;
    }
  };

  const handleSaveTemplate = async () => {
    const validationError = validateEditor();
    if (validationError) {
      setToastVariant("error");
      setToastMessage(validationError);
      return;
    }

    setSaveState("saving");

    try {
      if (!selectedTemplate) {
        const { data: createdTemplate, error: createError } = await supabase
          .from("checkin_templates")
          .insert({
            workspace_id: workspaceId,
            name: editor.name.trim(),
            description: editor.description.trim() || null,
            is_active: editor.isActive,
          })
          .select("id, name, description, is_active, created_at, updated_at")
          .maybeSingle();

        if (createError || !createdTemplate?.id) {
          throw createError ?? new Error("Unable to create template.");
        }

        await saveQuestions(createdTemplate.id, [], editor.questions);
        await syncTemplateQueries();
        setCreatingNewTemplate(false);
        setSelectedTemplateId(createdTemplate.id);
        setToastVariant("success");
        setToastMessage("Template created.");
        return;
      }

      const nextTemplateFields = {
        name: editor.name.trim(),
        description: editor.description.trim() || null,
        is_active: editor.isActive,
      };

      if (structuralChanges && structuralEditsLocked) {
        const { data: clonedTemplate, error: cloneError } = await supabase
          .from("checkin_templates")
          .insert({
            workspace_id: workspaceId,
            ...nextTemplateFields,
          })
          .select("id, name, description, is_active, created_at, updated_at")
          .maybeSingle();

        if (cloneError || !clonedTemplate?.id) {
          throw cloneError ?? new Error("Unable to create template version.");
        }

        await saveQuestions(clonedTemplate.id, [], editor.questions);
        await syncTemplateQueries();
        setCreatingNewTemplate(false);
        setSelectedTemplateId(clonedTemplate.id);
        setToastVariant("success");
        setToastMessage(
          "Saved as a new template version so active clients and past check-ins stay unchanged.",
        );
        return;
      }

      const { error: updateError } = await supabase
        .from("checkin_templates")
        .update(nextTemplateFields)
        .eq("id", selectedTemplate.id);
      if (updateError) throw updateError;

      if (structuralChanges) {
        await saveQuestions(
          selectedTemplate.id,
          selectedQuestions,
          editor.questions,
        );
      }

      await syncTemplateQueries();
      await queryClient.invalidateQueries({
        queryKey: ["pt-checkin-template-questions", selectedTemplate.id],
      });
      setToastVariant("success");
      setToastMessage("Template saved.");
    } catch (error) {
      setToastVariant("error");
      setToastMessage(
        error instanceof Error ? error.message : "Unable to save template.",
      );
    } finally {
      setSaveState("idle");
    }
  };

  const handleDuplicateTemplate = async () => {
    const validationError = validateEditor();
    if (validationError) {
      setToastVariant("error");
      setToastMessage(validationError);
      return;
    }

    if (!workspaceId) return;
    setSaveState("duplicating");

    try {
      const { data: duplicatedTemplate, error: duplicateError } = await supabase
        .from("checkin_templates")
        .insert({
          workspace_id: workspaceId,
          name: formatDuplicateTemplateName(editor.name),
          description: editor.description.trim() || null,
          is_active: true,
        })
        .select("id, name, description, is_active, created_at, updated_at")
        .maybeSingle();

      if (duplicateError || !duplicatedTemplate?.id) {
        throw duplicateError ?? new Error("Unable to duplicate template.");
      }

      const duplicatedQuestions = editor.questions.map((question, index) => ({
        ...question,
        id: crypto.randomUUID(),
        sortOrder: (index + 1) * 10,
      }));

      await saveQuestions(duplicatedTemplate.id, [], duplicatedQuestions);
      await syncTemplateQueries();
      setCreatingNewTemplate(false);
      setSelectedTemplateId(duplicatedTemplate.id);
      setToastVariant("success");
      setToastMessage("Template duplicated.");
    } catch (error) {
      setToastVariant("error");
      setToastMessage(
        error instanceof Error
          ? error.message
          : "Unable to duplicate template.",
      );
    } finally {
      setSaveState("idle");
    }
  };

  const handleStartNewTemplate = () => {
    setCreatingNewTemplate(true);
    setSelectedTemplateId(null);
    setEditor(emptyTemplateEditor());
  };

  return (
    <div className="space-y-8">
      {toastMessage ? (
        <div className="fixed right-6 top-6 z-50 w-[320px]">
          <Alert
            className={
              toastVariant === "error"
                ? "border-danger/30"
                : "border-emerald-200"
            }
          >
            <AlertTitle>
              {toastVariant === "error" ? "Error" : "Success"}
            </AlertTitle>
            <AlertDescription>{toastMessage}</AlertDescription>
          </Alert>
        </div>
      ) : null}

      <WorkspacePageHeader
        title="Check-in Templates"
        description="Build question sets that feel coach-ready, stay aligned with the client renderer, and stay safe once clients start submitting."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={handleStartNewTemplate}>
              <Plus className="mr-2 h-4 w-4" />
              New template
            </Button>
            <Button
              onClick={handleSaveTemplate}
              disabled={saveState !== "idle" || !hasUnsavedChanges}
            >
              {saveLabel}
            </Button>
          </div>
        }
      />

      <div className="page-kpi-block grid gap-4 sm:grid-cols-3">
        <DashboardCard title="Templates" subtitle="Workspace library">
          {workspaceLoading || templatesQuery.isLoading ? (
            <Skeleton className="h-10 w-full" />
          ) : (
            <div className="space-y-1">
              <p className="text-2xl font-semibold text-foreground">
                {templateRows.length}
              </p>
              <p className="text-sm text-muted-foreground">
                {activeTemplateCount} active,{" "}
                {templateRows.length - activeTemplateCount} inactive
              </p>
            </div>
          )}
        </DashboardCard>

        <DashboardCard title="Assignments" subtitle="Explicit client overrides">
          {clientAssignmentsQuery.isLoading ? (
            <Skeleton className="h-10 w-full" />
          ) : (
            <div className="space-y-1">
              <p className="text-2xl font-semibold text-foreground">
                {
                  (clientAssignmentsQuery.data ?? []).filter(
                    (client) => !!client.checkin_template_id,
                  ).length
                }
              </p>
              <p className="text-sm text-muted-foreground">
                Workspace default stays separate from direct overrides.
              </p>
            </div>
          )}
        </DashboardCard>

        <DashboardCard
          title="Submission Safety"
          subtitle="Historical protection"
        >
          <div className="space-y-1">
            <p className="text-2xl font-semibold text-foreground">
              {checkinUsageQuery.data?.filter((row) => !!row.submitted_at)
                .length ?? 0}
            </p>
            <p className="text-sm text-muted-foreground">
              Submitted check-ins now keep their original question structure.
            </p>
          </div>
        </DashboardCard>
      </div>

      <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
        <DashboardCard
          title="Template Library"
          subtitle="Active and archived templates in this workspace."
        >
          {workspaceError ? (
            <EmptyState
              title="Workspace unavailable"
              description="We couldn't load your workspace context."
            />
          ) : templatesQuery.isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          ) : templateRows.length === 0 ? (
            <EmptyState
              title="No check-in templates yet"
              description="Start with a reusable template, then assign it as a workspace default or a client override."
              actionLabel="Create template"
              onAction={handleStartNewTemplate}
            />
          ) : (
            <div className="space-y-3">
              {templateRows.map((template) => {
                const usage = usageByTemplateId.get(template.id);
                const isSelected = template.id === selectedTemplateId;
                return (
                  <button
                    key={template.id}
                    type="button"
                    onClick={() => {
                      setCreatingNewTemplate(false);
                      setSelectedTemplateId(template.id);
                    }}
                    className={cn(
                      "w-full rounded-[20px] border px-4 py-4 text-left transition",
                      isSelected
                        ? "border-primary/60 bg-primary/6 shadow-[0_18px_50px_-32px_rgba(15,23,42,0.7)]"
                        : "border-border/70 bg-background/55 hover:bg-muted/40",
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <p className="text-sm font-semibold text-foreground">
                          {template.name ?? "Untitled template"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {template.description?.trim() ||
                            "No template description yet."}
                        </p>
                      </div>
                      <StatusPill
                        status={
                          template.is_active === false ? "inactive" : "active"
                        }
                        statusMap={templateStatusMap}
                      />
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      {usage?.isWorkspaceDefault ? (
                        <Badge variant="secondary">Workspace default</Badge>
                      ) : null}
                      {usage?.assignedClientCount ? (
                        <Badge variant="warning">
                          {usage.assignedClientCount} client override
                          {usage.assignedClientCount === 1 ? "" : "s"}
                        </Badge>
                      ) : null}
                      {usage?.submittedCheckinCount ? (
                        <Badge variant="success">
                          {usage.submittedCheckinCount} submitted
                        </Badge>
                      ) : null}
                      {usage?.totalCheckinCount &&
                      usage.totalCheckinCount > usage.submittedCheckinCount ? (
                        <Badge variant="muted">
                          {usage.totalCheckinCount -
                            usage.submittedCheckinCount}{" "}
                          scheduled
                        </Badge>
                      ) : null}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </DashboardCard>

        <DashboardCard
          title={selectedTemplate ? "Template Builder" : "New Template"}
          subtitle={
            selectedTemplate
              ? "Edit the active definition, reorder questions, and duplicate safely when you want a new version."
              : "Start a reusable template that coaches can assign directly or set as the workspace default."
          }
          action={
            <div className="flex flex-wrap items-center gap-2">
              {hasUnsavedChanges ? (
                <Badge variant="warning">Unsaved changes</Badge>
              ) : null}
              <Button
                variant="secondary"
                size="sm"
                onClick={handleDuplicateTemplate}
                disabled={saveState !== "idle" || editor.questions.length === 0}
              >
                <Copy className="mr-2 h-4 w-4" />
                Duplicate
              </Button>
            </div>
          }
        >
          <div className="space-y-6">
            {selectedTemplate && structuralEditsLocked ? (
              <Alert className="border-warning/30 bg-warning/10">
                <Lock className="h-4 w-4" />
                <AlertTitle>Protected template definition</AlertTitle>
                <AlertDescription>
                  This template already has active assignments or scheduled
                  check-ins. If you change the question structure, Repsync will
                  save a new version so historical submissions stay intact.
                </AlertDescription>
              </Alert>
            ) : null}

            <div className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
              <div className="space-y-4 rounded-[24px] border border-border/70 bg-background/40 p-5">
                <div className="space-y-2">
                  <label className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    Template name
                  </label>
                  <Input
                    value={editor.name}
                    onChange={(event) =>
                      updateEditor((current) => ({
                        ...current,
                        name: event.target.value,
                      }))
                    }
                    placeholder="Recovery check-in"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    Description
                  </label>
                  <textarea
                    className="min-h-[110px] w-full rounded-xl border border-border bg-background px-3 py-3 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    value={editor.description}
                    onChange={(event) =>
                      updateEditor((current) => ({
                        ...current,
                        description: event.target.value,
                      }))
                    }
                    placeholder="What this template is for, when to use it, and what the coach should learn from the answers."
                  />
                </div>
              </div>

              <div className="space-y-4 rounded-[24px] border border-border/70 bg-[linear-gradient(180deg,oklch(var(--accent)/0.12),transparent)] p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold text-foreground">
                      Active in template picker
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Inactive templates stay readable for history but stop
                      showing up as fresh assignment options.
                    </p>
                  </div>
                  <Switch
                    checked={editor.isActive}
                    onCheckedChange={(checked) =>
                      updateEditor((current) => ({
                        ...current,
                        isActive: checked,
                      }))
                    }
                  />
                </div>

                <div className="grid gap-2">
                  <div className="rounded-xl border border-border/60 bg-background/50 px-3 py-3">
                    <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                      Resolution notes
                    </p>
                    <p className="mt-2 text-sm text-foreground">
                      Client override wins first, workspace default comes next,
                      and the latest active workspace template is the fallback
                      only when neither is set.
                    </p>
                  </div>
                  {selectedTemplateUsage ? (
                    <div className="rounded-xl border border-border/60 bg-background/50 px-3 py-3 text-sm text-muted-foreground">
                      <p>
                        <span className="font-semibold text-foreground">
                          Current usage:
                        </span>{" "}
                        {selectedTemplateUsage.isWorkspaceDefault
                          ? "workspace default, "
                          : ""}
                        {selectedTemplateUsage.assignedClientCount} client
                        override
                        {selectedTemplateUsage.assignedClientCount === 1
                          ? ""
                          : "s"}
                        , {selectedTemplateUsage.submittedCheckinCount}{" "}
                        submitted check-in
                        {selectedTemplateUsage.submittedCheckinCount === 1
                          ? ""
                          : "s"}
                        .
                      </p>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    Questions
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Text, number, scale, choice, and yes/no are fully aligned
                    with the client check-in renderer.
                  </p>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() =>
                    updateEditor((current) => ({
                      ...current,
                      questions: [
                        ...current.questions,
                        createEmptyCheckinQuestionDraft(
                          current.questions.length,
                        ),
                      ],
                    }))
                  }
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Add question
                </Button>
              </div>

              {questionsQuery.isLoading && selectedTemplate ? (
                <div className="space-y-3">
                  <Skeleton className="h-40 w-full" />
                  <Skeleton className="h-40 w-full" />
                </div>
              ) : editor.questions.length === 0 ? (
                <EmptyState
                  title="No questions yet"
                  description="Add the first question to start shaping this template."
                  actionLabel="Add question"
                  onAction={() =>
                    updateEditor((current) => ({
                      ...current,
                      questions: [createEmptyCheckinQuestionDraft(0)],
                    }))
                  }
                />
              ) : (
                <div className="space-y-4">
                  {editor.questions.map((question, index) => {
                    const typeConfig = checkinQuestionTypeOptions.find(
                      (option) => option.value === question.type,
                    );
                    const isChoice = question.type === "choice";
                    const isYesNo = question.type === "yes_no";

                    return (
                      <div
                        key={question.id}
                        className="rounded-[24px] border border-border/70 bg-background/45 p-5 shadow-[0_20px_55px_-40px_rgba(15,23,42,0.75)]"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="flex items-center gap-2">
                            <div className="rounded-full border border-border/70 bg-muted/50 p-2 text-muted-foreground">
                              <GripVertical className="h-4 w-4" />
                            </div>
                            <div>
                              <p className="text-sm font-semibold text-foreground">
                                Question {index + 1}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {typeConfig?.description ??
                                  "Configure the prompt and how clients answer it."}
                              </p>
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-2">
                            <StatusPill
                              status={
                                question.isRequired ? "required" : "optional"
                              }
                              statusMap={requiredStatusMap}
                            />
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() =>
                                updateEditor((current) => {
                                  if (index === 0) return current;
                                  const nextQuestions = [...current.questions];
                                  const currentQuestion = nextQuestions[index];
                                  const previousQuestion =
                                    nextQuestions[index - 1];
                                  if (!currentQuestion || !previousQuestion) {
                                    return current;
                                  }
                                  nextQuestions[index - 1] = currentQuestion;
                                  nextQuestions[index] = previousQuestion;
                                  return {
                                    ...current,
                                    questions: nextQuestions,
                                  };
                                })
                              }
                              disabled={index === 0}
                            >
                              <ArrowUp className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() =>
                                updateEditor((current) => {
                                  if (index === current.questions.length - 1) {
                                    return current;
                                  }
                                  const nextQuestions = [...current.questions];
                                  const currentQuestion = nextQuestions[index];
                                  const nextQuestion = nextQuestions[index + 1];
                                  if (!currentQuestion || !nextQuestion) {
                                    return current;
                                  }
                                  nextQuestions[index] = nextQuestion;
                                  nextQuestions[index + 1] = currentQuestion;
                                  return {
                                    ...current,
                                    questions: nextQuestions,
                                  };
                                })
                              }
                              disabled={index === editor.questions.length - 1}
                            >
                              <ArrowDown className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() =>
                                updateEditor((current) => ({
                                  ...current,
                                  questions:
                                    current.questions.length === 1
                                      ? [createEmptyCheckinQuestionDraft(0)]
                                      : current.questions.filter(
                                          (row) => row.id !== question.id,
                                        ),
                                }))
                              }
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>

                        <div className="mt-5 grid gap-4 lg:grid-cols-[1.25fr_0.75fr]">
                          <div className="space-y-4">
                            <div className="space-y-2">
                              <label className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                                Question title
                              </label>
                              <Input
                                value={question.questionText}
                                onChange={(event) =>
                                  setQuestionDraft(question.id, (current) => ({
                                    ...current,
                                    questionText: event.target.value,
                                  }))
                                }
                                placeholder="How would you rate your recovery this week?"
                              />
                            </div>

                            <div className="space-y-2">
                              <label className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                                Help text
                              </label>
                              <textarea
                                className="min-h-[92px] w-full rounded-xl border border-border bg-background px-3 py-3 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                value={question.helpText}
                                onChange={(event) =>
                                  setQuestionDraft(question.id, (current) => ({
                                    ...current,
                                    helpText: event.target.value,
                                  }))
                                }
                                placeholder="Optional guidance clients see beneath the question."
                              />
                            </div>
                          </div>

                          <div className="space-y-4 rounded-[20px] border border-border/60 bg-muted/25 p-4">
                            <div className="space-y-2">
                              <label className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                                Question type
                              </label>
                              <select
                                className="h-10 w-full app-field px-3 text-sm"
                                value={question.type}
                                onChange={(event) =>
                                  setQuestionDraft(question.id, (current) => ({
                                    ...current,
                                    type: event.target
                                      .value as SupportedCheckinQuestionType,
                                    options:
                                      event.target.value === "choice"
                                        ? current.options.length > 0
                                          ? current.options
                                          : ["", ""]
                                        : current.options,
                                  }))
                                }
                              >
                                {checkinQuestionTypeOptions.map((option) => (
                                  <option
                                    key={option.value}
                                    value={option.value}
                                  >
                                    {option.label}
                                  </option>
                                ))}
                              </select>
                            </div>

                            <div className="flex items-start justify-between gap-4 rounded-xl border border-border/60 bg-background/70 px-3 py-3">
                              <div>
                                <p className="text-sm font-medium text-foreground">
                                  Required response
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  Required questions are enforced again on
                                  submit.
                                </p>
                              </div>
                              <Switch
                                checked={question.isRequired}
                                onCheckedChange={(checked) =>
                                  setQuestionDraft(question.id, (current) => ({
                                    ...current,
                                    isRequired: checked,
                                  }))
                                }
                              />
                            </div>

                            {isChoice ? (
                              <div className="space-y-3 rounded-xl border border-border/60 bg-background/70 p-3">
                                <div className="flex items-center justify-between gap-2">
                                  <div>
                                    <p className="text-sm font-medium text-foreground">
                                      Choice options
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                      Clients can pick one option.
                                    </p>
                                  </div>
                                  <Button
                                    variant="secondary"
                                    size="sm"
                                    onClick={() =>
                                      setQuestionDraft(
                                        question.id,
                                        (current) => ({
                                          ...current,
                                          options: [...current.options, ""],
                                        }),
                                      )
                                    }
                                  >
                                    <Plus className="mr-2 h-4 w-4" />
                                    Option
                                  </Button>
                                </div>

                                <div className="space-y-2">
                                  {question.options.map(
                                    (option, optionIndex) => (
                                      <div
                                        key={`${question.id}-${optionIndex}`}
                                        className="flex items-center gap-2"
                                      >
                                        <Input
                                          value={option}
                                          onChange={(event) =>
                                            setQuestionDraft(
                                              question.id,
                                              (current) => {
                                                const nextOptions = [
                                                  ...current.options,
                                                ];
                                                nextOptions[optionIndex] =
                                                  event.target.value;
                                                return {
                                                  ...current,
                                                  options: nextOptions,
                                                };
                                              },
                                            )
                                          }
                                          placeholder={`Option ${optionIndex + 1}`}
                                        />
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          onClick={() =>
                                            setQuestionDraft(
                                              question.id,
                                              (current) => ({
                                                ...current,
                                                options:
                                                  current.options.length <= 2
                                                    ? current.options
                                                    : current.options.filter(
                                                        (_, idx) =>
                                                          idx !== optionIndex,
                                                      ),
                                              }),
                                            )
                                          }
                                          disabled={
                                            question.options.length <= 2
                                          }
                                        >
                                          <Trash2 className="h-4 w-4" />
                                        </Button>
                                      </div>
                                    ),
                                  )}
                                </div>
                              </div>
                            ) : null}

                            {isYesNo ? (
                              <div className="rounded-xl border border-border/60 bg-background/70 px-3 py-3 text-sm text-muted-foreground">
                                Yes / no questions use fixed options in the
                                client view so coaches get a cleaner binary UX.
                              </div>
                            ) : null}

                            <div className="rounded-xl border border-border/60 bg-background/70 px-3 py-3">
                              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                                Client preview
                              </p>
                              <div className="mt-3 flex flex-wrap gap-2">
                                {question.type === "scale" ? (
                                  Array.from(
                                    { length: 10 },
                                    (_, score) => score + 1,
                                  ).map((score) => (
                                    <Badge key={score} variant="muted">
                                      {score}
                                    </Badge>
                                  ))
                                ) : question.type === "choice" ? (
                                  normalizeCheckinChoiceOptions(
                                    question.options,
                                  ).map((option) => (
                                    <Badge key={option} variant="muted">
                                      {option}
                                    </Badge>
                                  ))
                                ) : question.type === "yes_no" ? (
                                  <>
                                    <Badge variant="muted">Yes</Badge>
                                    <Badge variant="muted">No</Badge>
                                  </>
                                ) : question.type === "number" ? (
                                  <Badge variant="muted">Numeric input</Badge>
                                ) : (
                                  <Badge variant="muted">Long text</Badge>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 rounded-[24px] border border-border/70 bg-[linear-gradient(180deg,oklch(var(--card)/0.96),oklch(var(--card)/0.9))] px-5 py-4">
              <div className="flex items-center gap-3">
                <div className="rounded-full border border-border/70 bg-accent/10 p-2 text-accent">
                  {selectedTemplate && structuralEditsLocked ? (
                    <Lock className="h-4 w-4" />
                  ) : (
                    <Sparkles className="h-4 w-4" />
                  )}
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    {selectedTemplate && structuralEditsLocked
                      ? "Question edits create a new version"
                      : "Ready to publish this template"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {selectedTemplate && structuralEditsLocked
                      ? "The current version stays attached to existing scheduled and submitted check-ins."
                      : "Once saved, this template can be assigned from the client detail screen or set as a workspace default."}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" onClick={handleStartNewTemplate}>
                  <LayoutTemplate className="mr-2 h-4 w-4" />
                  Start fresh
                </Button>
                <Button
                  onClick={handleSaveTemplate}
                  disabled={saveState !== "idle" || !hasUnsavedChanges}
                >
                  {saveLabel}
                </Button>
              </div>
            </div>
          </div>
        </DashboardCard>
      </div>
    </div>
  );
}

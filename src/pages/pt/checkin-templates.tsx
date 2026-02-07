import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, AlertDescription, AlertTitle } from "../../components/ui/alert";
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
import { DashboardCard, EmptyState, Skeleton, StatusPill } from "../../components/ui/coachos";
import { supabase } from "../../lib/supabase";
import { useWorkspace } from "../../lib/use-workspace";

type CheckinTemplateRow = {
  id: string;
  name: string | null;
  description?: string | null;
  is_active?: boolean | null;
  created_at?: string | null;
};

type CheckinQuestionRow = {
  id: string;
  template_id: string;
  question_text?: string | null;
  prompt?: string | null;
  is_required?: boolean | null;
  sort_order?: number | null;
  position?: number | null;
};

const requiredStatusMap = {
  required: { label: "Required", variant: "warning" },
  optional: { label: "Optional", variant: "muted" },
};

export function PtCheckinTemplatesPage() {
  const { workspaceId, loading: workspaceLoading, error: workspaceError } = useWorkspace();
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [templateDescription, setTemplateDescription] = useState("");
  const [activeTemplateId, setActiveTemplateId] = useState<string | null>(null);
  const [questionDrafts, setQuestionDrafts] = useState<Record<string, { text: string; required: boolean }>>(
    {}
  );
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastVariant, setToastVariant] = useState<"success" | "error">("success");
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [savingQuestion, setSavingQuestion] = useState(false);

  useEffect(() => {
    if (!toastMessage) return;
    const timeout = setTimeout(() => setToastMessage(null), 2400);
    return () => clearTimeout(timeout);
  }, [toastMessage]);

  const templatesQuery = useQuery({
    queryKey: ["pt-checkin-templates", workspaceId],
    enabled: !!workspaceId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("checkin_templates")
        .select("id, workspace_id, name, description, is_active, created_at")
        .eq("workspace_id", workspaceId ?? "")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as CheckinTemplateRow[];
    },
  });

  const activeTemplates = useMemo(
    () => (templatesQuery.data ?? []).filter((row) => row.is_active !== false),
    [templatesQuery.data]
  );

  const questionsQuery = useQuery({
    queryKey: ["pt-checkin-questions", activeTemplateId],
    enabled: !!activeTemplateId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("checkin_questions")
        .select("id, template_id, question_text, prompt, is_required, sort_order, position")
        .eq("template_id", activeTemplateId ?? "");
      if (error) throw error;
      return (data ?? []) as CheckinQuestionRow[];
    },
  });

  const sortedQuestions = useMemo(() => {
    const rows = questionsQuery.data ?? [];
    return [...rows].sort((a, b) => {
      const aOrder = a.sort_order ?? a.position ?? 0;
      const bOrder = b.sort_order ?? b.position ?? 0;
      return aOrder - bOrder;
    });
  }, [questionsQuery.data]);

  const handleCreateTemplate = async () => {
    if (!workspaceId || !templateName.trim()) return;
    setSavingTemplate(true);
    const payload = {
      workspace_id: workspaceId,
      name: templateName.trim(),
      description: templateDescription.trim() || null,
      is_active: true,
    };

    const result = await supabase
      .from("checkin_templates")
      .insert(payload)
      .select("id, workspace_id, name, description, is_active, created_at")
      .maybeSingle();

    if (result.error) {
      setSavingTemplate(false);
      setToastVariant("error");
      setToastMessage("Unable to create template.");
      return;
    }

    const newTemplate = result.data as CheckinTemplateRow | null;
    if (newTemplate) {
      queryClient.setQueryData(
        ["pt-checkin-templates", workspaceId],
        (prev: CheckinTemplateRow[] | undefined) => [newTemplate, ...(prev ?? [])]
      );
      setActiveTemplateId(newTemplate.id);
      await queryClient.invalidateQueries({ queryKey: ["pt-checkin-templates", workspaceId] });
    }

    setTemplateName("");
    setTemplateDescription("");
    setCreateOpen(false);
    setSavingTemplate(false);
    setToastVariant("success");
    setToastMessage("Template created.");
  };

  const handleAddQuestion = async (templateId: string) => {
    const draft = questionDrafts[templateId];
    if (!draft?.text.trim()) return;
    setSavingQuestion(true);

    let result = await supabase
      .from("checkin_questions")
      .insert({
        template_id: templateId,
        question_text: draft.text.trim(),
        is_required: draft.required,
        type: "text",
        prompt: draft.text.trim(),
      })
      .select("id, template_id, question_text, is_required")
      .maybeSingle();

    if (result.error) {
      setSavingQuestion(false);
      setToastVariant("error");
      setToastMessage("Unable to add question.");
      return;
    }

    setQuestionDrafts((prev) => ({ ...prev, [templateId]: { text: "", required: false } }));
    setSavingQuestion(false);
    setToastVariant("success");
    setToastMessage("Question added.");
    await queryClient.invalidateQueries({ queryKey: ["pt-checkin-questions", templateId] });
  };

  return (
    <div className="space-y-8">
      {toastMessage ? (
        <div className="fixed right-6 top-6 z-50 w-[260px]">
          <Alert className={toastVariant === "error" ? "border-danger/30" : "border-emerald-200"}>
            <AlertTitle>{toastVariant === "error" ? "Error" : "Success"}</AlertTitle>
            <AlertDescription>{toastMessage}</AlertDescription>
          </Alert>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Check-in templates</h2>
          <p className="text-sm text-muted-foreground">Create weekly check-in questions.</p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>Create template</Button>
      </div>

      <DashboardCard title="Templates" subtitle="Manage weekly check-in templates.">
        {workspaceLoading || templatesQuery.isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : workspaceError || templatesQuery.error ? (
          <EmptyState
            title="No check-in templates created yet"
            description="Create a template to start collecting weekly check-ins."
          />
        ) : activeTemplates.length === 0 ? (
          <EmptyState
            title="No check-in templates created yet"
            description="Create a template to start collecting weekly check-ins."
          />
        ) : (
          <div className="grid gap-4">
            {activeTemplates.map((template) => {
              const isActive = activeTemplateId === template.id;
              const draft = questionDrafts[template.id] ?? { text: "", required: false };
              return (
                <Card key={template.id} className="border-border/70 bg-card/80">
                  <CardHeader className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <CardTitle>{template.name ?? "Untitled template"}</CardTitle>
                      {template.description ? (
                        <p className="text-sm text-muted-foreground">{template.description}</p>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusPill status={template.is_active === false ? "inactive" : "active"} />
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setActiveTemplateId(isActive ? null : template.id)}
                      >
                        {isActive ? "Hide questions" : "View questions"}
                      </Button>
                    </div>
                  </CardHeader>
                  {isActive ? (
                    <CardContent className="space-y-4">
                      {questionsQuery.isLoading ? (
                        <div className="space-y-2">
                          <Skeleton className="h-10 w-full" />
                          <Skeleton className="h-10 w-full" />
                        </div>
                      ) : questionsQuery.error ? (
                        <EmptyState
                          title="No check-in templates created yet"
                          description="Create a template to start collecting weekly check-ins."
                        />
                      ) : sortedQuestions.length === 0 ? (
                        <EmptyState
                          title="No questions yet"
                          description="Add your first question to this template."
                        />
                      ) : (
                        <div className="space-y-2">
                          {sortedQuestions.map((question) => {
                            const label =
                              question.question_text ?? question.prompt ?? "Question";
                            const status = question.is_required ? "required" : "optional";
                            return (
                              <div
                                key={question.id}
                                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm"
                              >
                                <span className="font-medium">{label}</span>
                                <StatusPill status={status} statusMap={requiredStatusMap} />
                              </div>
                            );
                          })}
                        </div>
                      )}

                      <div className="rounded-xl border border-dashed border-border bg-muted/40 p-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <p className="text-sm font-semibold">Add a new question</p>
                            <p className="text-xs text-muted-foreground">
                              Collect custom metrics like HRV, soreness, or nutrition.
                            </p>
                          </div>
                          <label className="flex items-center gap-2 text-xs text-muted-foreground">
                            <input
                              type="checkbox"
                              checked={draft.required}
                              onChange={(event) =>
                                setQuestionDrafts((prev) => ({
                                  ...prev,
                                  [template.id]: { ...draft, required: event.target.checked },
                                }))
                              }
                            />
                            Required
                          </label>
                        </div>
                        <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto] sm:items-center">
                          <Input
                            placeholder="Question prompt"
                            value={draft.text}
                            onChange={(event) =>
                              setQuestionDrafts((prev) => ({
                                ...prev,
                                [template.id]: { ...draft, text: event.target.value },
                              }))
                            }
                          />
                          <Button
                            size="sm"
                            onClick={() => handleAddQuestion(template.id)}
                            disabled={savingQuestion || !draft.text.trim()}
                          >
                            {savingQuestion ? "Adding..." : "Add question"}
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  ) : null}
                </Card>
              );
            })}
          </div>
        )}
      </DashboardCard>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>Create template</DialogTitle>
            <DialogDescription>
              Add a new weekly check-in template for your clients.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <label className="text-xs font-semibold text-muted-foreground">Template name</label>
              <Input
                value={templateName}
                onChange={(event) => setTemplateName(event.target.value)}
                placeholder="Weekly check-in"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-semibold text-muted-foreground">
                Description (optional)
              </label>
              <textarea
                className="min-h-[96px] w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={templateDescription}
                onChange={(event) => setTemplateDescription(event.target.value)}
                placeholder="What this template is used for..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateTemplate} disabled={savingTemplate || !templateName.trim()}>
              {savingTemplate ? "Creating..." : "Create template"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

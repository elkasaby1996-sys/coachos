import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Copy, Plus, Trash2 } from "lucide-react";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { PageContainer } from "../../components/common/page-container";
import { DashboardCard, EmptyState, Skeleton, StatCard, StatusPill } from "../../components/ui/coachos";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";
import { SaveActions } from "../../components/common/save-actions";
import { useWorkspace } from "../../lib/use-workspace";
import { supabase } from "../../lib/supabase";
import { type NutritionTemplate, useNutritionTemplates } from "../../lib/nutrition";

export function PtNutritionPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { workspaceId, loading: workspaceLoading } = useWorkspace();
  const templatesQuery = useNutritionTemplates(workspaceId);

  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [templateActionError, setTemplateActionError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [weeks, setWeeks] = useState("1");

  const templates = templatesQuery.data ?? [];
  const filteredTemplates = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return templates;
    return templates.filter((t) => `${t.name} ${t.description ?? ""}`.toLowerCase().includes(q));
  }, [templates, search]);

  const invalidateTemplates = async () => {
    await queryClient.invalidateQueries({ queryKey: ["nutrition-templates-v1", workspaceId] });
  };

  const createTemplate = async () => {
    if (!workspaceId || !name.trim()) {
      setCreateError("Program name is required.");
      return;
    }

    const durationWeeks = Math.max(1, Math.min(4, Number(weeks) || 1));

    const { data, error } = await supabase
      .from("nutrition_templates")
      .insert({
        workspace_id: workspaceId,
        name: name.trim(),
        description: description.trim() || null,
        duration_weeks: durationWeeks,
      })
      .select("id")
      .maybeSingle();

    if (error || !data?.id) {
      setCreateError(error?.message ?? "Failed to create nutrition program.");
      return;
    }

    setCreateOpen(false);
    setName("");
    setDescription("");
    setWeeks("1");
    await invalidateTemplates();

    navigate(`/pt/nutrition/programs/${data.id}`);
  };

  const duplicateTemplate = async (template: NutritionTemplate) => {
    const { data: newTemplate, error: templateError } = await supabase
      .from("nutrition_templates")
      .insert({
        workspace_id: template.workspace_id,
        name: `${template.name} Copy`,
        description: template.description,
        duration_weeks: template.duration_weeks,
        is_active: true,
      })
      .select("id")
      .maybeSingle();

    if (templateError || !newTemplate?.id) return;

    for (const day of template.days) {
      const { data: newDay, error: dayError } = await supabase
        .from("nutrition_template_days")
        .insert({
          nutrition_template_id: newTemplate.id,
          week_index: day.week_index,
          day_of_week: day.day_of_week,
          title: day.title,
          notes: day.notes,
        })
        .select("id")
        .maybeSingle();
      if (dayError || !newDay?.id) return;

      for (const meal of day.meals) {
        const { data: newMeal, error: mealError } = await supabase
          .from("nutrition_template_meals")
          .insert({
            nutrition_template_day_id: newDay.id,
            meal_order: meal.meal_order,
            meal_name: meal.meal_name,
            recipe_text: meal.recipe_text,
            calories: meal.calories,
            protein_g: meal.protein_g,
            carbs_g: meal.carbs_g,
            fat_g: meal.fat_g,
            notes: meal.notes,
          })
          .select("id")
          .maybeSingle();
        if (mealError || !newMeal?.id) return;

        if (meal.components.length > 0) {
          const payload = meal.components.map((component) => ({
            nutrition_template_meal_id: newMeal.id,
            sort_order: component.sort_order,
            component_name: component.component_name,
            quantity: component.quantity,
            unit: component.unit,
            calories: component.calories,
            protein_g: component.protein_g,
            carbs_g: component.carbs_g,
            fat_g: component.fat_g,
            recipe_text: component.recipe_text,
            notes: component.notes,
          }));
          const { error: componentError } = await supabase
            .from("nutrition_template_meal_components")
            .insert(payload);
          if (componentError) return;
        }
      }
    }

    await invalidateTemplates();
  };

  const deleteTemplate = async (template: NutritionTemplate) => {
    const confirmed = window.confirm(
      `Delete nutrition program "${template.name}"? This cannot be undone.`
    );
    if (!confirmed) return;

    setTemplateActionError(null);
    const { error } = await supabase
      .from("nutrition_templates")
      .delete()
      .eq("id", template.id);

    if (error) {
      setTemplateActionError(
        error.message.includes("violates foreign key constraint")
          ? "This nutrition program is already assigned to a client and cannot be deleted."
          : error.message
      );
      return;
    }

    await invalidateTemplates();
  };

  const loading = workspaceLoading || templatesQuery.isLoading;

  return (
    <PageContainer className="max-w-screen-2xl space-y-6">
      <div className="space-y-1">
        <div className="text-xs uppercase tracking-[0.3em] text-muted-foreground">CoachOS Pro</div>
        <h2 className="text-2xl font-semibold tracking-tight">Nutrition Programs</h2>
        <p className="text-sm text-muted-foreground">Create multi-day programs and open the dedicated builder to configure meals.</p>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <StatCard label="Programs" value={templates.length} helper="Workspace" />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input className="w-full sm:w-72" placeholder="Search templates" value={search} onChange={(e) => setSearch(e.target.value)} />
        <Button onClick={() => { setCreateError(null); setCreateOpen(true); }}>
          <Plus className="mr-1 h-4 w-4" />
          New template
        </Button>
      </div>

      {templateActionError ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {templateActionError}
        </div>
      ) : null}

      {loading ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-52 w-full" />
          ))}
        </div>
      ) : filteredTemplates.length === 0 ? (
        <EmptyState
          title="No nutrition programs"
          description="Create your first program, then build Breakfast/Lunch/Dinner/Snacks on the next page."
          actionLabel="Create program"
          onAction={() => setCreateOpen(true)}
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {filteredTemplates.map((template) => (
            <DashboardCard
              key={template.id}
              title={template.name}
              subtitle={template.description ?? "No description"}
              action={<StatusPill status={template.is_active ? "active" : "inactive"} />}
            >
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground">{template.duration_weeks} week{template.duration_weeks > 1 ? "s" : ""}</p>
                <div className="grid grid-cols-4 gap-2 rounded-lg border border-border/60 bg-muted/20 p-2 text-center text-xs">
                  <div><p className="text-muted-foreground">Cals</p><p className="font-semibold">{Math.round(template.totals.calories)}</p></div>
                  <div><p className="text-muted-foreground">P</p><p className="font-semibold">{Math.round(template.totals.protein_g)}</p></div>
                  <div><p className="text-muted-foreground">C</p><p className="font-semibold">{Math.round(template.totals.carbs_g)}</p></div>
                  <div><p className="text-muted-foreground">F</p><p className="font-semibold">{Math.round(template.totals.fat_g)}</p></div>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <Button size="sm" variant="secondary" onClick={() => navigate(`/pt/nutrition/programs/${template.id}`)}>Open builder</Button>
                  <Button size="sm" variant="ghost" onClick={() => duplicateTemplate(template)}>
                    <Copy className="mr-1 h-3.5 w-3.5" />
                    Duplicate
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => deleteTemplate(template)}>
                    <Trash2 className="mr-1 h-3.5 w-3.5" />
                    Delete
                  </Button>
                </div>
              </div>
            </DashboardCard>
          ))}
        </div>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create nutrition program</DialogTitle>
            <DialogDescription>After creation, you will be taken to the program builder page.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Input placeholder="Program name" value={name} onChange={(e) => setName(e.target.value)} />
            <Input placeholder="Description" value={description} onChange={(e) => setDescription(e.target.value)} />
            <Input type="number" min={1} max={4} placeholder="Duration weeks" value={weeks} onChange={(e) => setWeeks(e.target.value)} />
            {createError ? <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">{createError}</div> : null}
          </div>
          <SaveActions
            onCancel={() => setCreateOpen(false)}
            onSave={createTemplate}
            saveLabel="Create + Open Program Builder"
          />
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}

export const PtNutritionTemplatesPage = PtNutritionPage;

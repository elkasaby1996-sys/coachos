import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import {
  Archive,
  Copy,
  Layers3,
  Plus,
  Search,
  Sparkles,
  Trash2,
} from "lucide-react";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Select } from "../../components/ui/select";
import { PageContainer } from "../../components/common/page-container";
import { Badge } from "../../components/ui/badge";
import {
  DashboardCard,
  EmptyState,
  Skeleton,
  StatCard,
  StatusPill,
} from "../../components/ui/coachos";
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
import {
  type NutritionTemplate,
  useNutritionTemplates,
} from "../../lib/nutrition";
import { WorkspacePageHeader } from "../../components/pt/workspace-page-header";
import { formatRelativeTime } from "../../lib/relative-time";

const formatNutritionTypeTag = (value: string | null | undefined) =>
  value && value.trim().length > 0 ? value.trim() : "Nutrition";

export function PtNutritionPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { workspaceId, loading: workspaceLoading } = useWorkspace();
  const templatesQuery = useNutritionTemplates(workspaceId);

  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [templateActionError, setTemplateActionError] = useState<string | null>(
    null,
  );
  const [typeFilter, setTypeFilter] = useState("all");
  const [sortBy, setSortBy] = useState("updated");
  const [name, setName] = useState("");
  const [typeTag, setTypeTag] = useState("");
  const [description, setDescription] = useState("");
  const [weeks, setWeeks] = useState("1");

  const templates = useMemo(
    () => templatesQuery.data ?? [],
    [templatesQuery.data],
  );
  const filteredTemplates = useMemo(() => {
    const q = search.trim().toLowerCase();
    const matches = templates.filter((template) => {
      const typeValue = formatNutritionTypeTag(template.nutrition_type_tag);
      if (typeFilter !== "all" && typeValue.toLowerCase() !== typeFilter) {
        return false;
      }
      if (!q) return true;
      return `${template.name} ${template.description ?? ""} ${typeValue}`
        .toLowerCase()
        .includes(q);
    });

    if (sortBy === "name") {
      return matches.sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
      );
    }

    return matches.sort((a, b) => {
      const aTime = new Date(a.updated_at ?? a.created_at).getTime();
      const bTime = new Date(b.updated_at ?? b.created_at).getTime();
      return bTime - aTime;
    });
  }, [templates, search, sortBy, typeFilter]);
  const activeTemplatesCount = useMemo(
    () => templates.filter((template) => template.is_active).length,
    [templates],
  );
  const archivedTemplatesCount = useMemo(
    () => templates.filter((template) => !template.is_active).length,
    [templates],
  );
  const buildTemplateTags = (template: NutritionTemplate) => {
    const tags = [
      formatNutritionTypeTag(template.nutrition_type_tag),
      `Updated ${formatRelativeTime(template.updated_at ?? template.created_at)}`,
    ].filter((value): value is string => Boolean(value));
    return tags.slice(0, 2);
  };
  const nutritionTypeOptions = useMemo(() => {
    const seen = new Map<string, string>();
    templates.forEach((template) => {
      const value = template.nutrition_type_tag?.trim();
      if (!value) return;
      const key = value.toLowerCase();
      if (!seen.has(key)) {
        seen.set(key, value);
      }
    });
    return Array.from(seen.values()).sort((a, b) => a.localeCompare(b));
  }, [templates]);

  const invalidateTemplates = async () => {
    await queryClient.invalidateQueries({
      queryKey: ["nutrition-templates-v1", workspaceId],
    });
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
        nutrition_type_tag: typeTag.trim() || null,
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
    setTypeTag("");
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
        nutrition_type_tag: template.nutrition_type_tag,
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
      `Delete nutrition program "${template.name}"? This cannot be undone.`,
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
          : error.message,
      );
      return;
    }

    await invalidateTemplates();
  };

  const loading = workspaceLoading || templatesQuery.isLoading;
  const clearFilters = () => {
    setSearch("");
    setTypeFilter("all");
    setSortBy("updated");
  };

  return (
    <PageContainer className="max-w-screen-2xl space-y-6">
      <WorkspacePageHeader
        title="Nutrition Programs"
        description="Build reusable multi-week nutrition systems and keep edits close to the list."
      />

      <div className="flex justify-end">
        <Button
          onClick={() => {
            setCreateError(null);
            setCreateOpen(true);
          }}
        >
          <Plus className="mr-1 h-4 w-4" />
          New template
        </Button>
      </div>

      <div className="page-kpi-block grid gap-4 md:grid-cols-3">
        <StatCard
          label="Nutrition Programs"
          value={templates.length}
          helper="Reusable plans ready to assign"
          icon={Layers3}
          accent
          className="h-full"
        />
        <StatCard
          label="Active"
          value={activeTemplatesCount}
          helper="Available for current assignments"
          icon={Sparkles}
          className="h-full"
        />
        <StatCard
          label="Archived"
          value={archivedTemplatesCount}
          helper="Stored for reference without clutter"
          icon={Archive}
          className="h-full"
        />
      </div>

      <div className="grid gap-2 xl:grid-cols-[minmax(0,1fr)_12rem_12rem] xl:items-center">
        <div className="relative min-w-0 flex-1">
          <Search className="app-search-icon h-4 w-4" />
          <Input
            className="app-search-input"
            placeholder="Search templates"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select
          variant="filter"
          className="w-full min-w-0"
          value={typeFilter}
          onChange={(event) => setTypeFilter(event.target.value)}
        >
          <option value="all">All nutrition types</option>
          {nutritionTypeOptions.map((value) => (
            <option key={value} value={value.toLowerCase()}>
              {value}
            </option>
          ))}
        </Select>
        <Select
          variant="filter"
          className="w-full min-w-0"
          value={sortBy}
          onChange={(event) => setSortBy(event.target.value)}
        >
          <option value="updated">Sort by updated</option>
          <option value="name">Sort by name</option>
        </Select>
      </div>

      {templateActionError ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {templateActionError}
        </div>
      ) : null}

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-52 w-full" />
          ))}
        </div>
      ) : filteredTemplates.length === 0 ? (
        templates.length === 0 ? (
          <DashboardCard title="No nutrition programs" className="bg-card/90">
            <EmptyState
              title="Create the first program"
              description="Start with one template."
              actionLabel="Create program"
              onAction={() => setCreateOpen(true)}
            />
          </DashboardCard>
        ) : (
          <EmptyState
            title="No programs match"
            description="Clear the search or try another filter."
            actionLabel="Clear filters"
            onAction={clearFilters}
          />
        )
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filteredTemplates.map((template) => (
            <DashboardCard
              key={template.id}
              title={template.name}
              subtitle={template.description ?? "No description"}
              action={
                <StatusPill
                  status={template.is_active ? "active" : "archived"}
                />
              }
              className="bg-card/90"
            >
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  {buildTemplateTags(template).map((tag) => (
                    <Badge
                      key={`${template.id}-${tag}`}
                      variant={
                        tag ===
                        formatNutritionTypeTag(template.nutrition_type_tag)
                          ? "secondary"
                          : "muted"
                      }
                      className="text-[10px] uppercase"
                    >
                      {tag}
                    </Badge>
                  ))}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    className="flex-1"
                    onClick={() =>
                      navigate(`/pt/nutrition/programs/${template.id}`)
                    }
                  >
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="flex-1"
                    onClick={() => duplicateTemplate(template)}
                  >
                    <Copy className="mr-1 h-3.5 w-3.5" />
                    Duplicate
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="flex-1 text-destructive hover:text-destructive"
                    onClick={() => deleteTemplate(template)}
                  >
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
            <DialogDescription>
              After creation, you will be taken to the program builder page.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Input
              placeholder="Program name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <Input
              placeholder="Description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
            <Input
              placeholder="Nutrition type"
              value={typeTag}
              onChange={(e) => setTypeTag(e.target.value)}
            />
            <Input
              type="number"
              min={1}
              max={4}
              placeholder="Duration weeks"
              value={weeks}
              onChange={(e) => setWeeks(e.target.value)}
            />
            {createError ? (
              <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
                {createError}
              </div>
            ) : null}
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

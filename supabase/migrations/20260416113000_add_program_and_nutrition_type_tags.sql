alter table public.program_templates
add column if not exists program_type_tag text;

create index if not exists program_templates_program_type_tag_idx
on public.program_templates (program_type_tag);

alter table public.nutrition_templates
add column if not exists nutrition_type_tag text;

create index if not exists nutrition_templates_nutrition_type_tag_idx
on public.nutrition_templates (nutrition_type_tag);

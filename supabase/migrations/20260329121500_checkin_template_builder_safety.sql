do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_enum e on e.enumtypid = t.oid
    where t.typnamespace = 'public'::regnamespace
      and t.typname = 'question_type'
      and e.enumlabel = 'yes_no'
  ) then
    alter type public.question_type add value 'yes_no';
  end if;
end
$$;

create or replace function public.protect_submitted_checkin_question_history()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  has_submitted_answers boolean;
begin
  select exists (
    select 1
    from public.checkin_answers a
    join public.checkins c on c.id = a.checkin_id
    where a.question_id = coalesce(old.id, new.id)
      and c.submitted_at is not null
  )
  into has_submitted_answers;

  if not has_submitted_answers then
    return coalesce(new, old);
  end if;

  if tg_op = 'DELETE' then
    raise exception
      'Questions used in submitted check-ins cannot be deleted. Create a new template version instead.';
  end if;

  if new.template_id is distinct from old.template_id
    or new.type is distinct from old.type
    or coalesce(new.question_text, '') is distinct from coalesce(old.question_text, '')
    or coalesce(new.prompt, '') is distinct from coalesce(old.prompt, '')
    or new.is_required is distinct from old.is_required
    or new.sort_order is distinct from old.sort_order
    or coalesce(new.position, -1) is distinct from coalesce(old.position, -1)
    or coalesce(new.options, '{}'::text[]) is distinct from coalesce(old.options, '{}'::text[])
  then
    raise exception
      'Questions used in submitted check-ins cannot be structurally edited. Create a new template version instead.';
  end if;

  return new;
end
$$;

drop trigger if exists protect_submitted_checkin_question_history_update
on public.checkin_questions;

create trigger protect_submitted_checkin_question_history_update
before update on public.checkin_questions
for each row
execute function public.protect_submitted_checkin_question_history();

drop trigger if exists protect_submitted_checkin_question_history_delete
on public.checkin_questions;

create trigger protect_submitted_checkin_question_history_delete
before delete on public.checkin_questions
for each row
execute function public.protect_submitted_checkin_question_history();

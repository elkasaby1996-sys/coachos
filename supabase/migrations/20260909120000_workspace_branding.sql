alter table public.workspaces
  add column if not exists accent_color text,
  add column if not exists client_welcome_title text not null default '',
  add column if not exists invite_sender_name text not null default '';

alter table public.workspaces
  add constraint workspaces_accent_color_check check (accent_color is null or accent_color ~ '^#[0-9A-Fa-f]{6}$'),
  add constraint workspaces_welcome_title_check check (char_length(client_welcome_title) <= 120),
  add constraint workspaces_invite_sender_name_check check (
    char_length(invite_sender_name) <= 120 and invite_sender_name !~ E'[\r\n<>]'
  );

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('workspace_branding', 'workspace_branding', true, 5242880, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;

create policy workspace_branding_read on storage.objects for select
  using (bucket_id = 'workspace_branding');
drop policy if exists workspace_branding_insert on storage.objects;
create policy workspace_branding_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'workspace_branding' and exists (
    select 1 from public.workspaces w where w.id::text = (storage.foldername(storage.objects.name))[1]
      and public.can_manage_workspace_team(w.id)
  ));
drop policy if exists workspace_branding_delete on storage.objects;
create policy workspace_branding_delete on storage.objects for delete to authenticated
  using (bucket_id = 'workspace_branding' and exists (
    select 1 from public.workspaces w where w.id::text = (storage.foldername(storage.objects.name))[1]
      and public.can_manage_workspace_team(w.id)
  ));

-- Public invite branding is available only while the existing invite is valid.
-- Do not open anonymous reads on workspaces or expose private workspace settings.
create function public.workspace_invite_branding(p_token text)
returns jsonb language plpgsql stable security definer
set search_path = pg_catalog, public
as $$
declare v_invite record;
begin
  select * into v_invite from public.verify_invite(p_token);
  if not coalesce(v_invite.is_valid, false) then return null; end if;
  return (select jsonb_build_object(
    'id', w.id, 'name', w.name, 'logo_url', w.logo_url,
    'accent_color', w.accent_color, 'client_welcome_title', w.client_welcome_title,
    'client_welcome_message', w.client_welcome_message,
    'invite_sender_name', w.invite_sender_name
  ) from public.workspaces w where w.id = v_invite.workspace_id);
end;
$$;
revoke all on function public.workspace_invite_branding(text) from public;
grant execute on function public.workspace_invite_branding(text) to anon, authenticated;

-- Snapshot workspace identity when an invitation is queued (including resends).
-- The delivery adapter supplies the platform's configured no-reply address.
create function public.brand_workspace_invite_email()
returns trigger language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare v_workspace public.workspaces%rowtype; v_sender text;
begin
  if new.notification_type <> 'team_invite_received' then return new; end if;
  select * into v_workspace from public.workspaces where id = new.workspace_id;
  v_sender := coalesce(nullif(btrim(v_workspace.invite_sender_name), ''),
    nullif(btrim(v_workspace.name), ''), 'RepSync');
  new.template_model := new.template_model || jsonb_build_object(
    'senderName', v_sender, 'senderMode', 'platform_no_reply',
    'ownerName', v_sender, 'workspaceLogoUrl', v_workspace.logo_url,
    'accentColor', v_workspace.accent_color
  );
  return new;
end;
$$;
revoke all on function public.brand_workspace_invite_email() from public;
create trigger brand_workspace_invite_email before insert on public.workspace_team_email_deliveries
  for each row execute function public.brand_workspace_invite_email();

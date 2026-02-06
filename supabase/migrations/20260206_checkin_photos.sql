-- Add check-in photo metadata table + storage bucket policies

create table if not exists public.checkin_photos (
  id uuid primary key default gen_random_uuid(),
  checkin_id uuid not null references public.checkins(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  url text not null,
  storage_path text not null,
  photo_type text not null,
  created_at timestamptz not null default now()
);

create index if not exists checkin_photos_checkin_id_idx
  on public.checkin_photos (checkin_id);
create index if not exists checkin_photos_client_id_idx
  on public.checkin_photos (client_id);
create unique index if not exists checkin_photos_checkin_id_type_idx
  on public.checkin_photos (checkin_id, photo_type);

alter table public.checkin_photos enable row level security;

drop policy if exists "checkin_photos_access" on public.checkin_photos;
create policy "checkin_photos_access"
  on public.checkin_photos
  for all
  to public
  using (
    exists (
      select 1
      from public.clients c
      join public.workspace_members wm on wm.workspace_id = c.workspace_id
      where c.id = checkin_photos.client_id
        and wm.user_id = (select auth.uid())
        and wm.role::text like 'pt_%'
    )
    or exists (
      select 1
      from public.clients c
      where c.id = checkin_photos.client_id
        and c.user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1
      from public.clients c
      join public.workspace_members wm on wm.workspace_id = c.workspace_id
      where c.id = checkin_photos.client_id
        and wm.user_id = (select auth.uid())
        and wm.role::text like 'pt_%'
    )
    or exists (
      select 1
      from public.clients c
      where c.id = checkin_photos.client_id
        and c.user_id = (select auth.uid())
    )
  );

insert into storage.buckets (id, name, public)
values ('checkin-photos', 'checkin-photos', true)
on conflict (id) do nothing;

drop policy if exists "checkin_photos_storage_client_rw" on storage.objects;
drop policy if exists "checkin_photos_storage_pt_read" on storage.objects;

create policy "checkin_photos_storage_client_rw"
  on storage.objects
  for all
  to authenticated
  using (
    bucket_id = 'checkin-photos'
    and exists (
      select 1
      from public.clients c
      where c.user_id = (select auth.uid())
        and storage.objects.name like c.id || '/%'
    )
  )
  with check (
    bucket_id = 'checkin-photos'
    and exists (
      select 1
      from public.clients c
      where c.user_id = (select auth.uid())
        and storage.objects.name like c.id || '/%'
    )
  );

create policy "checkin_photos_storage_pt_read"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'checkin-photos'
    and exists (
      select 1
      from public.clients c
      join public.workspace_members wm on wm.workspace_id = c.workspace_id
      where storage.objects.name like c.id || '/%'
        and wm.user_id = (select auth.uid())
        and wm.role::text like 'pt_%'
    )
  );

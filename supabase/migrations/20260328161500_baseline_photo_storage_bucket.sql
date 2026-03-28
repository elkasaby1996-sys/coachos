insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'baseline_photos',
  'baseline_photos',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "baseline_photos_objects_select" on storage.objects;
create policy "baseline_photos_objects_select"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'baseline_photos'
  and exists (
    select 1
    from public.baseline_entries be
    join public.clients c on c.id = be.client_id
    where be.id::text = (storage.foldername(name))[2]
      and c.id::text = (storage.foldername(name))[1]
      and (
        c.user_id = auth.uid()
        or exists (
          select 1
          from public.workspace_members wm
          where wm.workspace_id = be.workspace_id
            and wm.user_id = auth.uid()
            and wm.role::text like 'pt_%'
        )
      )
  )
);

drop policy if exists "baseline_photos_objects_insert" on storage.objects;
create policy "baseline_photos_objects_insert"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'baseline_photos'
  and exists (
    select 1
    from public.baseline_entries be
    join public.clients c on c.id = be.client_id
    where be.id::text = (storage.foldername(name))[2]
      and c.id::text = (storage.foldername(name))[1]
      and c.user_id = auth.uid()
  )
);

drop policy if exists "baseline_photos_objects_update" on storage.objects;
create policy "baseline_photos_objects_update"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'baseline_photos'
  and exists (
    select 1
    from public.baseline_entries be
    join public.clients c on c.id = be.client_id
    where be.id::text = (storage.foldername(name))[2]
      and c.id::text = (storage.foldername(name))[1]
      and c.user_id = auth.uid()
  )
)
with check (
  bucket_id = 'baseline_photos'
  and exists (
    select 1
    from public.baseline_entries be
    join public.clients c on c.id = be.client_id
    where be.id::text = (storage.foldername(name))[2]
      and c.id::text = (storage.foldername(name))[1]
      and c.user_id = auth.uid()
  )
);

drop policy if exists "baseline_photos_objects_delete" on storage.objects;
create policy "baseline_photos_objects_delete"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'baseline_photos'
  and exists (
    select 1
    from public.baseline_entries be
    join public.clients c on c.id = be.client_id
    where be.id::text = (storage.foldername(name))[2]
      and c.id::text = (storage.foldername(name))[1]
      and c.user_id = auth.uid()
  )
);

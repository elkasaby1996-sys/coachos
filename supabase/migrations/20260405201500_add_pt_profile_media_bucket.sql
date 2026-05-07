insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'pt_profile_media',
  'pt_profile_media',
  true,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "pt_profile_media_public_select" on storage.objects;
create policy "pt_profile_media_public_select"
on storage.objects
for select
to public
using (
  bucket_id = 'pt_profile_media'
);

drop policy if exists "pt_profile_media_owner_insert" on storage.objects;
create policy "pt_profile_media_owner_insert"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'pt_profile_media'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "pt_profile_media_owner_update" on storage.objects;
create policy "pt_profile_media_owner_update"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'pt_profile_media'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'pt_profile_media'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "pt_profile_media_owner_delete" on storage.objects;
create policy "pt_profile_media_owner_delete"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'pt_profile_media'
  and (storage.foldername(name))[1] = auth.uid()::text
);

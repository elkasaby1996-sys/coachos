drop policy if exists "pt_profile_media_public_select" on storage.objects;
create policy "pt_profile_media_public_select"
on storage.objects
for select
to public
using (
  bucket_id = 'pt_profile_media'
);

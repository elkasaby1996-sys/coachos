-- Remove over-broad storage object policies flagged by advisor on linked project.
-- Public read access for public buckets is already covered by storage_public_read.

drop policy if exists "Baseline photos delete 1u4rj0p_0" on storage.objects;
drop policy if exists "Baseline photos delete 1u4rj0p_1" on storage.objects;
drop policy if exists "pt_profile_media_public_select" on storage.objects;

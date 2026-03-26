-- Storage visibility policy:
-- Public buckets: avatars
-- Private buckets: every bucket except avatars
-- Private bucket objects enforce owner = auth.uid() for read/write/delete.

update storage.buckets
set public = case when id = 'avatars' then true else false end;

drop policy if exists "storage_public_read" on storage.objects;
drop policy if exists "storage_private_owner_select" on storage.objects;
drop policy if exists "storage_private_owner_insert" on storage.objects;
drop policy if exists "storage_private_owner_update" on storage.objects;
drop policy if exists "storage_private_owner_delete" on storage.objects;

create policy "storage_public_read"
  on storage.objects
  for select
  to public
  using (
    exists (
      select 1
      from storage.buckets b
      where b.id = storage.objects.bucket_id
        and b.public = true
    )
  );

create policy "storage_private_owner_select"
  on storage.objects
  for select
  to authenticated
  using (
    exists (
      select 1
      from storage.buckets b
      where b.id = storage.objects.bucket_id
        and b.public = false
    )
    and owner = auth.uid()
  );

create policy "storage_private_owner_insert"
  on storage.objects
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from storage.buckets b
      where b.id = storage.objects.bucket_id
        and b.public = false
    )
    and owner = auth.uid()
  );

create policy "storage_private_owner_update"
  on storage.objects
  for update
  to authenticated
  using (
    exists (
      select 1
      from storage.buckets b
      where b.id = storage.objects.bucket_id
        and b.public = false
    )
    and owner = auth.uid()
  )
  with check (
    exists (
      select 1
      from storage.buckets b
      where b.id = storage.objects.bucket_id
        and b.public = false
    )
    and owner = auth.uid()
  );

create policy "storage_private_owner_delete"
  on storage.objects
  for delete
  to authenticated
  using (
    exists (
      select 1
      from storage.buckets b
      where b.id = storage.objects.bucket_id
        and b.public = false
    )
    and owner = auth.uid()
  );

-- PR-05.5G: Let copied universal baseline photo rows authorize downloads of
-- their existing private storage object after workspace transfer.
--
-- Baseline photo objects are stored at {client_id}/{baseline_id}/{type}. When
-- PR-05.5E mirrors a universal baseline to the target relationship, the target
-- baseline_photos row keeps the original private storage_path instead of
-- physically duplicating the object. This policy keeps the bucket private while
-- allowing the active target relationship metadata row to authorize that object.

drop policy if exists "baseline_photos_objects_select" on storage.objects;
create policy "baseline_photos_objects_select"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'baseline_photos'
  and (
    exists (
      select 1
      from public.baseline_entries be
      join public.clients c on c.id = be.client_id
      where be.id::text = (storage.foldername(storage.objects.name))[2]
        and c.id::text = (storage.foldername(storage.objects.name))[1]
        and (
          c.user_id = (select auth.uid())
          or exists (
            select 1
            from public.workspace_members wm
            where wm.workspace_id = be.workspace_id
              and wm.user_id = (select auth.uid())
              and wm.role::text like 'pt_%'
          )
        )
    )
    or exists (
      select 1
      from public.baseline_photos bp
      join public.baseline_entries target_be
        on target_be.id = bp.baseline_id
      join public.clients target_c
        on target_c.id = bp.client_id
       and target_c.id = target_be.client_id
      where bp.storage_path = storage.objects.name
        and coalesce(target_c.relationship_status, 'active') = 'active'
        and (
          target_c.user_id = (select auth.uid())
          or exists (
            select 1
            from public.workspace_members wm
            where wm.workspace_id = target_be.workspace_id
              and wm.user_id = (select auth.uid())
              and wm.role::text like 'pt_%'
          )
        )
    )
  )
);

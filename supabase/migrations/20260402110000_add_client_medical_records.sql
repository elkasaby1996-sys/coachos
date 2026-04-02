create table if not exists public.client_medical_records (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  entry_type text not null check (entry_type in ('history', 'lab_result')),
  title text not null,
  result_value text,
  unit text,
  observed_at date,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint client_medical_records_lab_result_fields_check check (
    entry_type <> 'lab_result'
    or coalesce(nullif(trim(result_value), ''), null) is not null
  )
);

create index if not exists client_medical_records_client_created_idx
  on public.client_medical_records (client_id, created_at desc);

create index if not exists client_medical_records_client_observed_idx
  on public.client_medical_records (client_id, observed_at desc);

create or replace trigger set_client_medical_records_updated_at
before update on public.client_medical_records
for each row execute function public.set_updated_at();

alter table public.client_medical_records enable row level security;
alter table public.client_medical_records force row level security;

drop policy if exists "client_medical_records_access" on public.client_medical_records;
create policy "client_medical_records_access"
on public.client_medical_records
for all
to authenticated
using (
  exists (
    select 1
    from public.clients c
    where c.id = client_medical_records.client_id
      and c.workspace_id = client_medical_records.workspace_id
      and (
        c.user_id = auth.uid()
        or exists (
          select 1
          from public.workspace_members wm
          where wm.workspace_id = client_medical_records.workspace_id
            and wm.user_id = auth.uid()
            and wm.role::text like 'pt_%'
        )
      )
  )
)
with check (
  exists (
    select 1
    from public.clients c
    where c.id = client_medical_records.client_id
      and c.workspace_id = client_medical_records.workspace_id
      and (
        c.user_id = auth.uid()
        or exists (
          select 1
          from public.workspace_members wm
          where wm.workspace_id = client_medical_records.workspace_id
            and wm.user_id = auth.uid()
            and wm.role::text like 'pt_%'
        )
      )
  )
);

grant all on table public.client_medical_records to authenticated;
grant all on table public.client_medical_records to service_role;

create table if not exists public.client_medical_documents (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  medical_record_id uuid references public.client_medical_records(id) on delete set null,
  label text,
  file_name text not null,
  mime_type text,
  file_size bigint,
  storage_path text not null unique,
  observed_at date,
  uploaded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint client_medical_documents_file_size_check check (file_size is null or file_size >= 0)
);

create index if not exists client_medical_documents_client_created_idx
  on public.client_medical_documents (client_id, created_at desc);

alter table public.client_medical_documents enable row level security;
alter table public.client_medical_documents force row level security;

drop policy if exists "client_medical_documents_access" on public.client_medical_documents;
create policy "client_medical_documents_access"
on public.client_medical_documents
for all
to authenticated
using (
  exists (
    select 1
    from public.clients c
    where c.id = client_medical_documents.client_id
      and c.workspace_id = client_medical_documents.workspace_id
      and (
        c.user_id = auth.uid()
        or exists (
          select 1
          from public.workspace_members wm
          where wm.workspace_id = client_medical_documents.workspace_id
            and wm.user_id = auth.uid()
            and wm.role::text like 'pt_%'
        )
      )
  )
)
with check (
  exists (
    select 1
    from public.clients c
    where c.id = client_medical_documents.client_id
      and c.workspace_id = client_medical_documents.workspace_id
      and (
        c.user_id = auth.uid()
        or exists (
          select 1
          from public.workspace_members wm
          where wm.workspace_id = client_medical_documents.workspace_id
            and wm.user_id = auth.uid()
            and wm.role::text like 'pt_%'
        )
      )
  )
);

grant all on table public.client_medical_documents to authenticated;
grant all on table public.client_medical_documents to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'medical_documents',
  'medical_documents',
  false,
  15728640,
  array[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/heic',
    'image/heif'
  ]
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "medical_documents_objects_select" on storage.objects;
create policy "medical_documents_objects_select"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'medical_documents'
  and exists (
    select 1
    from public.clients c
    where c.id::text = (storage.foldername(name))[1]
      and (
        c.user_id = auth.uid()
        or exists (
          select 1
          from public.workspace_members wm
          where wm.workspace_id = c.workspace_id
            and wm.user_id = auth.uid()
            and wm.role::text like 'pt_%'
        )
      )
  )
);

drop policy if exists "medical_documents_objects_insert" on storage.objects;
create policy "medical_documents_objects_insert"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'medical_documents'
  and exists (
    select 1
    from public.clients c
    where c.id::text = (storage.foldername(name))[1]
      and (
        c.user_id = auth.uid()
        or exists (
          select 1
          from public.workspace_members wm
          where wm.workspace_id = c.workspace_id
            and wm.user_id = auth.uid()
            and wm.role::text like 'pt_%'
        )
      )
  )
);

drop policy if exists "medical_documents_objects_update" on storage.objects;
create policy "medical_documents_objects_update"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'medical_documents'
  and exists (
    select 1
    from public.clients c
    where c.id::text = (storage.foldername(name))[1]
      and (
        c.user_id = auth.uid()
        or exists (
          select 1
          from public.workspace_members wm
          where wm.workspace_id = c.workspace_id
            and wm.user_id = auth.uid()
            and wm.role::text like 'pt_%'
        )
      )
  )
)
with check (
  bucket_id = 'medical_documents'
  and exists (
    select 1
    from public.clients c
    where c.id::text = (storage.foldername(name))[1]
      and (
        c.user_id = auth.uid()
        or exists (
          select 1
          from public.workspace_members wm
          where wm.workspace_id = c.workspace_id
            and wm.user_id = auth.uid()
            and wm.role::text like 'pt_%'
        )
      )
  )
);

drop policy if exists "medical_documents_objects_delete" on storage.objects;
create policy "medical_documents_objects_delete"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'medical_documents'
  and exists (
    select 1
    from public.clients c
    where c.id::text = (storage.foldername(name))[1]
      and (
        c.user_id = auth.uid()
        or exists (
          select 1
          from public.workspace_members wm
          where wm.workspace_id = c.workspace_id
            and wm.user_id = auth.uid()
            and wm.role::text like 'pt_%'
        )
      )
  )
);

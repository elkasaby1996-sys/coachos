alter table public.pt_hub_settings
  add column if not exists full_name text,
  add column if not exists country text;

update public.pt_hub_settings as settings
set full_name = coalesce(settings.full_name, profile.full_name, profile.display_name)
from public.pt_hub_profiles as profile
where settings.user_id = profile.user_id
  and (settings.full_name is null or btrim(settings.full_name) = '');

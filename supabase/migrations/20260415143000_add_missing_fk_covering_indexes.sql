-- Add covering indexes for foreign keys flagged by Supabase advisor.
-- These are low-risk performance indexes that improve joins and FK checks.

create index if not exists baseline_entries_client_id_idx
  on public.baseline_entries using btree (client_id);

create index if not exists checkins_reviewed_by_user_id_idx
  on public.checkins using btree (reviewed_by_user_id);

create index if not exists client_lifecycle_events_workspace_id_idx
  on public.client_lifecycle_events using btree (workspace_id);

create index if not exists client_medical_documents_medical_record_id_idx
  on public.client_medical_documents using btree (medical_record_id);

create index if not exists client_medical_documents_uploaded_by_idx
  on public.client_medical_documents using btree (uploaded_by);

create index if not exists client_medical_documents_workspace_id_idx
  on public.client_medical_documents using btree (workspace_id);

create index if not exists client_medical_records_created_by_idx
  on public.client_medical_records using btree (created_by);

create index if not exists client_medical_records_workspace_id_idx
  on public.client_medical_records using btree (workspace_id);

create index if not exists client_program_assignments_client_id_idx
  on public.client_program_assignments using btree (client_id);

create index if not exists lead_chat_events_actor_user_id_idx
  on public.lead_chat_events using btree (actor_user_id);

create index if not exists lead_chat_events_conversation_id_idx
  on public.lead_chat_events using btree (conversation_id);

create index if not exists lead_conversation_participants_last_read_message_id_idx
  on public.lead_conversation_participants using btree (last_read_message_id);

create index if not exists lead_conversation_participants_user_id_idx
  on public.lead_conversation_participants using btree (user_id);

create index if not exists pt_hub_leads_converted_client_id_idx
  on public.pt_hub_leads using btree (converted_client_id);

create index if not exists pt_hub_leads_converted_workspace_id_idx
  on public.pt_hub_leads using btree (converted_workspace_id);

create index if not exists pt_profiles_workspace_id_idx
  on public.pt_profiles using btree (workspace_id);

create index if not exists workspace_client_onboardings_first_checkin_template_id_idx
  on public.workspace_client_onboardings using btree (first_checkin_template_id);

create index if not exists workspace_client_onboardings_first_program_template_id_idx
  on public.workspace_client_onboardings using btree (first_program_template_id);

create index if not exists workspace_client_onboardings_initial_baseline_entry_id_idx
  on public.workspace_client_onboardings using btree (initial_baseline_entry_id);

create index if not exists workspace_client_onboardings_reviewed_by_user_id_idx
  on public.workspace_client_onboardings using btree (reviewed_by_user_id);
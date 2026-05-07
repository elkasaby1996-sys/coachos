SET session_replication_role = replica;

--
-- PostgreSQL database dump
--

-- \restrict UwFWwOaeZ7WRThxLd3zlsEd9vlcP8N4NcVAfBs5oZTO2m4dcGg7AsDteVp8rJiO

-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.6

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Data for Name: audit_log_entries; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

INSERT INTO "auth"."audit_log_entries" ("instance_id", "id", "payload", "created_at", "ip_address") VALUES
	('00000000-0000-0000-0000-000000000000', 'ce4ce78e-986e-493b-8cdc-adf302b1938c', '{"action":"user_signedup","actor_id":"ef787189-cd97-4895-8906-89cc37487afd","actor_username":"client@test.com","actor_via_sso":false,"log_type":"team","traits":{"provider":"email"}}', '2026-04-09 12:40:04.382929+00', ''),
	('00000000-0000-0000-0000-000000000000', 'ca160a01-7e7c-4af2-b752-ba6ed20faa04', '{"action":"login","actor_id":"ef787189-cd97-4895-8906-89cc37487afd","actor_username":"client@test.com","actor_via_sso":false,"log_type":"account","traits":{"provider":"email"}}', '2026-04-09 12:40:04.442526+00', ''),
	('00000000-0000-0000-0000-000000000000', '2e96b79b-8292-4558-b556-cba528c4409e', '{"action":"user_signedup","actor_id":"763a1a63-f76f-4350-aad1-92e1861ced8e","actor_username":"pt@test.com","actor_via_sso":false,"log_type":"team","traits":{"provider":"email"}}', '2026-04-11 06:53:55.918354+00', ''),
	('00000000-0000-0000-0000-000000000000', 'a14c6674-36f6-4168-9fed-3f9ef61bcce6', '{"action":"login","actor_id":"763a1a63-f76f-4350-aad1-92e1861ced8e","actor_username":"pt@test.com","actor_via_sso":false,"log_type":"account","traits":{"provider":"email"}}', '2026-04-11 06:53:55.973817+00', ''),
	('00000000-0000-0000-0000-000000000000', 'd909a17d-e842-4c00-9495-65380ace3627', '{"action":"token_refreshed","actor_id":"763a1a63-f76f-4350-aad1-92e1861ced8e","actor_username":"pt@test.com","actor_via_sso":false,"log_type":"token"}', '2026-04-11 08:33:51.647037+00', ''),
	('00000000-0000-0000-0000-000000000000', 'e87f13f2-84db-4d77-a28e-d565ef474691', '{"action":"token_revoked","actor_id":"763a1a63-f76f-4350-aad1-92e1861ced8e","actor_username":"pt@test.com","actor_via_sso":false,"log_type":"token"}', '2026-04-11 08:33:51.659363+00', ''),
	('00000000-0000-0000-0000-000000000000', '44605350-5876-44cc-8046-5242a248c3fa', '{"action":"token_refreshed","actor_id":"763a1a63-f76f-4350-aad1-92e1861ced8e","actor_username":"pt@test.com","actor_via_sso":false,"log_type":"token"}', '2026-04-11 09:42:05.587576+00', ''),
	('00000000-0000-0000-0000-000000000000', 'f23f159b-2e36-4408-b7e3-4820552ac42f', '{"action":"token_revoked","actor_id":"763a1a63-f76f-4350-aad1-92e1861ced8e","actor_username":"pt@test.com","actor_via_sso":false,"log_type":"token"}', '2026-04-11 09:42:05.599689+00', ''),
	('00000000-0000-0000-0000-000000000000', '7be866ef-b304-4ac7-b115-4a6e83857c87', '{"action":"logout","actor_id":"763a1a63-f76f-4350-aad1-92e1861ced8e","actor_username":"pt@test.com","actor_via_sso":false,"log_type":"account"}', '2026-04-11 10:32:31.454432+00', ''),
	('00000000-0000-0000-0000-000000000000', 'dce3cdff-fdbe-4785-ad90-8b1e889a7801', '{"action":"login","actor_id":"763a1a63-f76f-4350-aad1-92e1861ced8e","actor_username":"pt@test.com","actor_via_sso":false,"log_type":"account","traits":{"provider":"email"}}', '2026-04-11 10:33:01.708026+00', ''),
	('00000000-0000-0000-0000-000000000000', 'c29e2234-172f-414e-821d-91a62982cfb0', '{"action":"token_refreshed","actor_id":"763a1a63-f76f-4350-aad1-92e1861ced8e","actor_username":"pt@test.com","actor_via_sso":false,"log_type":"token"}', '2026-04-11 11:31:31.622482+00', ''),
	('00000000-0000-0000-0000-000000000000', 'cd92f5fc-e061-4519-9f06-9bf6d1c50dd6', '{"action":"token_revoked","actor_id":"763a1a63-f76f-4350-aad1-92e1861ced8e","actor_username":"pt@test.com","actor_via_sso":false,"log_type":"token"}', '2026-04-11 11:31:31.63161+00', ''),
	('00000000-0000-0000-0000-000000000000', 'b0153a43-ddb0-4089-90ec-d5b4729190e8', '{"action":"logout","actor_id":"763a1a63-f76f-4350-aad1-92e1861ced8e","actor_username":"pt@test.com","actor_via_sso":false,"log_type":"account"}', '2026-04-11 11:40:35.811016+00', ''),
	('00000000-0000-0000-0000-000000000000', 'ae5349a4-4706-4e87-9b64-8b08157ef90d', '{"action":"login","actor_id":"763a1a63-f76f-4350-aad1-92e1861ced8e","actor_username":"pt@test.com","actor_via_sso":false,"log_type":"account","traits":{"provider":"email"}}', '2026-04-11 11:41:32.220289+00', ''),
	('00000000-0000-0000-0000-000000000000', '2835ee93-df01-4730-9af5-13433ca185e1', '{"action":"user_modified","actor_id":"763a1a63-f76f-4350-aad1-92e1861ced8e","actor_name":"Ahmed Mohamed","actor_username":"pt@test.com","actor_via_sso":false,"log_type":"user"}', '2026-04-11 11:50:33.816295+00', ''),
	('00000000-0000-0000-0000-000000000000', '9218a06f-6a28-4c4a-9761-9548d50e01d5', '{"action":"login","actor_id":"ef787189-cd97-4895-8906-89cc37487afd","actor_username":"client@test.com","actor_via_sso":false,"log_type":"account","traits":{"provider":"email"}}', '2026-04-11 11:51:52.029862+00', ''),
	('00000000-0000-0000-0000-000000000000', '0ccd5753-74a4-4160-b558-092582f283fd', '{"action":"login","actor_id":"763a1a63-f76f-4350-aad1-92e1861ced8e","actor_name":"Ahmed Mohamed","actor_username":"pt@test.com","actor_via_sso":false,"log_type":"account","traits":{"provider":"email"}}', '2026-04-11 12:00:00.258504+00', ''),
	('00000000-0000-0000-0000-000000000000', 'f007c31d-61ef-46fe-833b-3c2d10f10912', '{"action":"login","actor_id":"ef787189-cd97-4895-8906-89cc37487afd","actor_username":"client@test.com","actor_via_sso":false,"log_type":"account","traits":{"provider":"email"}}', '2026-04-11 12:00:46.440559+00', ''),
	('00000000-0000-0000-0000-000000000000', 'adb01445-ca07-4e0c-8c1b-20c2a4cf396d', '{"action":"user_modified","actor_id":"ef787189-cd97-4895-8906-89cc37487afd","actor_name":"Ahmed Elkasaby","actor_username":"client@test.com","actor_via_sso":false,"log_type":"user"}', '2026-04-11 12:01:00.253606+00', ''),
	('00000000-0000-0000-0000-000000000000', 'a165c33c-0ef9-49c8-95b1-fcf2c9a31f41', '{"action":"login","actor_id":"ef787189-cd97-4895-8906-89cc37487afd","actor_name":"Ahmed Elkasaby","actor_username":"client@test.com","actor_via_sso":false,"log_type":"account","traits":{"provider":"email"}}', '2026-04-11 12:02:27.818388+00', ''),
	('00000000-0000-0000-0000-000000000000', '0f5e3828-8073-4246-badc-af3971ade693', '{"action":"logout","actor_id":"763a1a63-f76f-4350-aad1-92e1861ced8e","actor_name":"Ahmed Mohamed","actor_username":"pt@test.com","actor_via_sso":false,"log_type":"account"}', '2026-04-11 12:07:33.727638+00', ''),
	('00000000-0000-0000-0000-000000000000', 'a654712a-9f97-4237-addf-35a4232677dd', '{"action":"login","actor_id":"763a1a63-f76f-4350-aad1-92e1861ced8e","actor_name":"Ahmed Mohamed","actor_username":"pt@test.com","actor_via_sso":false,"log_type":"account","traits":{"provider":"email"}}', '2026-04-11 12:07:46.56783+00', ''),
	('00000000-0000-0000-0000-000000000000', '870b6d7a-4dc2-4018-ae52-449d765bd572', '{"action":"user_signedup","actor_id":"00000000-0000-0000-0000-000000000000","actor_username":"service_role","actor_via_sso":false,"log_type":"team","traits":{"provider":"email","user_email":"debug-pt-1775910977395@repsync.test","user_id":"5880f44b-ecff-4793-a02a-817f801d7606","user_phone":""}}', '2026-04-11 12:36:17.658852+00', ''),
	('00000000-0000-0000-0000-000000000000', '593bf329-bd1d-49f4-9133-4e4a63c7b237', '{"action":"login","actor_id":"5880f44b-ecff-4793-a02a-817f801d7606","actor_name":"Debug PT","actor_username":"debug-pt-1775910977395@repsync.test","actor_via_sso":false,"log_type":"account","traits":{"provider":"email"}}', '2026-04-11 12:36:17.92629+00', ''),
	('00000000-0000-0000-0000-000000000000', '3dcbcc2d-6e33-49ea-a57b-59f1e7f0fa4f', '{"action":"login","actor_id":"763a1a63-f76f-4350-aad1-92e1861ced8e","actor_name":"Ahmed Mohamed","actor_username":"pt@test.com","actor_via_sso":false,"log_type":"account","traits":{"provider":"email"}}', '2026-04-11 12:44:57.747386+00', ''),
	('00000000-0000-0000-0000-000000000000', 'c829e304-d0b4-4a7a-a545-e29ed202ff64', '{"action":"login","actor_id":"763a1a63-f76f-4350-aad1-92e1861ced8e","actor_name":"Ahmed Mohamed","actor_username":"pt@test.com","actor_via_sso":false,"log_type":"account","traits":{"provider":"email"}}', '2026-04-12 06:11:24.634962+00', ''),
	('00000000-0000-0000-0000-000000000000', 'c1845508-2721-4973-bc15-95cf5b0b6311', '{"action":"login","actor_id":"763a1a63-f76f-4350-aad1-92e1861ced8e","actor_name":"Ahmed Mohamed","actor_username":"pt@test.com","actor_via_sso":false,"log_type":"account","traits":{"provider":"email"}}', '2026-04-12 06:24:48.598434+00', ''),
	('00000000-0000-0000-0000-000000000000', 'a3893033-b809-4ad0-a9d4-fb042eea2b9e', '{"action":"token_refreshed","actor_id":"763a1a63-f76f-4350-aad1-92e1861ced8e","actor_name":"Ahmed Mohamed","actor_username":"pt@test.com","actor_via_sso":false,"log_type":"token"}', '2026-04-12 07:25:57.386678+00', ''),
	('00000000-0000-0000-0000-000000000000', 'd047964d-2a8a-4fef-9496-97f666fb5750', '{"action":"token_revoked","actor_id":"763a1a63-f76f-4350-aad1-92e1861ced8e","actor_name":"Ahmed Mohamed","actor_username":"pt@test.com","actor_via_sso":false,"log_type":"token"}', '2026-04-12 07:25:57.396703+00', ''),
	('00000000-0000-0000-0000-000000000000', '82c2c378-5999-417d-9e5e-2e4974ff85ab', '{"action":"login","actor_id":"763a1a63-f76f-4350-aad1-92e1861ced8e","actor_name":"Ahmed Mohamed","actor_username":"pt@test.com","actor_via_sso":false,"log_type":"account","traits":{"provider":"email"}}', '2026-04-12 07:42:56.420069+00', ''),
	('00000000-0000-0000-0000-000000000000', '567a0f19-aaf6-4c12-88fc-c3f23c48c557', '{"action":"logout","actor_id":"763a1a63-f76f-4350-aad1-92e1861ced8e","actor_name":"Ahmed Mohamed","actor_username":"pt@test.com","actor_via_sso":false,"log_type":"account"}', '2026-04-12 07:43:46.078899+00', ''),
	('00000000-0000-0000-0000-000000000000', 'f0e9719d-d1ad-443f-bda5-f99b8f90b4d2', '{"action":"login","actor_id":"763a1a63-f76f-4350-aad1-92e1861ced8e","actor_name":"Ahmed Mohamed","actor_username":"pt@test.com","actor_via_sso":false,"log_type":"account","traits":{"provider":"email"}}', '2026-04-12 07:43:53.822505+00', ''),
	('00000000-0000-0000-0000-000000000000', '37673348-4d74-43bc-bbc9-8f795e9d39ae', '{"action":"login","actor_id":"ef787189-cd97-4895-8906-89cc37487afd","actor_name":"Ahmed Elkasaby","actor_username":"client@test.com","actor_via_sso":false,"log_type":"account","traits":{"provider":"email"}}', '2026-04-12 11:03:37.530575+00', ''),
	('00000000-0000-0000-0000-000000000000', '20e56e06-d2fa-4500-99b2-12aab2a7695c', '{"action":"token_refreshed","actor_id":"ef787189-cd97-4895-8906-89cc37487afd","actor_name":"Ahmed Elkasaby","actor_username":"client@test.com","actor_via_sso":false,"log_type":"token"}', '2026-04-12 12:05:15.375539+00', ''),
	('00000000-0000-0000-0000-000000000000', '14d51a5d-f64c-4409-81e9-61fe0fb09eb4', '{"action":"token_revoked","actor_id":"ef787189-cd97-4895-8906-89cc37487afd","actor_name":"Ahmed Elkasaby","actor_username":"client@test.com","actor_via_sso":false,"log_type":"token"}', '2026-04-12 12:05:15.396961+00', ''),
	('00000000-0000-0000-0000-000000000000', '4621fb87-b0f2-46b7-bb50-604a6bd0a2f5', '{"action":"token_refreshed","actor_id":"763a1a63-f76f-4350-aad1-92e1861ced8e","actor_name":"Ahmed Mohamed","actor_username":"pt@test.com","actor_via_sso":false,"log_type":"token"}', '2026-04-12 12:26:11.732537+00', ''),
	('00000000-0000-0000-0000-000000000000', '48805bda-968a-4f63-82b4-90b5b08054eb', '{"action":"token_revoked","actor_id":"763a1a63-f76f-4350-aad1-92e1861ced8e","actor_name":"Ahmed Mohamed","actor_username":"pt@test.com","actor_via_sso":false,"log_type":"token"}', '2026-04-12 12:26:11.746447+00', ''),
	('00000000-0000-0000-0000-000000000000', 'f8010f70-b9ec-4a85-b5ba-0657d5d29272', '{"action":"token_refreshed","actor_id":"ef787189-cd97-4895-8906-89cc37487afd","actor_name":"Ahmed Elkasaby","actor_username":"client@test.com","actor_via_sso":false,"log_type":"token"}', '2026-04-13 05:56:53.321136+00', ''),
	('00000000-0000-0000-0000-000000000000', 'c8ce2fda-c3af-415a-b75c-625ba9585619', '{"action":"token_revoked","actor_id":"ef787189-cd97-4895-8906-89cc37487afd","actor_name":"Ahmed Elkasaby","actor_username":"client@test.com","actor_via_sso":false,"log_type":"token"}', '2026-04-13 05:56:53.326165+00', ''),
	('00000000-0000-0000-0000-000000000000', '91df1320-877b-4e9f-b9a3-80b3ad2e8084', '{"action":"token_refreshed","actor_id":"ef787189-cd97-4895-8906-89cc37487afd","actor_name":"Ahmed Elkasaby","actor_username":"client@test.com","actor_via_sso":false,"log_type":"token"}', '2026-04-13 07:15:42.344373+00', ''),
	('00000000-0000-0000-0000-000000000000', 'a660b430-b5e0-4459-ab57-ba055861fec0', '{"action":"token_revoked","actor_id":"ef787189-cd97-4895-8906-89cc37487afd","actor_name":"Ahmed Elkasaby","actor_username":"client@test.com","actor_via_sso":false,"log_type":"token"}', '2026-04-13 07:15:42.357621+00', ''),
	('00000000-0000-0000-0000-000000000000', 'af526121-a144-40f8-b794-71a0d28c159a', '{"action":"token_refreshed","actor_id":"ef787189-cd97-4895-8906-89cc37487afd","actor_name":"Ahmed Elkasaby","actor_username":"client@test.com","actor_via_sso":false,"log_type":"token"}', '2026-04-13 08:14:06.014813+00', ''),
	('00000000-0000-0000-0000-000000000000', 'b2d74c26-e15d-438f-a15b-8fb1715bfc4e', '{"action":"token_revoked","actor_id":"ef787189-cd97-4895-8906-89cc37487afd","actor_name":"Ahmed Elkasaby","actor_username":"client@test.com","actor_via_sso":false,"log_type":"token"}', '2026-04-13 08:14:06.028312+00', ''),
	('00000000-0000-0000-0000-000000000000', 'ec8481b4-71f7-461b-9cd2-e58f1abc2db0', '{"action":"token_refreshed","actor_id":"763a1a63-f76f-4350-aad1-92e1861ced8e","actor_name":"Ahmed Mohamed","actor_username":"pt@test.com","actor_via_sso":false,"log_type":"token"}', '2026-04-13 08:44:19.01584+00', ''),
	('00000000-0000-0000-0000-000000000000', 'a98fc92c-bb5c-43f8-8da5-490490dfcd7b', '{"action":"token_revoked","actor_id":"763a1a63-f76f-4350-aad1-92e1861ced8e","actor_name":"Ahmed Mohamed","actor_username":"pt@test.com","actor_via_sso":false,"log_type":"token"}', '2026-04-13 08:44:19.032974+00', ''),
	('00000000-0000-0000-0000-000000000000', '3e0edc1a-6f19-4973-bc49-4f7269cb0808', '{"action":"token_refreshed","actor_id":"ef787189-cd97-4895-8906-89cc37487afd","actor_name":"Ahmed Elkasaby","actor_username":"client@test.com","actor_via_sso":false,"log_type":"token"}', '2026-04-13 09:12:53.876143+00', ''),
	('00000000-0000-0000-0000-000000000000', '91820410-8674-4826-a3c1-0bad56684e1e', '{"action":"token_revoked","actor_id":"ef787189-cd97-4895-8906-89cc37487afd","actor_name":"Ahmed Elkasaby","actor_username":"client@test.com","actor_via_sso":false,"log_type":"token"}', '2026-04-13 09:12:53.885788+00', ''),
	('00000000-0000-0000-0000-000000000000', 'eaddad78-ca5e-42c4-b222-fd4b56d27f07', '{"action":"token_refreshed","actor_id":"ef787189-cd97-4895-8906-89cc37487afd","actor_name":"Ahmed Elkasaby","actor_username":"client@test.com","actor_via_sso":false,"log_type":"token"}', '2026-04-13 10:11:38.21564+00', ''),
	('00000000-0000-0000-0000-000000000000', '9e81e91f-8b22-4c6f-85dd-4bcddae3f65e', '{"action":"token_revoked","actor_id":"ef787189-cd97-4895-8906-89cc37487afd","actor_name":"Ahmed Elkasaby","actor_username":"client@test.com","actor_via_sso":false,"log_type":"token"}', '2026-04-13 10:11:38.221659+00', ''),
	('00000000-0000-0000-0000-000000000000', 'fd2d77e3-53c4-466e-a33b-73c8c61a2a57', '{"action":"token_refreshed","actor_id":"ef787189-cd97-4895-8906-89cc37487afd","actor_name":"Ahmed Elkasaby","actor_username":"client@test.com","actor_via_sso":false,"log_type":"token"}', '2026-04-13 11:09:58.347162+00', ''),
	('00000000-0000-0000-0000-000000000000', '3738eb71-f306-4ef0-a047-afdb36d2ddfc', '{"action":"token_revoked","actor_id":"ef787189-cd97-4895-8906-89cc37487afd","actor_name":"Ahmed Elkasaby","actor_username":"client@test.com","actor_via_sso":false,"log_type":"token"}', '2026-04-13 11:09:58.362018+00', ''),
	('00000000-0000-0000-0000-000000000000', 'ba566f03-bbdd-4e76-9c25-ab359a8733bc', '{"action":"token_refreshed","actor_id":"ef787189-cd97-4895-8906-89cc37487afd","actor_name":"Ahmed Elkasaby","actor_username":"client@test.com","actor_via_sso":false,"log_type":"token"}', '2026-04-13 12:08:06.973259+00', ''),
	('00000000-0000-0000-0000-000000000000', '46ccafe0-3e0e-46c7-b7dc-f438efbad4dd', '{"action":"token_revoked","actor_id":"ef787189-cd97-4895-8906-89cc37487afd","actor_name":"Ahmed Elkasaby","actor_username":"client@test.com","actor_via_sso":false,"log_type":"token"}', '2026-04-13 12:08:06.989475+00', ''),
	('00000000-0000-0000-0000-000000000000', '21c59b52-e950-4934-8dcc-d8624da93293', '{"action":"token_refreshed","actor_id":"ef787189-cd97-4895-8906-89cc37487afd","actor_name":"Ahmed Elkasaby","actor_username":"client@test.com","actor_via_sso":false,"log_type":"token"}', '2026-04-13 13:06:44.526921+00', ''),
	('00000000-0000-0000-0000-000000000000', '0c6ede8f-5140-48d5-a186-d0129bd07f16', '{"action":"token_revoked","actor_id":"ef787189-cd97-4895-8906-89cc37487afd","actor_name":"Ahmed Elkasaby","actor_username":"client@test.com","actor_via_sso":false,"log_type":"token"}', '2026-04-13 13:06:44.53565+00', ''),
	('00000000-0000-0000-0000-000000000000', 'aff5aee8-ca0d-4d2b-9d76-4bfd529b53d2', '{"action":"token_refreshed","actor_id":"ef787189-cd97-4895-8906-89cc37487afd","actor_name":"Ahmed Elkasaby","actor_username":"client@test.com","actor_via_sso":false,"log_type":"token"}', '2026-04-14 06:22:22.846173+00', ''),
	('00000000-0000-0000-0000-000000000000', 'e601a0a9-721f-4a86-83a0-934c03ae24c5', '{"action":"token_revoked","actor_id":"ef787189-cd97-4895-8906-89cc37487afd","actor_name":"Ahmed Elkasaby","actor_username":"client@test.com","actor_via_sso":false,"log_type":"token"}', '2026-04-14 06:22:22.851755+00', ''),
	('00000000-0000-0000-0000-000000000000', '67564d26-4473-4e99-8f13-45901f7ec935', '{"action":"token_refreshed","actor_id":"ef787189-cd97-4895-8906-89cc37487afd","actor_name":"Ahmed Elkasaby","actor_username":"client@test.com","actor_via_sso":false,"log_type":"token"}', '2026-04-14 07:23:51.897787+00', ''),
	('00000000-0000-0000-0000-000000000000', '1e7cd13d-93d3-4386-899e-111b0771565f', '{"action":"token_revoked","actor_id":"ef787189-cd97-4895-8906-89cc37487afd","actor_name":"Ahmed Elkasaby","actor_username":"client@test.com","actor_via_sso":false,"log_type":"token"}', '2026-04-14 07:23:51.930069+00', ''),
	('00000000-0000-0000-0000-000000000000', '49ff0637-48e1-4afe-9460-fd872d32a5fd', '{"action":"token_refreshed","actor_id":"ef787189-cd97-4895-8906-89cc37487afd","actor_name":"Ahmed Elkasaby","actor_username":"client@test.com","actor_via_sso":false,"log_type":"token"}', '2026-04-14 08:22:18.24817+00', ''),
	('00000000-0000-0000-0000-000000000000', '33bf6da1-c339-4982-b848-145fd3ed5ed5', '{"action":"token_revoked","actor_id":"ef787189-cd97-4895-8906-89cc37487afd","actor_name":"Ahmed Elkasaby","actor_username":"client@test.com","actor_via_sso":false,"log_type":"token"}', '2026-04-14 08:22:18.269261+00', ''),
	('00000000-0000-0000-0000-000000000000', '2f6faf22-4efd-4238-8d09-d236efc11697', '{"action":"logout","actor_id":"ef787189-cd97-4895-8906-89cc37487afd","actor_name":"Ahmed Elkasaby","actor_username":"client@test.com","actor_via_sso":false,"log_type":"account"}', '2026-04-14 08:24:47.894328+00', ''),
	('00000000-0000-0000-0000-000000000000', '49e3396f-1ecc-49c6-826e-e1eaac985929', '{"action":"login","actor_id":"763a1a63-f76f-4350-aad1-92e1861ced8e","actor_name":"Ahmed Mohamed","actor_username":"pt@test.com","actor_via_sso":false,"log_type":"account","traits":{"provider":"email"}}', '2026-04-14 08:25:02.176292+00', ''),
	('00000000-0000-0000-0000-000000000000', '51f1a841-7d20-4c82-8c20-6b0696a227da', '{"action":"logout","actor_id":"763a1a63-f76f-4350-aad1-92e1861ced8e","actor_name":"Ahmed Mohamed","actor_username":"pt@test.com","actor_via_sso":false,"log_type":"account"}', '2026-04-14 08:29:49.728728+00', ''),
	('00000000-0000-0000-0000-000000000000', '88500042-5290-4851-b9a7-b28db4b021da', '{"action":"login","actor_id":"ef787189-cd97-4895-8906-89cc37487afd","actor_name":"Ahmed Elkasaby","actor_username":"client@test.com","actor_via_sso":false,"log_type":"account","traits":{"provider":"email"}}', '2026-04-14 08:30:03.748148+00', ''),
	('00000000-0000-0000-0000-000000000000', 'aca5868c-5cc4-4fbb-b2b2-2efe91197661', '{"action":"login","actor_id":"ef787189-cd97-4895-8906-89cc37487afd","actor_name":"Ahmed Elkasaby","actor_username":"client@test.com","actor_via_sso":false,"log_type":"account","traits":{"provider":"email"}}', '2026-04-14 09:27:47.592209+00', ''),
	('00000000-0000-0000-0000-000000000000', '1c5764a2-510b-4fe4-8141-826ef0a0bf3a', '{"action":"login","actor_id":"ef787189-cd97-4895-8906-89cc37487afd","actor_name":"Ahmed Elkasaby","actor_username":"client@test.com","actor_via_sso":false,"log_type":"account","traits":{"provider":"email"}}', '2026-04-14 10:01:33.741407+00', ''),
	('00000000-0000-0000-0000-000000000000', '14ea619a-3dd1-4275-ab80-de0dce180141', '{"action":"token_refreshed","actor_id":"ef787189-cd97-4895-8906-89cc37487afd","actor_name":"Ahmed Elkasaby","actor_username":"client@test.com","actor_via_sso":false,"log_type":"token"}', '2026-04-14 10:09:50.39846+00', ''),
	('00000000-0000-0000-0000-000000000000', 'fb9708ea-6597-4eb3-904d-80db193bb94c', '{"action":"token_revoked","actor_id":"ef787189-cd97-4895-8906-89cc37487afd","actor_name":"Ahmed Elkasaby","actor_username":"client@test.com","actor_via_sso":false,"log_type":"token"}', '2026-04-14 10:09:50.408553+00', ''),
	('00000000-0000-0000-0000-000000000000', '5885ed50-386e-45da-80df-a15d41f6d14d', '{"action":"logout","actor_id":"ef787189-cd97-4895-8906-89cc37487afd","actor_name":"Ahmed Elkasaby","actor_username":"client@test.com","actor_via_sso":false,"log_type":"account"}', '2026-04-14 10:10:03.967271+00', ''),
	('00000000-0000-0000-0000-000000000000', '034a9c9f-a57c-4049-a2ae-fa6785921b94', '{"action":"login","actor_id":"763a1a63-f76f-4350-aad1-92e1861ced8e","actor_name":"Ahmed Mohamed","actor_username":"pt@test.com","actor_via_sso":false,"log_type":"account","traits":{"provider":"email"}}', '2026-04-14 10:27:43.429828+00', ''),
	('00000000-0000-0000-0000-000000000000', 'a138f2c9-dfe9-4e16-a410-f5f24bf028f8', '{"action":"logout","actor_id":"763a1a63-f76f-4350-aad1-92e1861ced8e","actor_name":"Ahmed Mohamed","actor_username":"pt@test.com","actor_via_sso":false,"log_type":"account"}', '2026-04-14 10:28:44.344134+00', ''),
	('00000000-0000-0000-0000-000000000000', '910c49fe-47d5-4590-aff2-db5261c76e8f', '{"action":"login","actor_id":"ef787189-cd97-4895-8906-89cc37487afd","actor_name":"Ahmed Elkasaby","actor_username":"client@test.com","actor_via_sso":false,"log_type":"account","traits":{"provider":"email"}}', '2026-04-14 10:28:53.267214+00', ''),
	('00000000-0000-0000-0000-000000000000', '9c390d5a-672b-4e03-9c09-ef4ba0828f1e', '{"action":"logout","actor_id":"ef787189-cd97-4895-8906-89cc37487afd","actor_name":"Ahmed Elkasaby","actor_username":"client@test.com","actor_via_sso":false,"log_type":"account"}', '2026-04-14 10:32:05.406759+00', ''),
	('00000000-0000-0000-0000-000000000000', '6736aee6-acfd-4d0b-a4a1-3eca0ef9ae53', '{"action":"login","actor_id":"763a1a63-f76f-4350-aad1-92e1861ced8e","actor_name":"Ahmed Mohamed","actor_username":"pt@test.com","actor_via_sso":false,"log_type":"account","traits":{"provider":"email"}}', '2026-04-14 10:32:14.711779+00', ''),
	('00000000-0000-0000-0000-000000000000', '87514689-a18b-4e5f-9a03-85f871de1090', '{"action":"logout","actor_id":"763a1a63-f76f-4350-aad1-92e1861ced8e","actor_name":"Ahmed Mohamed","actor_username":"pt@test.com","actor_via_sso":false,"log_type":"account"}', '2026-04-14 10:45:48.804599+00', ''),
	('00000000-0000-0000-0000-000000000000', 'c389bb2d-151e-452d-b3a7-f219e8560f38', '{"action":"login","actor_id":"ef787189-cd97-4895-8906-89cc37487afd","actor_name":"Ahmed Elkasaby","actor_username":"client@test.com","actor_via_sso":false,"log_type":"account","traits":{"provider":"email"}}', '2026-04-14 10:45:58.967209+00', ''),
	('00000000-0000-0000-0000-000000000000', '0817cd09-c29e-42f3-a95e-829594557866', '{"action":"logout","actor_id":"ef787189-cd97-4895-8906-89cc37487afd","actor_name":"Ahmed Elkasaby","actor_username":"client@test.com","actor_via_sso":false,"log_type":"account"}', '2026-04-14 10:54:31.088781+00', ''),
	('00000000-0000-0000-0000-000000000000', 'ff974546-8b3a-49d2-93ee-983dccc7fdcc', '{"action":"login","actor_id":"763a1a63-f76f-4350-aad1-92e1861ced8e","actor_name":"Ahmed Mohamed","actor_username":"pt@test.com","actor_via_sso":false,"log_type":"account","traits":{"provider":"email"}}', '2026-04-14 10:54:41.760869+00', ''),
	('00000000-0000-0000-0000-000000000000', '7948a766-7fc3-4b09-a754-3f5450b42f6e', '{"action":"logout","actor_id":"763a1a63-f76f-4350-aad1-92e1861ced8e","actor_name":"Ahmed Mohamed","actor_username":"pt@test.com","actor_via_sso":false,"log_type":"account"}', '2026-04-14 11:04:00.865148+00', ''),
	('00000000-0000-0000-0000-000000000000', '16a9cd75-c20e-4cb6-8f39-aafd6a39470e', '{"action":"login","actor_id":"ef787189-cd97-4895-8906-89cc37487afd","actor_name":"Ahmed Elkasaby","actor_username":"client@test.com","actor_via_sso":false,"log_type":"account","traits":{"provider":"email"}}', '2026-04-14 11:04:15.925469+00', ''),
	('00000000-0000-0000-0000-000000000000', '89c84647-5bfe-4af9-8585-e63ec43931fe', '{"action":"logout","actor_id":"ef787189-cd97-4895-8906-89cc37487afd","actor_name":"Ahmed Elkasaby","actor_username":"client@test.com","actor_via_sso":false,"log_type":"account"}', '2026-04-14 11:04:39.990365+00', ''),
	('00000000-0000-0000-0000-000000000000', '76c02f69-1f58-46fb-8438-2e16b056640b', '{"action":"login","actor_id":"763a1a63-f76f-4350-aad1-92e1861ced8e","actor_name":"Ahmed Mohamed","actor_username":"pt@test.com","actor_via_sso":false,"log_type":"account","traits":{"provider":"email"}}', '2026-04-14 11:04:51.661123+00', ''),
	('00000000-0000-0000-0000-000000000000', 'd5ed9039-504a-4694-868d-a8586cd0d116', '{"action":"logout","actor_id":"763a1a63-f76f-4350-aad1-92e1861ced8e","actor_name":"Ahmed Mohamed","actor_username":"pt@test.com","actor_via_sso":false,"log_type":"account"}', '2026-04-14 11:37:48.978681+00', ''),
	('00000000-0000-0000-0000-000000000000', '960b1336-7552-4df5-bfe0-44b0e9126f31', '{"action":"login","actor_id":"ef787189-cd97-4895-8906-89cc37487afd","actor_name":"Ahmed Elkasaby","actor_username":"client@test.com","actor_via_sso":false,"log_type":"account","traits":{"provider":"email"}}', '2026-04-14 11:38:00.186165+00', ''),
	('00000000-0000-0000-0000-000000000000', '618f3e3f-8e5a-4e44-a9bb-cd8761d4d329', '{"action":"logout","actor_id":"ef787189-cd97-4895-8906-89cc37487afd","actor_name":"Ahmed Elkasaby","actor_username":"client@test.com","actor_via_sso":false,"log_type":"account"}', '2026-04-14 11:38:33.874415+00', ''),
	('00000000-0000-0000-0000-000000000000', '77367233-a56f-455b-a351-cfc135393e9e', '{"action":"login","actor_id":"763a1a63-f76f-4350-aad1-92e1861ced8e","actor_name":"Ahmed Mohamed","actor_username":"pt@test.com","actor_via_sso":false,"log_type":"account","traits":{"provider":"email"}}', '2026-04-14 11:38:43.505615+00', ''),
	('00000000-0000-0000-0000-000000000000', '3cf08224-7fd8-4f12-a208-4427a55a4ad6', '{"action":"logout","actor_id":"763a1a63-f76f-4350-aad1-92e1861ced8e","actor_name":"Ahmed Mohamed","actor_username":"pt@test.com","actor_via_sso":false,"log_type":"account"}', '2026-04-14 11:40:23.677595+00', ''),
	('00000000-0000-0000-0000-000000000000', '908d07ca-be5b-4074-a024-b2346e4f670f', '{"action":"login","actor_id":"ef787189-cd97-4895-8906-89cc37487afd","actor_name":"Ahmed Elkasaby","actor_username":"client@test.com","actor_via_sso":false,"log_type":"account","traits":{"provider":"email"}}', '2026-04-14 11:40:40.57225+00', ''),
	('00000000-0000-0000-0000-000000000000', 'd122aca6-eb73-45c1-a010-311b23b07ab2', '{"action":"login","actor_id":"763a1a63-f76f-4350-aad1-92e1861ced8e","actor_name":"Ahmed Mohamed","actor_username":"pt@test.com","actor_via_sso":false,"log_type":"account","traits":{"provider":"email"}}', '2026-04-14 11:40:50.615716+00', ''),
	('00000000-0000-0000-0000-000000000000', '5f7c34ae-ac04-4749-a46f-c57cfeb87370', '{"action":"login","actor_id":"763a1a63-f76f-4350-aad1-92e1861ced8e","actor_name":"Ahmed Mohamed","actor_username":"pt@test.com","actor_via_sso":false,"log_type":"account","traits":{"provider":"email"}}', '2026-04-14 12:27:53.925702+00', ''),
	('00000000-0000-0000-0000-000000000000', '0bbb3221-35ad-4222-b10a-24ca67dc6bea', '{"action":"login","actor_id":"ef787189-cd97-4895-8906-89cc37487afd","actor_name":"Ahmed Elkasaby","actor_username":"client@test.com","actor_via_sso":false,"log_type":"account","traits":{"provider":"email"}}', '2026-04-14 12:28:05.279905+00', ''),
	('00000000-0000-0000-0000-000000000000', '98bed146-ff9f-47ec-8edf-ddbc801ec5d0', '{"action":"login","actor_id":"763a1a63-f76f-4350-aad1-92e1861ced8e","actor_name":"Ahmed Mohamed","actor_username":"pt@test.com","actor_via_sso":false,"log_type":"account","traits":{"provider":"email"}}', '2026-04-14 12:33:35.863883+00', ''),
	('00000000-0000-0000-0000-000000000000', '090c6b93-fb35-4415-add2-485923361663', '{"action":"token_refreshed","actor_id":"763a1a63-f76f-4350-aad1-92e1861ced8e","actor_name":"Ahmed Mohamed","actor_username":"pt@test.com","actor_via_sso":false,"log_type":"token"}', '2026-04-15 07:34:47.038988+00', ''),
	('00000000-0000-0000-0000-000000000000', '9999de71-45be-4938-a9a7-66275e1fbd00', '{"action":"token_revoked","actor_id":"763a1a63-f76f-4350-aad1-92e1861ced8e","actor_name":"Ahmed Mohamed","actor_username":"pt@test.com","actor_via_sso":false,"log_type":"token"}', '2026-04-15 07:34:47.047697+00', ''),
	('00000000-0000-0000-0000-000000000000', 'd1538bea-1dc4-4859-bf33-b94e78820338', '{"action":"login","actor_id":"ef787189-cd97-4895-8906-89cc37487afd","actor_name":"Ahmed Elkasaby","actor_username":"client@test.com","actor_via_sso":false,"log_type":"account","traits":{"provider":"email"}}', '2026-04-15 07:49:40.263776+00', ''),
	('00000000-0000-0000-0000-000000000000', 'f6a9b4ac-34fb-40da-a280-dcce09be69cd', '{"action":"logout","actor_id":"763a1a63-f76f-4350-aad1-92e1861ced8e","actor_name":"Ahmed Mohamed","actor_username":"pt@test.com","actor_via_sso":false,"log_type":"account"}', '2026-04-15 07:53:27.301448+00', ''),
	('00000000-0000-0000-0000-000000000000', '7683c552-5ae4-4071-a9cd-81e9b9495ca9', '{"action":"login","actor_id":"763a1a63-f76f-4350-aad1-92e1861ced8e","actor_name":"Ahmed Mohamed","actor_username":"pt@test.com","actor_via_sso":false,"log_type":"account","traits":{"provider":"email"}}', '2026-04-15 07:53:40.005346+00', '');


--
-- Data for Name: custom_oauth_providers; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: flow_state; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: users; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

INSERT INTO "auth"."users" ("instance_id", "id", "aud", "role", "email", "encrypted_password", "email_confirmed_at", "invited_at", "confirmation_token", "confirmation_sent_at", "recovery_token", "recovery_sent_at", "email_change_token_new", "email_change", "email_change_sent_at", "last_sign_in_at", "raw_app_meta_data", "raw_user_meta_data", "is_super_admin", "created_at", "updated_at", "phone", "phone_confirmed_at", "phone_change", "phone_change_token", "phone_change_sent_at", "email_change_token_current", "email_change_confirm_status", "banned_until", "reauthentication_token", "reauthentication_sent_at", "is_sso_user", "deleted_at", "is_anonymous") VALUES
	('00000000-0000-0000-0000-000000000000', '5880f44b-ecff-4793-a02a-817f801d7606', 'authenticated', 'authenticated', 'debug-pt-1775910977395@repsync.test', '$2a$10$PadyA/Ln7bmdJWZ80GU/5uHJd/UiLc74RHwY0dmElbir4sK69/bDW', '2026-04-11 12:36:17.670278+00', NULL, '', NULL, '', NULL, '', '', NULL, '2026-04-11 12:36:17.92855+00', '{"provider": "email", "providers": ["email"]}', '{"name": "Debug PT", "full_name": "Debug PT", "email_verified": true}', NULL, '2026-04-11 12:36:17.620818+00', '2026-04-11 12:36:17.9516+00', NULL, NULL, '', '', NULL, '', 0, NULL, '', NULL, false, NULL, false),
	('00000000-0000-0000-0000-000000000000', 'ef787189-cd97-4895-8906-89cc37487afd', 'authenticated', 'authenticated', 'client@test.com', '$2a$10$1qV64zbC6KrkyBzd.ls9Wu1wuASNtVfW.KjE7hW1JQgJtslnPh8De', '2026-04-09 12:40:04.39856+00', NULL, '', NULL, '', NULL, '', '', NULL, '2026-04-15 07:49:40.282682+00', '{"provider": "email", "providers": ["email"]}', '{"sub": "ef787189-cd97-4895-8906-89cc37487afd", "email": "client@test.com", "full_name": "Ahmed Elkasaby", "email_verified": true, "phone_verified": false}', NULL, '2026-04-09 12:40:04.038758+00', '2026-04-15 07:49:40.326324+00', NULL, NULL, '', '', NULL, '', 0, NULL, '', NULL, false, NULL, false),
	('00000000-0000-0000-0000-000000000000', '763a1a63-f76f-4350-aad1-92e1861ced8e', 'authenticated', 'authenticated', 'pt@test.com', '$2a$10$s7Q5.ahP/AyZP7OI/J4Oh.WeREtPuArmoALWyq/xmMdPdBzxBWUNS', '2026-04-11 06:53:55.932541+00', NULL, '', NULL, '', NULL, '', '', NULL, '2026-04-15 07:53:40.010172+00', '{"provider": "email", "providers": ["email"]}', '{"sub": "763a1a63-f76f-4350-aad1-92e1861ced8e", "email": "pt@test.com", "full_name": "Ahmed Mohamed", "email_verified": true, "phone_verified": false}', NULL, '2026-04-11 06:53:55.8298+00', '2026-04-15 07:53:40.027129+00', NULL, NULL, '', '', NULL, '', 0, NULL, '', NULL, false, NULL, false);


--
-- Data for Name: identities; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

INSERT INTO "auth"."identities" ("provider_id", "user_id", "identity_data", "provider", "last_sign_in_at", "created_at", "updated_at", "id") VALUES
	('ef787189-cd97-4895-8906-89cc37487afd', 'ef787189-cd97-4895-8906-89cc37487afd', '{"sub": "ef787189-cd97-4895-8906-89cc37487afd", "email": "client@test.com", "email_verified": false, "phone_verified": false}', 'email', '2026-04-09 12:40:04.282421+00', '2026-04-09 12:40:04.282532+00', '2026-04-09 12:40:04.282532+00', 'e58789b9-539e-44d5-8474-d00564630e17'),
	('763a1a63-f76f-4350-aad1-92e1861ced8e', '763a1a63-f76f-4350-aad1-92e1861ced8e', '{"sub": "763a1a63-f76f-4350-aad1-92e1861ced8e", "email": "pt@test.com", "email_verified": false, "phone_verified": false}', 'email', '2026-04-11 06:53:55.888347+00', '2026-04-11 06:53:55.888452+00', '2026-04-11 06:53:55.888452+00', '52257ad5-6fc8-48e7-b5e5-d2da01473422'),
	('5880f44b-ecff-4793-a02a-817f801d7606', '5880f44b-ecff-4793-a02a-817f801d7606', '{"sub": "5880f44b-ecff-4793-a02a-817f801d7606", "email": "debug-pt-1775910977395@repsync.test", "email_verified": false, "phone_verified": false}', 'email', '2026-04-11 12:36:17.650984+00', '2026-04-11 12:36:17.651106+00', '2026-04-11 12:36:17.651106+00', 'fa309fa8-00d6-46f3-9b51-d6abc21c5301');


--
-- Data for Name: instances; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: oauth_clients; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: sessions; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

INSERT INTO "auth"."sessions" ("id", "user_id", "created_at", "updated_at", "factor_id", "aal", "not_after", "refreshed_at", "user_agent", "ip", "tag", "oauth_client_id", "refresh_token_hmac_key", "refresh_token_counter", "scopes") VALUES
	('bf337c62-d8fc-4224-a69e-57c7e5fe7abe', '5880f44b-ecff-4793-a02a-817f801d7606', '2026-04-11 12:36:17.929379+00', '2026-04-11 12:36:17.929379+00', NULL, 'aal1', NULL, NULL, 'node', '172.18.0.1', NULL, NULL, NULL, NULL, NULL),
	('3a6befd0-fc06-496e-ba3c-09831d814c2e', 'ef787189-cd97-4895-8906-89cc37487afd', '2026-04-14 11:40:40.574543+00', '2026-04-14 11:40:40.574543+00', NULL, 'aal1', NULL, NULL, 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36', '172.18.0.1', NULL, NULL, NULL, NULL, NULL),
	('c21e15f3-c087-407f-ba90-644a8a680260', 'ef787189-cd97-4895-8906-89cc37487afd', '2026-04-14 12:28:05.28341+00', '2026-04-14 12:28:05.28341+00', NULL, 'aal1', NULL, NULL, 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36', '172.18.0.1', NULL, NULL, NULL, NULL, NULL),
	('32c77e36-74b4-423a-80f4-5075d89ec9f2', 'ef787189-cd97-4895-8906-89cc37487afd', '2026-04-15 07:49:40.284026+00', '2026-04-15 07:49:40.284026+00', NULL, 'aal1', NULL, NULL, 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36', '172.18.0.1', NULL, NULL, NULL, NULL, NULL),
	('41de7947-21e9-4727-a234-fa1c9e133f44', '763a1a63-f76f-4350-aad1-92e1861ced8e', '2026-04-15 07:53:40.014466+00', '2026-04-15 07:53:40.014466+00', NULL, 'aal1', NULL, NULL, 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36', '172.18.0.1', NULL, NULL, NULL, NULL, NULL);


--
-- Data for Name: mfa_amr_claims; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

INSERT INTO "auth"."mfa_amr_claims" ("session_id", "created_at", "updated_at", "authentication_method", "id") VALUES
	('bf337c62-d8fc-4224-a69e-57c7e5fe7abe', '2026-04-11 12:36:17.95382+00', '2026-04-11 12:36:17.95382+00', 'password', 'e1660646-39c5-4978-9b05-6fd958d6a5fa'),
	('3a6befd0-fc06-496e-ba3c-09831d814c2e', '2026-04-14 11:40:40.58697+00', '2026-04-14 11:40:40.58697+00', 'password', 'b274d25a-221b-4578-bd02-d3bb57800843'),
	('c21e15f3-c087-407f-ba90-644a8a680260', '2026-04-14 12:28:05.293169+00', '2026-04-14 12:28:05.293169+00', 'password', '320dcc5a-a1e8-47d6-a2eb-02f8f106bfd0'),
	('32c77e36-74b4-423a-80f4-5075d89ec9f2', '2026-04-15 07:49:40.330201+00', '2026-04-15 07:49:40.330201+00', 'password', '590f650d-46ee-48e4-ad89-24b55b4011ed'),
	('41de7947-21e9-4727-a234-fa1c9e133f44', '2026-04-15 07:53:40.029625+00', '2026-04-15 07:53:40.029625+00', 'password', '8603714b-3cc3-402f-be6b-3e08822e4cac');


--
-- Data for Name: mfa_factors; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: mfa_challenges; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: oauth_authorizations; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: oauth_client_states; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: oauth_consents; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: one_time_tokens; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: refresh_tokens; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

INSERT INTO "auth"."refresh_tokens" ("instance_id", "id", "token", "user_id", "revoked", "created_at", "updated_at", "parent", "session_id") VALUES
	('00000000-0000-0000-0000-000000000000', 49, 'kammpxuwshj2', 'ef787189-cd97-4895-8906-89cc37487afd', false, '2026-04-14 11:40:40.580265+00', '2026-04-14 11:40:40.580265+00', NULL, '3a6befd0-fc06-496e-ba3c-09831d814c2e'),
	('00000000-0000-0000-0000-000000000000', 52, 'rremf6lmqkm6', 'ef787189-cd97-4895-8906-89cc37487afd', false, '2026-04-14 12:28:05.289392+00', '2026-04-14 12:28:05.289392+00', NULL, 'c21e15f3-c087-407f-ba90-644a8a680260'),
	('00000000-0000-0000-0000-000000000000', 55, '4rtbiilrz6v7', 'ef787189-cd97-4895-8906-89cc37487afd', false, '2026-04-15 07:49:40.310385+00', '2026-04-15 07:49:40.310385+00', NULL, '32c77e36-74b4-423a-80f4-5075d89ec9f2'),
	('00000000-0000-0000-0000-000000000000', 56, 'e6lgv2eyh5qp', '763a1a63-f76f-4350-aad1-92e1861ced8e', false, '2026-04-15 07:53:40.020403+00', '2026-04-15 07:53:40.020403+00', NULL, '41de7947-21e9-4727-a234-fa1c9e133f44'),
	('00000000-0000-0000-0000-000000000000', 13, 'clyjsmzcyxrq', '5880f44b-ecff-4793-a02a-817f801d7606', false, '2026-04-11 12:36:17.936362+00', '2026-04-11 12:36:17.936362+00', NULL, 'bf337c62-d8fc-4224-a69e-57c7e5fe7abe');


--
-- Data for Name: sso_providers; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: saml_providers; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: saml_relay_states; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: sso_domains; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: webauthn_challenges; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: webauthn_credentials; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: _archive_workout_log_items; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: _archive_workout_template_items; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: checkin_templates; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: workspaces; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."workspaces" ("id", "name", "owner_user_id", "created_at", "default_checkin_template_id", "logo_url", "updated_at") VALUES
	('3d3da0e5-d510-416e-bb98-88747e5a7537', 'LUSFIT', '763a1a63-f76f-4350-aad1-92e1861ced8e', '2026-04-11 06:54:14.368342+00', NULL, NULL, '2026-04-11 06:54:14.368342+00'),
	('871a5b31-6dd0-4daa-a372-7e3ea03692c4', 'test2', '763a1a63-f76f-4350-aad1-92e1861ced8e', '2026-04-11 12:14:55.595049+00', NULL, NULL, '2026-04-11 12:14:55.595049+00'),
	('8e6d6bc4-7edd-405b-9fc4-48c38ba1f8c2', 'Debug WS', '5880f44b-ecff-4793-a02a-817f801d7606', '2026-04-11 12:36:17.719269+00', NULL, NULL, '2026-04-11 12:36:17.719269+00');


--
-- Data for Name: clients; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."clients" ("id", "workspace_id", "user_id", "status", "display_name", "goal", "injuries", "equipment", "height_cm", "dob", "tags", "created_at", "phone", "email", "location", "timezone", "unit_preference", "gender", "training_type", "gym_name", "photo_url", "limitations", "updated_at", "location_country", "days_per_week", "current_weight", "checkin_template_id", "checkin_frequency", "checkin_start_date", "lifecycle_state", "lifecycle_changed_at", "paused_reason", "churn_reason", "full_name", "avatar_url", "date_of_birth", "sex", "height_value", "height_unit", "weight_value_current", "weight_unit", "account_onboarding_completed_at", "manual_risk_flag") VALUES
	('25475c65-fa5d-4a02-828e-d4a7eb2195e5', '871a5b31-6dd0-4daa-a372-7e3ea03692c4', 'ef787189-cd97-4895-8906-89cc37487afd', 'active', 'Ahmed Elkasaby', NULL, NULL, NULL, NULL, NULL, '{}', '2026-04-12 07:42:11.450889+00', '97450505012', 'client@test.com', NULL, NULL, 'metric', NULL, 'online', NULL, NULL, NULL, '2026-04-14 10:29:01.221471+00', NULL, NULL, NULL, NULL, 'weekly', NULL, 'onboarding', '2026-04-14 10:28:58.724085+00', NULL, NULL, 'Ahmed Elkasaby', NULL, '1996-12-12', 'Male', 178, 'cm', 110, 'kg', '2026-04-14 10:29:01.195+00', false);


--
-- Data for Name: nutrition_templates; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: assigned_nutrition_plans; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: assigned_nutrition_days; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: assigned_nutrition_meals; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: assigned_nutrition_meal_components; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: program_templates; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: workout_templates; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: assigned_workouts; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: exercises; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."exercises" ("id", "workspace_id", "name", "muscle_group", "equipment", "instructions", "video_url", "created_at", "notes", "cues", "primary_muscle", "secondary_muscles", "is_unilateral", "tags", "category", "owner_user_id", "source", "source_exercise_id", "source_payload") VALUES
	('d85906d4-41d9-472d-bfb5-be1bbb8ccbb2', NULL, 'Bench Press', NULL, NULL, NULL, NULL, '2026-04-12 12:39:47.437079+00', NULL, NULL, NULL, NULL, false, NULL, NULL, 'ef787189-cd97-4895-8906-89cc37487afd', 'manual', NULL, NULL),
	('f7d6d8b4-a261-4953-b87f-5e19931385b0', NULL, 'Push Press', NULL, NULL, NULL, NULL, '2026-04-12 12:39:47.568057+00', NULL, NULL, NULL, NULL, false, NULL, NULL, 'ef787189-cd97-4895-8906-89cc37487afd', 'manual', NULL, NULL),
	('e3c89420-33d9-47b9-bbfb-cef4964cf4da', NULL, 'triceps', NULL, NULL, NULL, NULL, '2026-04-12 12:46:28.127482+00', NULL, NULL, NULL, NULL, false, NULL, NULL, 'ef787189-cd97-4895-8906-89cc37487afd', 'manual', NULL, NULL),
	('95336146-2e9a-4ea1-9a89-6595302b4c20', NULL, 'back row', NULL, NULL, NULL, NULL, '2026-04-12 12:46:28.252662+00', NULL, NULL, NULL, NULL, false, NULL, NULL, 'ef787189-cd97-4895-8906-89cc37487afd', 'manual', NULL, NULL);


--
-- Data for Name: assigned_workout_exercises; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: baseline_entries; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."baseline_entries" ("id", "client_id", "workspace_id", "status", "client_notes", "coach_notes", "submitted_at", "created_at", "updated_at") VALUES
	('76ab2a2b-79e8-41d0-9657-8e48cb806f79', '25475c65-fa5d-4a02-828e-d4a7eb2195e5', '871a5b31-6dd0-4daa-a372-7e3ea03692c4', 'draft', NULL, NULL, NULL, '2026-04-14 10:31:53.254+00', '2026-04-14 10:31:53.266634+00');


--
-- Data for Name: baseline_marker_templates; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."baseline_marker_templates" ("id", "workspace_id", "name", "unit", "value_type", "sort_order", "is_active", "created_at", "created_by_user_id", "unit_label", "help_text") VALUES
	('73d17470-8867-4c5c-980e-01188036dffd', '3d3da0e5-d510-416e-bb98-88747e5a7537', 'Bench Press 1RM', NULL, 'number', 10, true, '2026-04-14 10:57:08.624627+00', '763a1a63-f76f-4350-aad1-92e1861ced8e', 'kg', NULL),
	('ca9999c3-bf21-4890-a962-102c308b2a72', '3d3da0e5-d510-416e-bb98-88747e5a7537', 'Squat 1RM', NULL, 'number', 20, true, '2026-04-14 10:57:26.074309+00', '763a1a63-f76f-4350-aad1-92e1861ced8e', 'kg', NULL);


--
-- Data for Name: baseline_entry_marker_templates; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: baseline_marker_values; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: baseline_metrics; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."baseline_metrics" ("baseline_id", "weight_kg", "height_cm", "body_fat_pct", "lean_mass_kg", "waist_cm", "chest_cm", "hips_cm", "thigh_cm", "arm_cm", "resting_hr", "vo2max", "created_at", "updated_at") VALUES
	('76ab2a2b-79e8-41d0-9657-8e48cb806f79', 110, 178, 32, NULL, 25, 26, 25, 26, 25, 55, 50, '2026-04-14 10:53:43.029333+00', '2026-04-15 07:49:50.246548+00');


--
-- Data for Name: baseline_photos; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: checkin_questions; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: checkins; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: checkin_answers; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: checkin_photos; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: client_lifecycle_events; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."client_lifecycle_events" ("id", "client_id", "workspace_id", "previous_state", "new_state", "reason", "changed_by_user_id", "created_at") VALUES
	('8a7e333a-2699-40c0-b125-ace8aab1b527', '25475c65-fa5d-4a02-828e-d4a7eb2195e5', '871a5b31-6dd0-4daa-a372-7e3ea03692c4', 'active', 'invited', NULL, '763a1a63-f76f-4350-aad1-92e1861ced8e', '2026-04-12 07:42:11.450889+00'),
	('c8578d73-1154-4437-9bff-053b26eff0eb', '25475c65-fa5d-4a02-828e-d4a7eb2195e5', '871a5b31-6dd0-4daa-a372-7e3ea03692c4', 'invited', 'onboarding', NULL, 'ef787189-cd97-4895-8906-89cc37487afd', '2026-04-14 10:28:58.724085+00');


--
-- Data for Name: client_macro_targets; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: client_medical_records; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: client_medical_documents; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: client_program_assignments; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: client_programs; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: client_program_overrides; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: client_targets; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: coach_activity_log; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: coach_calendar_events; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: coach_todos; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: conversations; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."conversations" ("id", "client_id", "created_at", "workspace_id", "last_message_at", "updated_at", "last_message_id", "last_message_preview", "last_message_sender_name", "last_message_sender_role") VALUES
	('4fbe94ff-5096-47bc-ba75-2ce31fddc37f', '25475c65-fa5d-4a02-828e-d4a7eb2195e5', '2026-04-12 11:06:02.14681+00', '871a5b31-6dd0-4daa-a372-7e3ea03692c4', '2026-04-14 11:25:20.653432+00', '2026-04-14 11:25:20.653432+00', '22aaa8e6-1641-40d4-a3e2-48b83279b361', 'How are you Ahmed? can you please complte your onboarding?', 'Ahmed Mohamed', 'pt');


--
-- Data for Name: dismissed_reminders; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."dismissed_reminders" ("id", "client_id", "key", "dismissed_for_date", "created_at") VALUES
	('08f69c22-9675-4446-add1-f6a59598d9ae', '25475c65-fa5d-4a02-828e-d4a7eb2195e5', 'log_habits_today', '2026-04-14', '2026-04-14 06:37:33.144095+00');


--
-- Data for Name: habit_logs; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: invites; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: pt_packages; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: pt_hub_leads; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."pt_hub_leads" ("id", "user_id", "full_name", "email", "phone", "goal_summary", "training_experience", "budget_interest", "package_interest", "status", "submitted_at", "converted_at", "converted_workspace_id", "converted_client_id", "created_at", "updated_at", "source", "source_slug", "applicant_user_id", "package_interest_id", "package_interest_label_snapshot") VALUES
	('7a2ec978-c240-402f-9598-10e83d525301', '763a1a63-f76f-4350-aad1-92e1861ced8e', 'Ahmed Elkasaby', 'client@test.com', '97450505012', 'nothing', '5', NULL, NULL, 'converted', '2026-04-11 12:01:00.370977+00', '2026-04-11 12:03:36.31714+00', '871a5b31-6dd0-4daa-a372-7e3ea03692c4', '25475c65-fa5d-4a02-828e-d4a7eb2195e5', '2026-04-11 12:01:00.370977+00', '2026-04-12 07:42:11.450889+00', 'public_profile', 'kasaby', 'ef787189-cd97-4895-8906-89cc37487afd', NULL, NULL);


--
-- Data for Name: lead_conversations; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."lead_conversations" ("id", "lead_id", "pt_user_id", "lead_user_id", "status", "archived_reason", "created_at", "archived_at", "last_message_at", "last_message_preview") VALUES
	('fe099f8c-fd00-4053-a964-9e7e760b1443', '7a2ec978-c240-402f-9598-10e83d525301', '763a1a63-f76f-4350-aad1-92e1861ced8e', 'ef787189-cd97-4895-8906-89cc37487afd', 'archived', 'converted', '2026-04-11 12:01:00.370977+00', '2026-04-11 12:11:29.892043+00', '2026-04-11 12:02:42.190228+00', 'nothing i am good what about you');


--
-- Data for Name: lead_chat_events; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."lead_chat_events" ("id", "lead_id", "conversation_id", "actor_user_id", "event_type", "metadata", "created_at") VALUES
	('766fd0e7-327c-4199-bafa-de24f404c003', '7a2ec978-c240-402f-9598-10e83d525301', 'fe099f8c-fd00-4053-a964-9e7e760b1443', NULL, 'lead_conversation_created', '{"status": "open"}', '2026-04-11 12:01:00.370977+00'),
	('8284cd79-b7c6-4471-aaac-f10c7139f874', '7a2ec978-c240-402f-9598-10e83d525301', 'fe099f8c-fd00-4053-a964-9e7e760b1443', '763a1a63-f76f-4350-aad1-92e1861ced8e', 'lead_first_pt_message_sent', '{"message_id": "a60e10c6-f6c2-42f5-b835-0e5326b74b46"}', '2026-04-11 12:01:59.461339+00'),
	('b4c0505f-b95a-4ae0-b960-2ccf6feeb9e8', '7a2ec978-c240-402f-9598-10e83d525301', 'fe099f8c-fd00-4053-a964-9e7e760b1443', '763a1a63-f76f-4350-aad1-92e1861ced8e', 'lead_status_moved_to_contacted', '{"message_id": "a60e10c6-f6c2-42f5-b835-0e5326b74b46"}', '2026-04-11 12:01:59.461339+00'),
	('226932ac-c897-43f0-849e-5c10e704b6ca', '7a2ec978-c240-402f-9598-10e83d525301', 'fe099f8c-fd00-4053-a964-9e7e760b1443', 'ef787189-cd97-4895-8906-89cc37487afd', 'lead_first_reply_sent', '{"message_id": "365e0ee7-a081-44ff-90af-402e61898d4a"}', '2026-04-11 12:02:42.190228+00'),
	('e356b402-d99d-412e-b22b-66a3c3ae6a73', '7a2ec978-c240-402f-9598-10e83d525301', 'fe099f8c-fd00-4053-a964-9e7e760b1443', NULL, 'lead_conversation_archived_converted', '{"reason": "converted"}', '2026-04-11 12:03:36.31714+00'),
	('33658c7c-5598-4e24-a06a-e53cc7fc8e58', '7a2ec978-c240-402f-9598-10e83d525301', 'fe099f8c-fd00-4053-a964-9e7e760b1443', NULL, 'lead_conversation_archived_converted', '{"reason": "converted"}', '2026-04-11 12:03:43.841125+00'),
	('8b427a03-5a0d-4ebf-aa90-e20ed1827ac7', '7a2ec978-c240-402f-9598-10e83d525301', 'fe099f8c-fd00-4053-a964-9e7e760b1443', NULL, 'lead_conversation_archived_converted', '{"reason": "converted"}', '2026-04-11 12:10:03.513164+00'),
	('4c08bee9-606e-4c95-92ef-2e4cd3e341f7', '7a2ec978-c240-402f-9598-10e83d525301', 'fe099f8c-fd00-4053-a964-9e7e760b1443', NULL, 'lead_conversation_archived_converted', '{"reason": "converted"}', '2026-04-11 12:11:15.649787+00'),
	('64a6a812-4469-4f10-990a-2c854f9ffd6e', '7a2ec978-c240-402f-9598-10e83d525301', 'fe099f8c-fd00-4053-a964-9e7e760b1443', NULL, 'lead_conversation_archived_converted', '{"reason": "converted"}', '2026-04-11 12:11:21.25666+00'),
	('79c033d0-bca6-49c5-8766-ce93d27928c3', '7a2ec978-c240-402f-9598-10e83d525301', 'fe099f8c-fd00-4053-a964-9e7e760b1443', NULL, 'lead_conversation_archived_converted', '{"reason": "converted"}', '2026-04-11 12:11:29.892043+00');


--
-- Data for Name: lead_messages; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."lead_messages" ("id", "conversation_id", "sender_user_id", "body", "sent_at", "edited_at") VALUES
	('a60e10c6-f6c2-42f5-b835-0e5326b74b46', 'fe099f8c-fd00-4053-a964-9e7e760b1443', '763a1a63-f76f-4350-aad1-92e1861ced8e', 'Hi, what is your level of experince in the sola syste,', '2026-04-11 12:01:59.461339+00', NULL),
	('365e0ee7-a081-44ff-90af-402e61898d4a', 'fe099f8c-fd00-4053-a964-9e7e760b1443', 'ef787189-cd97-4895-8906-89cc37487afd', 'nothing i am good what about you', '2026-04-11 12:02:42.190228+00', NULL);


--
-- Data for Name: lead_conversation_participants; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."lead_conversation_participants" ("conversation_id", "user_id", "role", "last_read_message_id", "last_read_at", "created_at") VALUES
	('fe099f8c-fd00-4053-a964-9e7e760b1443', '763a1a63-f76f-4350-aad1-92e1861ced8e', 'pt', '365e0ee7-a081-44ff-90af-402e61898d4a', '2026-04-11 12:02:42.190228+00', '2026-04-11 12:01:00.370977+00'),
	('fe099f8c-fd00-4053-a964-9e7e760b1443', 'ef787189-cd97-4895-8906-89cc37487afd', 'lead', '365e0ee7-a081-44ff-90af-402e61898d4a', '2026-04-11 12:02:42.190228+00', '2026-04-11 12:01:00.370977+00');


--
-- Data for Name: message_typing; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: messages; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."messages" ("id", "conversation_id", "sender_user_id", "body", "created_at", "sender_role", "sender_name", "preview", "unread", "workspace_id") VALUES
	('4b02b4e2-2c2e-4fe5-baf6-5233c93343f0', '4fbe94ff-5096-47bc-ba75-2ce31fddc37f', 'ef787189-cd97-4895-8906-89cc37487afd', 'hi', '2026-04-13 12:05:54.930003+00', 'client', 'Ahmed Elkasaby', 'hi', false, '871a5b31-6dd0-4daa-a372-7e3ea03692c4'),
	('22aaa8e6-1641-40d4-a3e2-48b83279b361', '4fbe94ff-5096-47bc-ba75-2ce31fddc37f', '763a1a63-f76f-4350-aad1-92e1861ced8e', 'How are you Ahmed? can you please complte your onboarding?', '2026-04-14 11:25:20.653432+00', 'pt', 'Ahmed Mohamed', 'How are you Ahmed? can you please complte your onboarding?', false, '871a5b31-6dd0-4daa-a372-7e3ea03692c4');


--
-- Data for Name: notification_preferences; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: notifications; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."notifications" ("id", "recipient_user_id", "type", "category", "priority", "title", "body", "action_url", "entity_type", "entity_id", "image_url", "metadata", "is_read", "read_at", "delivery_in_app", "delivery_email", "delivery_push", "created_at") VALUES
	('48a5eaf5-fefa-479b-a64a-978b86907d0c', 'ef787189-cd97-4895-8906-89cc37487afd', 'lead_chat_message_received', 'messages', 'normal', 'New message from your coach', 'Hi, what is your level of experince in the sola syste,', '/app/home', 'lead_conversation', 'fe099f8c-fd00-4053-a964-9e7e760b1443', NULL, '{"lead_id": "7a2ec978-c240-402f-9598-10e83d525301", "conversation_id": "fe099f8c-fd00-4053-a964-9e7e760b1443"}', true, '2026-04-11 12:02:47.964+00', true, false, false, '2026-04-11 12:01:59.461339+00'),
	('45bd290e-d156-485a-9171-4beed2bcaf7c', 'ef787189-cd97-4895-8906-89cc37487afd', 'workout_assigned', 'workouts', 'normal', 'Workout assigned', 'upper is scheduled for Apr 12.', '/app/home', 'assigned_workout', '63d67c1f-04f0-40e5-82fa-ca04dde6ba48', NULL, '{"client_id": "25475c65-fa5d-4a02-828e-d4a7eb2195e5", "scheduled_date": "2026-04-12"}', true, '2026-04-13 11:57:10.634241+00', true, false, false, '2026-04-12 12:46:28.356329+00'),
	('ba75c188-2dd0-4694-9278-584ec2eb29d8', 'ef787189-cd97-4895-8906-89cc37487afd', 'workout_assigned', 'workouts', 'normal', 'Workout assigned', 'Upper is scheduled for Apr 12.', '/app/home', 'assigned_workout', 'a59ac47c-d1c4-4e9a-adcf-cac707c38a23', NULL, '{"client_id": "25475c65-fa5d-4a02-828e-d4a7eb2195e5", "scheduled_date": "2026-04-12"}', true, '2026-04-13 11:57:10.634241+00', true, false, false, '2026-04-12 12:39:47.704636+00'),
	('e5e217e6-49b1-4d68-ac5e-403b30f14db1', 'ef787189-cd97-4895-8906-89cc37487afd', 'workout_assigned', 'workouts', 'normal', 'Workout assigned', 'upper is scheduled for Apr 12.', '/app/home', 'assigned_workout', 'e9e4e246-6d39-4d44-861a-81840cb9f1a8', NULL, '{"client_id": "25475c65-fa5d-4a02-828e-d4a7eb2195e5", "scheduled_date": "2026-04-12"}', true, '2026-04-13 11:57:10.634241+00', true, false, false, '2026-04-12 12:23:32.106621+00'),
	('5187e75a-79a7-4df6-b298-014468cdd2e3', 'ef787189-cd97-4895-8906-89cc37487afd', 'workout_assigned', 'workouts', 'normal', 'Workout assigned', 'Upper 1 is scheduled for Apr 12.', '/app/home', 'assigned_workout', '575b50b8-3534-43ca-9acc-79f3013b89ec', NULL, '{"client_id": "25475c65-fa5d-4a02-828e-d4a7eb2195e5", "scheduled_date": "2026-04-12"}', true, '2026-04-13 11:57:10.634241+00', true, false, false, '2026-04-12 12:06:42.871123+00'),
	('fe6f9009-7e85-4ab0-af04-30d8666b1215', 'ef787189-cd97-4895-8906-89cc37487afd', 'workout_assigned', 'workouts', 'normal', 'Workout assigned', 'Upper 1 is scheduled for Apr 12.', '/app/home', 'assigned_workout', '91e6049e-eed4-4040-a79e-de1da6f7d766', NULL, '{"client_id": "25475c65-fa5d-4a02-828e-d4a7eb2195e5", "scheduled_date": "2026-04-12"}', true, '2026-04-13 11:57:10.634241+00', true, false, false, '2026-04-12 12:06:38.144932+00'),
	('a5018e95-177c-4b8a-8a34-11ab7464aa5c', 'ef787189-cd97-4895-8906-89cc37487afd', 'workout_assigned', 'workouts', 'normal', 'Workout assigned', 'Workout is scheduled for Apr 12.', '/app/home', 'assigned_workout', 'cd7d592d-dd5e-42f7-a089-35eb963b6ad1', NULL, '{"client_id": "25475c65-fa5d-4a02-828e-d4a7eb2195e5", "scheduled_date": "2026-04-12"}', true, '2026-04-13 11:57:10.634241+00', true, false, false, '2026-04-12 11:51:19.061267+00'),
	('726237fa-3952-4982-91b3-032501cde385', '763a1a63-f76f-4350-aad1-92e1861ced8e', 'message_received', 'messages', 'normal', 'New message from Ahmed Elkasaby', 'hi', '/pt/messages?client=25475c65-fa5d-4a02-828e-d4a7eb2195e5', 'conversation', '4fbe94ff-5096-47bc-ba75-2ce31fddc37f', NULL, '{"client_id": "25475c65-fa5d-4a02-828e-d4a7eb2195e5", "conversation_id": "4fbe94ff-5096-47bc-ba75-2ce31fddc37f"}', true, '2026-04-14 11:19:02.548454+00', true, false, false, '2026-04-13 12:05:54.930003+00'),
	('4f070c57-2886-4b44-81f7-a88a3608b0b7', '763a1a63-f76f-4350-aad1-92e1861ced8e', 'client_inactive', 'general', 'normal', 'Client inactive for 2+ days', 'Ahmed Elkasaby has no recent activity.', '/pt/clients/25475c65-fa5d-4a02-828e-d4a7eb2195e5?tab=overview', 'client', '25475c65-fa5d-4a02-828e-d4a7eb2195e5', NULL, '{"reminder_date": "2026-04-12", "last_activity_at": "-infinity"}', true, '2026-04-14 11:19:02.548454+00', true, false, false, '2026-04-12 07:42:20.75969+00'),
	('f3b93b60-b50f-45c6-9f85-65c366a4c053', '763a1a63-f76f-4350-aad1-92e1861ced8e', 'client_inactive', 'general', 'normal', 'Client inactive for 2+ days', 'Ahmed Elkasaby has no recent activity.', '/pt/clients/ad8c5e07-55e4-471e-b6cc-8f2746f6fc2e?tab=overview', 'client', 'ad8c5e07-55e4-471e-b6cc-8f2746f6fc2e', NULL, '{"reminder_date": "2026-04-12", "last_activity_at": "-infinity"}', true, '2026-04-14 11:19:02.548454+00', true, false, false, '2026-04-12 07:27:02.232914+00'),
	('6d88ab1b-8e0b-4f6c-ad14-0460ecc75d4b', '763a1a63-f76f-4350-aad1-92e1861ced8e', 'client_inactive', 'general', 'normal', 'Client inactive for 2+ days', 'Ahmed Elkasaby has no recent activity.', '/pt/clients/36d48724-9fdc-439b-b0c2-214909e70120?tab=overview', 'client', '36d48724-9fdc-439b-b0c2-214909e70120', NULL, '{"reminder_date": "2026-04-12", "last_activity_at": "-infinity"}', true, '2026-04-14 11:19:02.548454+00', true, false, false, '2026-04-12 06:11:46.444908+00'),
	('f7a749a8-1ac3-4366-aa84-a36073f52af3', '763a1a63-f76f-4350-aad1-92e1861ced8e', 'client_inactive', 'general', 'normal', 'Client inactive for 2+ days', 'Ahmed Elkasaby has no recent activity.', '/pt/clients/36d48724-9fdc-439b-b0c2-214909e70120?tab=overview', 'client', '36d48724-9fdc-439b-b0c2-214909e70120', NULL, '{"reminder_date": "2026-04-11", "last_activity_at": "-infinity"}', true, '2026-04-14 11:19:02.548454+00', true, false, false, '2026-04-11 12:05:23.678792+00'),
	('4ef48bbf-00ff-437e-800a-d7715d9f54cd', '763a1a63-f76f-4350-aad1-92e1861ced8e', 'lead_chat_message_received', 'messages', 'normal', 'New lead reply', 'nothing i am good what about you', '/pt-hub/leads/7a2ec978-c240-402f-9598-10e83d525301', 'lead_conversation', 'fe099f8c-fd00-4053-a964-9e7e760b1443', NULL, '{"lead_id": "7a2ec978-c240-402f-9598-10e83d525301", "conversation_id": "fe099f8c-fd00-4053-a964-9e7e760b1443"}', true, '2026-04-14 11:19:02.548454+00', true, false, false, '2026-04-11 12:02:42.190228+00'),
	('b30371b7-4bd2-41c0-87d7-e17c9ed15c98', 'ef787189-cd97-4895-8906-89cc37487afd', 'message_received', 'messages', 'normal', 'New message from your coach', 'How are you Ahmed? can you please complte your onboarding?', '/app/messages', 'conversation', '4fbe94ff-5096-47bc-ba75-2ce31fddc37f', NULL, '{"client_id": "25475c65-fa5d-4a02-828e-d4a7eb2195e5", "conversation_id": "4fbe94ff-5096-47bc-ba75-2ce31fddc37f"}', true, '2026-04-14 11:58:55.077+00', true, false, false, '2026-04-14 11:25:20.653432+00'),
	('5b37b08a-95ac-421d-a6ff-3a4de422d463', '763a1a63-f76f-4350-aad1-92e1861ced8e', 'client_inactive', 'general', 'normal', 'Client inactive for 2+ days', 'Ahmed Elkasaby has no recent activity.', '/pt/clients/25475c65-fa5d-4a02-828e-d4a7eb2195e5?tab=overview', 'client', '25475c65-fa5d-4a02-828e-d4a7eb2195e5', NULL, '{"reminder_date": "2026-04-14", "last_activity_at": "-infinity"}', true, '2026-04-14 12:38:26.850129+00', true, false, false, '2026-04-14 11:30:39.668109+00'),
	('2464c3e4-5964-47a5-959d-2d78309e2e56', '763a1a63-f76f-4350-aad1-92e1861ced8e', 'client_inactive', 'general', 'normal', 'Client inactive for 2+ days', 'Ahmed Elkasaby has no recent activity.', '/pt/clients/25475c65-fa5d-4a02-828e-d4a7eb2195e5?tab=overview', 'client', '25475c65-fa5d-4a02-828e-d4a7eb2195e5', NULL, '{"reminder_date": "2026-04-15", "last_activity_at": "-infinity"}', false, NULL, true, false, false, '2026-04-15 07:34:54.298968+00');


--
-- Data for Name: nutrition_day_logs; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: nutrition_meal_logs; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: nutrition_template_days; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: nutrition_template_meals; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: nutrition_template_meal_components; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: nutrition_template_meal_items; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: program_template_days; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: pt_hub_lead_notes; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: pt_hub_profiles; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."pt_hub_profiles" ("id", "user_id", "full_name", "display_name", "headline", "short_bio", "specialties", "certifications", "coaching_style", "profile_photo_url", "banner_image_url", "social_links", "created_at", "updated_at", "slug", "searchable_headline", "coaching_modes", "availability_modes", "location_label", "marketplace_visible", "is_published", "published_at", "testimonials", "transformations") VALUES
	('57ecf866-e5b2-486d-a05b-12afe52dc3c1', '763a1a63-f76f-4350-aad1-92e1861ced8e', 'Ahmed Elkasaby', 'Ahmed Elkasaby', 'Higher-performance coach, with ample experince in tranformation journeys', 'I can help you change yourself in less than a year froma fat fuck to a ripped ass motherfucker with a bigger cock', '{Strength,hypertrophy}', '{Nasm,"LVL1 PT"}', 'Structured, not to harsh, easy going, meal plan with fats and fried foods', 'http://127.0.0.1:54321/storage/v1/object/public/pt_profile_media/763a1a63-f76f-4350-aad1-92e1861ced8e/profile/profile-photo.jpg', 'http://127.0.0.1:54321/storage/v1/object/public/pt_profile_media/763a1a63-f76f-4350-aad1-92e1861ced8e/profile/banner.jpg', '[{"url": "www.Facebook.com", "label": "Website", "platform": "website"}, {"url": "www.instagram.com", "label": "Instagram", "platform": "instagram"}, {"url": "www.linkedin.com", "label": "LinkedIn", "platform": "linkedin"}, {"url": "", "label": "YouTube", "platform": "youtube"}]', '2026-04-11 10:37:25.71761+00', '2026-04-11 11:28:59.012667+00', 'kasaby', 'AK', '{one_on_one,programming,nutrition}', '{online,in_person}', 'Qatar,Egypt,UAE', false, true, '2026-04-11 11:28:59.012667+00', '[]', '[]');


--
-- Data for Name: pt_hub_settings; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."pt_hub_settings" ("id", "user_id", "contact_email", "support_email", "phone", "timezone", "city", "client_alerts", "weekly_digest", "product_updates", "profile_visibility", "subscription_plan", "subscription_status", "created_at", "updated_at", "full_name", "country") VALUES
	('167efc7f-450a-423e-b2ae-c6413640e007', '763a1a63-f76f-4350-aad1-92e1861ced8e', 'pt@test.com', 'pt@test.com', NULL, 'Asia/Riyadh', NULL, true, true, false, 'listed', 'Repsync Pro', 'Billing placeholder', '2026-04-11 11:27:38.870555+00', '2026-04-11 11:27:38.870555+00', NULL, NULL);


--
-- Data for Name: pt_profiles; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."pt_profiles" ("id", "user_id", "workspace_id", "display_name", "created_at", "updated_at", "full_name", "phone", "avatar_url", "coach_business_name", "headline", "bio", "location_country", "location_city", "languages", "specialties", "starting_price", "onboarding_completed_at") VALUES
	('462c9b4b-af16-4fd9-a510-12bb1f796e57', '763a1a63-f76f-4350-aad1-92e1861ced8e', NULL, 'Ahmed Elkasaby', '2026-04-11 06:54:04.565853+00', '2026-04-11 10:39:51.899478+00', 'Ahmed Elkasaby', '+974 55093715', NULL, NULL, NULL, NULL, 'Qatar', 'Doha', '{}', '{}', NULL, '2026-04-11 06:54:04.579+00'),
	('187661f7-1b73-4c05-9bbe-2b6028e0be73', '763a1a63-f76f-4350-aad1-92e1861ced8e', '3d3da0e5-d510-416e-bb98-88747e5a7537', 'Ahmed Elkasaby', '2026-04-11 06:54:14.368342+00', '2026-04-11 10:39:51.899478+00', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '{}', '{}', NULL, NULL),
	('60fe7f10-ab28-4061-9d70-78ab50510496', '763a1a63-f76f-4350-aad1-92e1861ced8e', '871a5b31-6dd0-4daa-a372-7e3ea03692c4', NULL, '2026-04-11 12:14:55.595049+00', '2026-04-11 12:14:55.595049+00', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '{}', '{}', NULL, NULL);


--
-- Data for Name: rate_limit_events; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."rate_limit_events" ("id", "action", "actor_user_id", "actor_key", "target_key", "metadata", "created_at") VALUES
	('0a21268b-e2dd-4886-bf7c-9788218e6186', 'workspace_create_burst', '763a1a63-f76f-4350-aad1-92e1861ced8e', NULL, NULL, '{}', '2026-04-11 06:54:14.368342+00'),
	('47d66ecf-dc7c-40a6-a4f4-4f25894aa9b2', 'workspace_create_daily', '763a1a63-f76f-4350-aad1-92e1861ced8e', NULL, NULL, '{}', '2026-04-11 06:54:14.368342+00'),
	('48f79fbf-6f3f-4897-8065-2607acaa984d', 'public_pt_application_burst', 'ef787189-cd97-4895-8906-89cc37487afd', NULL, 'fe46c4fbaf07bfb168e594677e632ffd', '{}', '2026-04-11 12:01:00.370977+00'),
	('0985a3b2-04ed-4821-9954-549bd9992b62', 'public_pt_application_hourly', 'ef787189-cd97-4895-8906-89cc37487afd', NULL, NULL, '{}', '2026-04-11 12:01:00.370977+00'),
	('a7e76b90-a842-4f2e-8668-a7581e78d2b2', 'workspace_create_burst', '763a1a63-f76f-4350-aad1-92e1861ced8e', NULL, NULL, '{}', '2026-04-11 12:14:55.595049+00'),
	('5813266b-73b9-47e4-ae15-f1d2a6faec6c', 'workspace_create_daily', '763a1a63-f76f-4350-aad1-92e1861ced8e', NULL, NULL, '{}', '2026-04-11 12:14:55.595049+00'),
	('a678a9c5-7c48-4b59-9b9b-97a8a5d3a5a5', 'message_send_burst', 'ef787189-cd97-4895-8906-89cc37487afd', NULL, '4fbe94ff-5096-47bc-ba75-2ce31fddc37f', '{}', '2026-04-13 12:05:54.930003+00'),
	('e753b42d-a527-44b5-a2c1-2651297e7d00', 'message_send_minute', 'ef787189-cd97-4895-8906-89cc37487afd', NULL, '4fbe94ff-5096-47bc-ba75-2ce31fddc37f', '{}', '2026-04-13 12:05:54.930003+00'),
	('bf31a462-776e-4661-bb18-13868ed6f5a0', 'message_send_burst', '763a1a63-f76f-4350-aad1-92e1861ced8e', NULL, '4fbe94ff-5096-47bc-ba75-2ce31fddc37f', '{}', '2026-04-14 11:25:20.653432+00'),
	('da9bf801-4f50-4172-a5d7-29733c2775e8', 'message_send_minute', '763a1a63-f76f-4350-aad1-92e1861ced8e', NULL, '4fbe94ff-5096-47bc-ba75-2ce31fddc37f', '{}', '2026-04-14 11:25:20.653432+00');


--
-- Data for Name: workout_logs; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: workout_sessions; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: workout_set_logs; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: workout_template_exercises; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: workspace_client_onboardings; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."workspace_client_onboardings" ("id", "workspace_id", "client_id", "source", "status", "basics", "goals", "training_history", "injuries_limitations", "nutrition_lifestyle", "step_state", "initial_baseline_entry_id", "coach_review_notes", "first_program_template_id", "first_program_applied_at", "first_checkin_template_id", "first_checkin_date", "first_checkin_scheduled_at", "reviewed_by_user_id", "started_at", "last_saved_at", "submitted_at", "reviewed_at", "activated_at", "completed_at", "created_at", "updated_at") VALUES
	('48403b16-7f7e-410d-b6db-94d55b40ceba', '871a5b31-6dd0-4daa-a372-7e3ea03692c4', '25475c65-fa5d-4a02-828e-d4a7eb2195e5', 'converted_lead', 'in_progress', '{"email": "client@test.com", "location": "", "timezone": "", "unit_preference": "metric", "location_country": ""}', '{"goal": "Fat Loss", "motivation": "I would like to be healthier, leaner and improve my vitals", "secondary_goals": []}', '{"gym_name": "Soulhiit", "equipment": "Commercial gym, with open space", "days_per_week": 5, "confidence_level": "Confident training alone", "experience_level": "Intermediate", "current_training_routine": "", "current_training_frequency": "5+ sessions / week"}', '{"injuries": "None", "limitations": "None", "surgeries_history": "None", "exercises_to_avoid": "None"}', '{"allergies": "Spicy Foods", "stress_level": "Moderate", "foods_avoided": ["None"], "sleep_quality": "Inconsistent", "cooking_confidence": "High", "dietary_preferences": "Halal", "eating_out_frequency": "1-2 times / week", "schedule_constraints": "Shift Work, 6 Am to 4PM.", "preferred_training_time": "Early morning"}', '{"currentStep": "nutrition-lifestyle", "completedSteps": {"goals": true, "basics": true, "review-submit": false, "training-history": true, "initial-assessment": false, "nutrition-lifestyle": true, "injuries-limitations": true}, "lastVisitedStep": "nutrition-lifestyle", "lastCompletedStep": "nutrition-lifestyle"}', '76ab2a2b-79e8-41d0-9657-8e48cb806f79', NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-04-12 07:42:11.450889+00', '2026-04-14 12:10:43.663232+00', NULL, NULL, NULL, NULL, '2026-04-12 07:42:11.450889+00', '2026-04-14 12:10:43.663232+00');


--
-- Data for Name: workspace_members; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."workspace_members" ("id", "workspace_id", "user_id", "role", "created_at", "updated_at", "theme_preference", "compact_density") VALUES
	('213ad950-72d1-4839-8d95-4d50bf8f1f88', '8e6d6bc4-7edd-405b-9fc4-48c38ba1f8c2', '5880f44b-ecff-4793-a02a-817f801d7606', 'pt_owner', '2026-04-11 12:36:17.719269+00', '2026-04-11 12:36:17.771235+00', 'system', false),
	('347aa34c-275b-4b3f-88a1-c6334e4529bf', '3d3da0e5-d510-416e-bb98-88747e5a7537', '763a1a63-f76f-4350-aad1-92e1861ced8e', 'pt_owner', '2026-04-11 06:54:14.368342+00', '2026-04-11 12:45:17.309503+00', 'dark', false),
	('a84bf2b5-82cc-4533-a9f9-2e975e4b5ce6', '871a5b31-6dd0-4daa-a372-7e3ea03692c4', '763a1a63-f76f-4350-aad1-92e1861ced8e', 'pt_owner', '2026-04-11 12:14:55.595049+00', '2026-04-11 12:45:17.309503+00', 'dark', false);


--
-- Data for Name: buckets; Type: TABLE DATA; Schema: storage; Owner: supabase_storage_admin
--

INSERT INTO "storage"."buckets" ("id", "name", "owner", "created_at", "updated_at", "public", "avif_autodetection", "file_size_limit", "allowed_mime_types", "owner_id", "type") VALUES
	('baseline_photos', 'baseline_photos', NULL, '2026-04-09 12:36:34.229035+00', '2026-04-09 12:36:34.229035+00', false, false, 10485760, '{image/jpeg,image/png,image/webp}', NULL, 'STANDARD'),
	('checkin-photos', 'checkin-photos', NULL, '2026-04-09 12:36:34.409606+00', '2026-04-09 12:36:34.409606+00', false, false, 10485760, '{image/jpeg,image/png,image/webp}', NULL, 'STANDARD'),
	('medical_documents', 'medical_documents', NULL, '2026-04-09 12:36:34.494965+00', '2026-04-09 12:36:34.494965+00', false, false, 15728640, '{application/pdf,image/jpeg,image/png,image/webp,image/heic,image/heif}', NULL, 'STANDARD'),
	('pt_profile_media', 'pt_profile_media', NULL, '2026-04-09 12:36:34.581831+00', '2026-04-09 12:36:34.581831+00', true, false, 10485760, '{image/jpeg,image/png,image/webp}', NULL, 'STANDARD');


--
-- Data for Name: buckets_analytics; Type: TABLE DATA; Schema: storage; Owner: supabase_storage_admin
--



--
-- Data for Name: buckets_vectors; Type: TABLE DATA; Schema: storage; Owner: supabase_storage_admin
--



--
-- Data for Name: iceberg_namespaces; Type: TABLE DATA; Schema: storage; Owner: supabase_storage_admin
--



--
-- Data for Name: iceberg_tables; Type: TABLE DATA; Schema: storage; Owner: supabase_storage_admin
--



--
-- Data for Name: objects; Type: TABLE DATA; Schema: storage; Owner: supabase_storage_admin
--

INSERT INTO "storage"."objects" ("id", "bucket_id", "name", "owner", "created_at", "updated_at", "last_accessed_at", "metadata", "version", "owner_id", "user_metadata") VALUES
	('bade6a06-486b-4e3b-949d-92d97568c231', 'pt_profile_media', '763a1a63-f76f-4350-aad1-92e1861ced8e/profile/profile-photo.jpg', '763a1a63-f76f-4350-aad1-92e1861ced8e', '2026-04-11 10:36:25.047247+00', '2026-04-11 10:36:25.047247+00', '2026-04-11 10:36:25.047247+00', '{"eTag": "\"75a7825b1855627019f3eccceab45223\"", "size": 39892, "mimetype": "image/jpeg", "cacheControl": "max-age=3600", "lastModified": "2026-04-11T10:36:25.017Z", "contentLength": 39892, "httpStatusCode": 200}', '25a1af9b-98a9-4bdc-8e7d-81694ba468fe', '763a1a63-f76f-4350-aad1-92e1861ced8e', '{}'),
	('b2bdb001-821a-4882-96c1-e96644ba2f02', 'pt_profile_media', '763a1a63-f76f-4350-aad1-92e1861ced8e/profile/banner.jpg', '763a1a63-f76f-4350-aad1-92e1861ced8e', '2026-04-11 10:36:30.393891+00', '2026-04-11 10:36:30.393891+00', '2026-04-11 10:36:30.393891+00', '{"eTag": "\"b175764c10123eb6c562752d91908eb6\"", "size": 61468, "mimetype": "image/jpeg", "cacheControl": "max-age=3600", "lastModified": "2026-04-11T10:36:30.361Z", "contentLength": 61468, "httpStatusCode": 200}', 'a05588d5-85f7-46f2-a5e0-6f899c270a28', '763a1a63-f76f-4350-aad1-92e1861ced8e', '{}');


--
-- Data for Name: s3_multipart_uploads; Type: TABLE DATA; Schema: storage; Owner: supabase_storage_admin
--



--
-- Data for Name: s3_multipart_uploads_parts; Type: TABLE DATA; Schema: storage; Owner: supabase_storage_admin
--



--
-- Data for Name: vector_indexes; Type: TABLE DATA; Schema: storage; Owner: supabase_storage_admin
--



--
-- Data for Name: hooks; Type: TABLE DATA; Schema: supabase_functions; Owner: supabase_functions_admin
--



--
-- Name: refresh_tokens_id_seq; Type: SEQUENCE SET; Schema: auth; Owner: supabase_auth_admin
--

SELECT pg_catalog.setval('"auth"."refresh_tokens_id_seq"', 56, true);


--
-- Name: hooks_id_seq; Type: SEQUENCE SET; Schema: supabase_functions; Owner: supabase_functions_admin
--

SELECT pg_catalog.setval('"supabase_functions"."hooks_id_seq"', 1, false);


--
-- PostgreSQL database dump complete
--

-- \unrestrict UwFWwOaeZ7WRThxLd3zlsEd9vlcP8N4NcVAfBs5oZTO2m4dcGg7AsDteVp8rJiO

RESET ALL;

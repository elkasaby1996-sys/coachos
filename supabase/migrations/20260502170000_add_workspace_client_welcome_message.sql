ALTER TABLE "public"."workspaces"
  ADD COLUMN IF NOT EXISTS "client_welcome_message" "text" NOT NULL DEFAULT '';

UPDATE "public"."workspaces"
SET "client_welcome_message" = COALESCE("client_welcome_message", '');

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "pg_constraint"
    WHERE "conname" = 'workspaces_client_welcome_message_length_check'
  ) THEN
    ALTER TABLE "public"."workspaces"
      ADD CONSTRAINT "workspaces_client_welcome_message_length_check"
      CHECK ("char_length"("client_welcome_message") <= 2000);
  END IF;
END $$;

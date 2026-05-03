ALTER TABLE "public"."workspaces"
  ADD COLUMN IF NOT EXISTS "timezone" "text" NOT NULL DEFAULT 'UTC',
  ADD COLUMN IF NOT EXISTS "unit_preference" "text" NOT NULL DEFAULT 'metric',
  ADD COLUMN IF NOT EXISTS "week_start_day" "text" NOT NULL DEFAULT 'monday';

UPDATE "public"."workspaces"
SET
  "timezone" = COALESCE(NULLIF("timezone", ''), 'UTC'),
  "unit_preference" = COALESCE(NULLIF("unit_preference", ''), 'metric'),
  "week_start_day" = COALESCE(NULLIF("week_start_day", ''), 'monday');

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "pg_constraint"
    WHERE "conname" = 'workspaces_timezone_not_blank'
  ) THEN
    ALTER TABLE "public"."workspaces"
      ADD CONSTRAINT "workspaces_timezone_not_blank"
      CHECK ("btrim"("timezone") <> '');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM "pg_constraint"
    WHERE "conname" = 'workspaces_unit_preference_check'
  ) THEN
    ALTER TABLE "public"."workspaces"
      ADD CONSTRAINT "workspaces_unit_preference_check"
      CHECK ("unit_preference" IN ('metric', 'imperial'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM "pg_constraint"
    WHERE "conname" = 'workspaces_week_start_day_check'
  ) THEN
    ALTER TABLE "public"."workspaces"
      ADD CONSTRAINT "workspaces_week_start_day_check"
      CHECK ("week_start_day" IN ('monday', 'sunday'));
  END IF;
END $$;

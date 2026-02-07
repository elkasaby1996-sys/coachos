-- Per-client check-in settings

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS checkin_frequency text NOT NULL DEFAULT 'weekly',
  ADD COLUMN IF NOT EXISTS checkin_start_date date;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'clients_checkin_frequency_valid'
  ) THEN
    ALTER TABLE public.clients
      ADD CONSTRAINT clients_checkin_frequency_valid
      CHECK (checkin_frequency IN ('weekly', 'biweekly', 'monthly'));
  END IF;
END $$;

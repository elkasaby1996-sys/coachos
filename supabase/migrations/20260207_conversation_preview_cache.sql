-- Conversation preview cache for faster message lists

ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS last_message_id uuid,
  ADD COLUMN IF NOT EXISTS last_message_preview text,
  ADD COLUMN IF NOT EXISTS last_message_sender_name text,
  ADD COLUMN IF NOT EXISTS last_message_sender_role text;

-- Backfill cache from most recent message per conversation
WITH latest AS (
  SELECT DISTINCT ON (conversation_id)
    conversation_id,
    id AS message_id,
    created_at,
    COALESCE(preview, LEFT(body, 140)) AS preview,
    sender_name,
    sender_role
  FROM public.messages
  ORDER BY conversation_id, created_at DESC
)
UPDATE public.conversations conv
SET last_message_id = latest.message_id,
    last_message_at = latest.created_at,
    last_message_preview = latest.preview,
    last_message_sender_name = latest.sender_name,
    last_message_sender_role = latest.sender_role
FROM latest
WHERE conv.id = latest.conversation_id;

-- Update trigger function to keep cache fresh
CREATE OR REPLACE FUNCTION public.touch_conversation_last_message()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
  UPDATE public.conversations
  SET last_message_id = NEW.id,
      last_message_at = NEW.created_at,
      last_message_preview = COALESCE(NEW.preview, LEFT(NEW.body, 140)),
      last_message_sender_name = NEW.sender_name,
      last_message_sender_role = NEW.sender_role,
      updated_at = now()
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$fn$;

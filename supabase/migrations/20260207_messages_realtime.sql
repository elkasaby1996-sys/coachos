-- Messaging enhancements: last_message trigger + typing indicator

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_proc
    WHERE proname = 'touch_conversation_last_message'
  ) THEN
    CREATE FUNCTION public.touch_conversation_last_message()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $fn$
    BEGIN
      UPDATE public.conversations
      SET last_message_at = NEW.created_at,
          updated_at = now()
      WHERE id = NEW.conversation_id;
      RETURN NEW;
    END;
    $fn$;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'set_conversation_last_message'
  ) THEN
    CREATE TRIGGER set_conversation_last_message
    AFTER INSERT ON public.messages
    FOR EACH ROW
    EXECUTE FUNCTION public.touch_conversation_last_message();
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.message_typing (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL,
  user_id uuid NOT NULL,
  role text NOT NULL,
  is_typing boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'message_typing_conversation_user_key'
  ) THEN
    ALTER TABLE public.message_typing
      ADD CONSTRAINT message_typing_conversation_user_key
      UNIQUE (conversation_id, user_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'set_message_typing_updated_at'
  ) THEN
    CREATE TRIGGER set_message_typing_updated_at
    BEFORE UPDATE ON public.message_typing
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS message_typing_conversation_id_idx
  ON public.message_typing (conversation_id);

ALTER TABLE public.message_typing ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "message_typing_access" ON public.message_typing;
CREATE POLICY "message_typing_access"
  ON public.message_typing
  FOR ALL
  TO public
  USING (
    EXISTS (
      SELECT 1
      FROM public.conversations conv
      JOIN public.clients c ON c.id = conv.client_id
      JOIN public.workspace_members wm ON wm.workspace_id = c.workspace_id
      WHERE conv.id = message_typing.conversation_id
        AND wm.user_id = (select auth.uid())
    )
    OR EXISTS (
      SELECT 1
      FROM public.conversations conv
      JOIN public.clients c ON c.id = conv.client_id
      WHERE conv.id = message_typing.conversation_id
        AND c.user_id = (select auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.conversations conv
      JOIN public.clients c ON c.id = conv.client_id
      JOIN public.workspace_members wm ON wm.workspace_id = c.workspace_id
      WHERE conv.id = message_typing.conversation_id
        AND wm.user_id = (select auth.uid())
    )
    OR EXISTS (
      SELECT 1
      FROM public.conversations conv
      JOIN public.clients c ON c.id = conv.client_id
      WHERE conv.id = message_typing.conversation_id
        AND c.user_id = (select auth.uid())
    )
  );

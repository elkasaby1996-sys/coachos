-- Messaging: conversations + messages

CREATE TABLE IF NOT EXISTS public.conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  client_id uuid NOT NULL,
  last_message_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS workspace_id uuid,
  ADD COLUMN IF NOT EXISTS client_id uuid,
  ADD COLUMN IF NOT EXISTS last_message_at timestamptz,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'conversations'
      AND column_name = 'workspace_id'
  ) AND EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'conversations'
      AND column_name = 'client_id'
  ) AND NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'conversations_workspace_client_key'
  ) THEN
    ALTER TABLE public.conversations
      ADD CONSTRAINT conversations_workspace_client_key
      UNIQUE (workspace_id, client_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'set_conversations_updated_at'
  ) THEN
    CREATE TRIGGER set_conversations_updated_at
    BEFORE UPDATE ON public.conversations
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS conversations_workspace_id_idx
  ON public.conversations (workspace_id);

CREATE INDEX IF NOT EXISTS conversations_client_id_idx
  ON public.conversations (client_id);

CREATE TABLE IF NOT EXISTS public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL,
  sender_user_id uuid NOT NULL,
  sender_role text NOT NULL DEFAULT 'client',
  body text NOT NULL,
  sender_name text,
  preview text,
  unread boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS conversation_id uuid,
  ADD COLUMN IF NOT EXISTS sender_user_id uuid,
  ADD COLUMN IF NOT EXISTS sender_role text NOT NULL DEFAULT 'client',
  ADD COLUMN IF NOT EXISTS body text,
  ADD COLUMN IF NOT EXISTS sender_name text,
  ADD COLUMN IF NOT EXISTS preview text,
  ADD COLUMN IF NOT EXISTS unread boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'messages'
      AND column_name = 'content'
  ) THEN
    ALTER TABLE public.messages
      ALTER COLUMN content SET DEFAULT '';
    UPDATE public.messages
    SET content = COALESCE(content, '')
    WHERE content IS NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'messages'
      AND column_name = 'body'
  ) THEN
    ALTER TABLE public.messages
      ALTER COLUMN body SET DEFAULT '';
    UPDATE public.messages
    SET body = COALESCE(body, '')
    WHERE body IS NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'messages'
      AND column_name = 'conversation_id'
  ) AND NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'messages_conversation_id_fkey'
  ) THEN
    ALTER TABLE public.messages
      ADD CONSTRAINT messages_conversation_id_fkey
      FOREIGN KEY (conversation_id)
      REFERENCES public.conversations(id)
      ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS messages_conversation_id_idx
  ON public.messages (conversation_id);

CREATE INDEX IF NOT EXISTS messages_sender_user_id_idx
  ON public.messages (sender_user_id);

CREATE INDEX IF NOT EXISTS messages_created_at_idx
  ON public.messages (created_at);

ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "conversations_access" ON public.conversations;
CREATE POLICY "conversations_access"
  ON public.conversations
  FOR ALL
  TO public
  USING (
    EXISTS (
      SELECT 1
      FROM public.clients c
      JOIN public.workspace_members wm ON wm.workspace_id = c.workspace_id
      WHERE c.id = conversations.client_id
        AND wm.user_id = (select auth.uid())
    )
    OR EXISTS (
      SELECT 1
      FROM public.clients c
      WHERE c.id = conversations.client_id
        AND c.user_id = (select auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.clients c
      JOIN public.workspace_members wm ON wm.workspace_id = c.workspace_id
      WHERE c.id = conversations.client_id
        AND wm.user_id = (select auth.uid())
    )
    OR EXISTS (
      SELECT 1
      FROM public.clients c
      WHERE c.id = conversations.client_id
        AND c.user_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS "messages_access" ON public.messages;
CREATE POLICY "messages_access"
  ON public.messages
  FOR ALL
  TO public
  USING (
    EXISTS (
      SELECT 1
      FROM public.conversations conv
      JOIN public.clients c ON c.id = conv.client_id
      JOIN public.workspace_members wm ON wm.workspace_id = c.workspace_id
      WHERE conv.id = messages.conversation_id
        AND wm.user_id = (select auth.uid())
    )
    OR EXISTS (
      SELECT 1
      FROM public.conversations conv
      JOIN public.clients c ON c.id = conv.client_id
      WHERE conv.id = messages.conversation_id
        AND c.user_id = (select auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.conversations conv
      JOIN public.clients c ON c.id = conv.client_id
      JOIN public.workspace_members wm ON wm.workspace_id = c.workspace_id
      WHERE conv.id = messages.conversation_id
        AND wm.user_id = (select auth.uid())
    )
    OR EXISTS (
      SELECT 1
      FROM public.conversations conv
      JOIN public.clients c ON c.id = conv.client_id
      WHERE conv.id = messages.conversation_id
        AND c.user_id = (select auth.uid())
    )
  );

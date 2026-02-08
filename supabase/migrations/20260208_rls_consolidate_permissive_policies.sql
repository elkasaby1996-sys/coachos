-- Consolidate overlapping permissive RLS policies flagged by linter (0006)

-- =========================
-- checkin_answers
-- =========================
DROP POLICY IF EXISTS "checkin_answers_pt_manage" ON public.checkin_answers;
DROP POLICY IF EXISTS "checkin_answers_client_rw" ON public.checkin_answers;

CREATE POLICY "checkin_answers_access"
  ON public.checkin_answers
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.checkins ci
      JOIN public.clients c ON c.id = ci.client_id
      WHERE ci.id = checkin_answers.checkin_id
        AND c.user_id = (select auth.uid())
    )
    OR EXISTS (
      SELECT 1
      FROM public.checkins ci
      JOIN public.clients c ON c.id = ci.client_id
      JOIN public.workspace_members wm ON wm.workspace_id = c.workspace_id
      WHERE ci.id = checkin_answers.checkin_id
        AND wm.user_id = (select auth.uid())
        AND wm.role::text IN ('pt_owner', 'pt_coach')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.checkins ci
      JOIN public.clients c ON c.id = ci.client_id
      WHERE ci.id = checkin_answers.checkin_id
        AND c.user_id = (select auth.uid())
    )
    OR EXISTS (
      SELECT 1
      FROM public.checkins ci
      JOIN public.clients c ON c.id = ci.client_id
      JOIN public.workspace_members wm ON wm.workspace_id = c.workspace_id
      WHERE ci.id = checkin_answers.checkin_id
        AND wm.user_id = (select auth.uid())
        AND wm.role::text IN ('pt_owner', 'pt_coach')
    )
  );

-- =========================
-- checkin_questions
-- =========================
DROP POLICY IF EXISTS "checkin_questions_pt_manage" ON public.checkin_questions;
DROP POLICY IF EXISTS "checkin_questions_client_read" ON public.checkin_questions;

CREATE POLICY "checkin_questions_select_access"
  ON public.checkin_questions
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.checkin_templates ct
      JOIN public.clients c ON c.workspace_id = ct.workspace_id
      WHERE ct.id = checkin_questions.template_id
        AND c.user_id = (select auth.uid())
    )
    OR EXISTS (
      SELECT 1
      FROM public.checkin_templates ct
      JOIN public.workspace_members wm ON wm.workspace_id = ct.workspace_id
      WHERE ct.id = checkin_questions.template_id
        AND wm.user_id = (select auth.uid())
        AND wm.role::text IN ('pt_owner', 'pt_coach')
    )
  );

CREATE POLICY "checkin_questions_insert_pt"
  ON public.checkin_questions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.checkin_templates ct
      JOIN public.workspace_members wm ON wm.workspace_id = ct.workspace_id
      WHERE ct.id = checkin_questions.template_id
        AND wm.user_id = (select auth.uid())
        AND wm.role::text IN ('pt_owner', 'pt_coach')
    )
  );

CREATE POLICY "checkin_questions_update_pt"
  ON public.checkin_questions
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.checkin_templates ct
      JOIN public.workspace_members wm ON wm.workspace_id = ct.workspace_id
      WHERE ct.id = checkin_questions.template_id
        AND wm.user_id = (select auth.uid())
        AND wm.role::text IN ('pt_owner', 'pt_coach')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.checkin_templates ct
      JOIN public.workspace_members wm ON wm.workspace_id = ct.workspace_id
      WHERE ct.id = checkin_questions.template_id
        AND wm.user_id = (select auth.uid())
        AND wm.role::text IN ('pt_owner', 'pt_coach')
    )
  );

CREATE POLICY "checkin_questions_delete_pt"
  ON public.checkin_questions
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.checkin_templates ct
      JOIN public.workspace_members wm ON wm.workspace_id = ct.workspace_id
      WHERE ct.id = checkin_questions.template_id
        AND wm.user_id = (select auth.uid())
        AND wm.role::text IN ('pt_owner', 'pt_coach')
    )
  );

-- =========================
-- checkin_templates
-- =========================
DROP POLICY IF EXISTS "checkin_templates_pt_manage" ON public.checkin_templates;
DROP POLICY IF EXISTS "checkin_templates_client_read" ON public.checkin_templates;

CREATE POLICY "checkin_templates_select_access"
  ON public.checkin_templates
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.clients c
      WHERE c.workspace_id = checkin_templates.workspace_id
        AND c.user_id = (select auth.uid())
    )
    OR EXISTS (
      SELECT 1
      FROM public.workspace_members wm
      WHERE wm.workspace_id = checkin_templates.workspace_id
        AND wm.user_id = (select auth.uid())
        AND wm.role::text IN ('pt_owner', 'pt_coach')
    )
  );

CREATE POLICY "checkin_templates_insert_pt"
  ON public.checkin_templates
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.workspace_members wm
      WHERE wm.workspace_id = checkin_templates.workspace_id
        AND wm.user_id = (select auth.uid())
        AND wm.role::text IN ('pt_owner', 'pt_coach')
    )
  );

CREATE POLICY "checkin_templates_update_pt"
  ON public.checkin_templates
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.workspace_members wm
      WHERE wm.workspace_id = checkin_templates.workspace_id
        AND wm.user_id = (select auth.uid())
        AND wm.role::text IN ('pt_owner', 'pt_coach')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.workspace_members wm
      WHERE wm.workspace_id = checkin_templates.workspace_id
        AND wm.user_id = (select auth.uid())
        AND wm.role::text IN ('pt_owner', 'pt_coach')
    )
  );

CREATE POLICY "checkin_templates_delete_pt"
  ON public.checkin_templates
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.workspace_members wm
      WHERE wm.workspace_id = checkin_templates.workspace_id
        AND wm.user_id = (select auth.uid())
        AND wm.role::text IN ('pt_owner', 'pt_coach')
    )
  );

-- =========================
-- coach_todos
-- =========================
DROP POLICY IF EXISTS "coach_todos_select_own" ON public.coach_todos;
DROP POLICY IF EXISTS "coach_todos_insert_own" ON public.coach_todos;
DROP POLICY IF EXISTS "coach_todos_update_own" ON public.coach_todos;
DROP POLICY IF EXISTS "coach_todos_delete_own" ON public.coach_todos;
DROP POLICY IF EXISTS "coach_todos_pt_manage" ON public.coach_todos;

CREATE POLICY "coach_todos_access"
  ON public.coach_todos
  FOR ALL
  TO authenticated
  USING (
    coach_id = (select auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.workspace_members wm
      WHERE wm.workspace_id = coach_todos.workspace_id
        AND wm.user_id = (select auth.uid())
        AND wm.role::text IN ('pt_owner', 'pt_coach')
    )
  )
  WITH CHECK (
    coach_id = (select auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.workspace_members wm
      WHERE wm.workspace_id = coach_todos.workspace_id
        AND wm.user_id = (select auth.uid())
        AND wm.role::text IN ('pt_owner', 'pt_coach')
    )
  );

-- =========================
-- exercises + workout_templates
-- Remove broad *_pt_manage policies that duplicate action-specific policies.
-- =========================
DROP POLICY IF EXISTS "exercises_pt_manage" ON public.exercises;
DROP POLICY IF EXISTS "workout_templates_pt_manage" ON public.workout_templates;

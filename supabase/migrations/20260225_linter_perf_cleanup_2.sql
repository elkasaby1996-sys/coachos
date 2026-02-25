-- Linter performance cleanup (round 2): consolidate permissive policies and remove duplicate indexes

-- =====================================================
-- duplicate indexes
-- =====================================================
DROP INDEX IF EXISTS public.idx_clients_workspace_id;
DROP INDEX IF EXISTS public.pt_profiles_user_workspace_uidx;

-- =====================================================
-- clients: collapse overlapping SELECT/UPDATE policies
-- =====================================================
DROP POLICY IF EXISTS "pt_read_workspace_clients" ON public.clients;
DROP POLICY IF EXISTS "client_read_own" ON public.clients;
DROP POLICY IF EXISTS "clients_select_access" ON public.clients;

CREATE POLICY "clients_select_access"
  ON public.clients
  FOR SELECT
  TO authenticated
  USING (
    user_id = (select auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.workspace_members wm
      WHERE wm.workspace_id = clients.workspace_id
        AND wm.user_id = (select auth.uid())
    )
    OR public.is_workspace_member(clients.workspace_id)
  );

DROP POLICY IF EXISTS "client_update_own" ON public.clients;
DROP POLICY IF EXISTS "clients_update_access" ON public.clients;

CREATE POLICY "clients_update_access"
  ON public.clients
  FOR UPDATE
  TO authenticated
  USING (
    user_id = (select auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.workspace_members wm
      WHERE wm.workspace_id = clients.workspace_id
        AND wm.user_id = (select auth.uid())
        AND wm.role::text LIKE 'pt_%'
    )
  )
  WITH CHECK (
    user_id = (select auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.workspace_members wm
      WHERE wm.workspace_id = clients.workspace_id
        AND wm.user_id = (select auth.uid())
        AND wm.role::text LIKE 'pt_%'
    )
  );

-- =====================================================
-- invites: collapse overlapping permissive policies
-- =====================================================
DROP POLICY IF EXISTS "invites_select_access" ON public.invites;
DROP POLICY IF EXISTS "invites_insert_pt" ON public.invites;
DROP POLICY IF EXISTS "invites_update_pt" ON public.invites;
DROP POLICY IF EXISTS "invites_delete_pt" ON public.invites;
DROP POLICY IF EXISTS "pt_manage_invites" ON public.invites;

CREATE POLICY "invites_access"
  ON public.invites
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.workspace_members wm
      WHERE wm.workspace_id = invites.workspace_id
        AND wm.user_id = (select auth.uid())
        AND wm.role::text LIKE 'pt_%'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.workspace_members wm
      WHERE wm.workspace_id = invites.workspace_id
        AND wm.user_id = (select auth.uid())
        AND wm.role::text LIKE 'pt_%'
    )
  );

-- =====================================================
-- workspaces: collapse overlapping UPDATE policies
-- =====================================================
DROP POLICY IF EXISTS "pt_update_workspace_defaults" ON public.workspaces;
DROP POLICY IF EXISTS "workspaces_pt_owner_update" ON public.workspaces;

CREATE POLICY "workspaces_update_access"
  ON public.workspaces
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.workspace_members wm
      WHERE wm.workspace_id = workspaces.id
        AND wm.user_id = (select auth.uid())
        AND wm.role::text LIKE 'pt_%'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.workspace_members wm
      WHERE wm.workspace_id = workspaces.id
        AND wm.user_id = (select auth.uid())
        AND wm.role::text LIKE 'pt_%'
    )
  );

-- =====================================================
-- nutrition assigned entities: collapse duplicate SELECT policies
-- =====================================================
DROP POLICY IF EXISTS "assigned_nutrition_plans_pt_view" ON public.assigned_nutrition_plans;
DROP POLICY IF EXISTS "assigned_nutrition_plans_client_select_own" ON public.assigned_nutrition_plans;

CREATE POLICY "assigned_nutrition_plans_select_access"
  ON public.assigned_nutrition_plans
  FOR SELECT
  TO authenticated
  USING (
    public.is_client_owner(assigned_nutrition_plans.client_id)
    OR EXISTS (
      SELECT 1
      FROM public.clients c
      WHERE c.id = assigned_nutrition_plans.client_id
        AND public.is_pt_workspace_member(c.workspace_id)
    )
  );

DROP POLICY IF EXISTS "assigned_nutrition_days_pt_view" ON public.assigned_nutrition_days;
DROP POLICY IF EXISTS "assigned_nutrition_days_client_select_own" ON public.assigned_nutrition_days;

CREATE POLICY "assigned_nutrition_days_select_access"
  ON public.assigned_nutrition_days
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.assigned_nutrition_plans ap
      WHERE ap.id = assigned_nutrition_days.assigned_nutrition_plan_id
        AND public.is_client_owner(ap.client_id)
    )
    OR EXISTS (
      SELECT 1
      FROM public.assigned_nutrition_plans ap
      JOIN public.clients c ON c.id = ap.client_id
      WHERE ap.id = assigned_nutrition_days.assigned_nutrition_plan_id
        AND public.is_pt_workspace_member(c.workspace_id)
    )
  );

DROP POLICY IF EXISTS "assigned_nutrition_meals_pt_view" ON public.assigned_nutrition_meals;
DROP POLICY IF EXISTS "assigned_nutrition_meals_client_select_own" ON public.assigned_nutrition_meals;

CREATE POLICY "assigned_nutrition_meals_select_access"
  ON public.assigned_nutrition_meals
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.assigned_nutrition_days ad
      JOIN public.assigned_nutrition_plans ap ON ap.id = ad.assigned_nutrition_plan_id
      WHERE ad.id = assigned_nutrition_meals.assigned_nutrition_day_id
        AND public.is_client_owner(ap.client_id)
    )
    OR EXISTS (
      SELECT 1
      FROM public.assigned_nutrition_days ad
      JOIN public.assigned_nutrition_plans ap ON ap.id = ad.assigned_nutrition_plan_id
      JOIN public.clients c ON c.id = ap.client_id
      WHERE ad.id = assigned_nutrition_meals.assigned_nutrition_day_id
        AND public.is_pt_workspace_member(c.workspace_id)
    )
  );

DROP POLICY IF EXISTS "assigned_nutrition_meal_components_pt_view" ON public.assigned_nutrition_meal_components;
DROP POLICY IF EXISTS "assigned_nutrition_meal_components_client_select_own" ON public.assigned_nutrition_meal_components;

CREATE POLICY "assigned_nutrition_meal_components_select_access"
  ON public.assigned_nutrition_meal_components
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.assigned_nutrition_meals am
      JOIN public.assigned_nutrition_days ad ON ad.id = am.assigned_nutrition_day_id
      JOIN public.assigned_nutrition_plans ap ON ap.id = ad.assigned_nutrition_plan_id
      WHERE am.id = assigned_nutrition_meal_components.assigned_nutrition_meal_id
        AND public.is_client_owner(ap.client_id)
    )
    OR EXISTS (
      SELECT 1
      FROM public.assigned_nutrition_meals am
      JOIN public.assigned_nutrition_days ad ON ad.id = am.assigned_nutrition_day_id
      JOIN public.assigned_nutrition_plans ap ON ap.id = ad.assigned_nutrition_plan_id
      JOIN public.clients c ON c.id = ap.client_id
      WHERE am.id = assigned_nutrition_meal_components.assigned_nutrition_meal_id
        AND public.is_pt_workspace_member(c.workspace_id)
    )
  );

DROP POLICY IF EXISTS "nutrition_meal_logs_pt_view" ON public.nutrition_meal_logs;
DROP POLICY IF EXISTS "nutrition_meal_logs_client_select_own" ON public.nutrition_meal_logs;

CREATE POLICY "nutrition_meal_logs_select_access"
  ON public.nutrition_meal_logs
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.assigned_nutrition_meals am
      JOIN public.assigned_nutrition_days ad ON ad.id = am.assigned_nutrition_day_id
      JOIN public.assigned_nutrition_plans ap ON ap.id = ad.assigned_nutrition_plan_id
      WHERE am.id = nutrition_meal_logs.assigned_nutrition_meal_id
        AND public.is_client_owner(ap.client_id)
    )
    OR EXISTS (
      SELECT 1
      FROM public.assigned_nutrition_meals am
      JOIN public.assigned_nutrition_days ad ON ad.id = am.assigned_nutrition_day_id
      JOIN public.assigned_nutrition_plans ap ON ap.id = ad.assigned_nutrition_plan_id
      JOIN public.clients c ON c.id = ap.client_id
      WHERE am.id = nutrition_meal_logs.assigned_nutrition_meal_id
        AND public.is_pt_workspace_member(c.workspace_id)
    )
  );

-- =====================================================
-- optional tables present in some environments
-- =====================================================
DO $$
DECLARE
  v_pt_using text;
  v_pt_check text;
  v_client_select_using text;
BEGIN
  IF to_regclass('public.client_macro_targets') IS NULL THEN
    RETURN;
  END IF;

  SELECT pg_get_expr(p.polqual, p.polrelid), pg_get_expr(p.polwithcheck, p.polrelid)
  INTO v_pt_using, v_pt_check
  FROM pg_policy p
  JOIN pg_class c ON c.oid = p.polrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname = 'client_macro_targets'
    AND p.polname = 'client_macro_targets_pt_manage'
  LIMIT 1;

  SELECT pg_get_expr(p.polqual, p.polrelid)
  INTO v_client_select_using
  FROM pg_policy p
  JOIN pg_class c ON c.oid = p.polrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname = 'client_macro_targets'
    AND p.polname = 'client_macro_targets_client_select_own'
  LIMIT 1;

  IF v_pt_using IS NULL OR v_client_select_using IS NULL THEN
    RETURN;
  END IF;

  EXECUTE 'DROP POLICY IF EXISTS "client_macro_targets_client_select_own" ON public.client_macro_targets';
  EXECUTE 'DROP POLICY IF EXISTS "client_macro_targets_pt_manage" ON public.client_macro_targets';
  EXECUTE 'DROP POLICY IF EXISTS "client_macro_targets_select_access" ON public.client_macro_targets';
  EXECUTE 'DROP POLICY IF EXISTS "client_macro_targets_insert_pt" ON public.client_macro_targets';
  EXECUTE 'DROP POLICY IF EXISTS "client_macro_targets_update_pt" ON public.client_macro_targets';
  EXECUTE 'DROP POLICY IF EXISTS "client_macro_targets_delete_pt" ON public.client_macro_targets';

  EXECUTE format(
    'CREATE POLICY "client_macro_targets_select_access"
       ON public.client_macro_targets
       FOR SELECT
       TO authenticated
       USING ((%s) OR (%s))',
    v_pt_using,
    v_client_select_using
  );

  EXECUTE format(
    'CREATE POLICY "client_macro_targets_insert_pt"
       ON public.client_macro_targets
       FOR INSERT
       TO authenticated
       WITH CHECK (%s)',
    coalesce(v_pt_check, v_pt_using)
  );

  EXECUTE format(
    'CREATE POLICY "client_macro_targets_update_pt"
       ON public.client_macro_targets
       FOR UPDATE
       TO authenticated
       USING (%s)
       WITH CHECK (%s)',
    v_pt_using,
    coalesce(v_pt_check, v_pt_using)
  );

  EXECUTE format(
    'CREATE POLICY "client_macro_targets_delete_pt"
       ON public.client_macro_targets
       FOR DELETE
       TO authenticated
       USING (%s)',
    v_pt_using
  );
END
$$;

DO $$
DECLARE
  v_pt_using text;
  v_pt_check text;
  v_client_select_using text;
  v_client_update_using text;
  v_client_update_check text;
BEGIN
  IF to_regclass('public.nutrition_day_logs') IS NULL THEN
    RETURN;
  END IF;

  SELECT pg_get_expr(p.polqual, p.polrelid), pg_get_expr(p.polwithcheck, p.polrelid)
  INTO v_pt_using, v_pt_check
  FROM pg_policy p
  JOIN pg_class c ON c.oid = p.polrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname = 'nutrition_day_logs'
    AND p.polname = 'nutrition_day_logs_pt_manage'
  LIMIT 1;

  SELECT pg_get_expr(p.polqual, p.polrelid)
  INTO v_client_select_using
  FROM pg_policy p
  JOIN pg_class c ON c.oid = p.polrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname = 'nutrition_day_logs'
    AND p.polname = 'nutrition_day_logs_client_select_own'
  LIMIT 1;

  SELECT pg_get_expr(p.polqual, p.polrelid), pg_get_expr(p.polwithcheck, p.polrelid)
  INTO v_client_update_using, v_client_update_check
  FROM pg_policy p
  JOIN pg_class c ON c.oid = p.polrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname = 'nutrition_day_logs'
    AND p.polname = 'nutrition_day_logs_client_update_own'
  LIMIT 1;

  IF v_pt_using IS NULL OR v_client_select_using IS NULL OR v_client_update_using IS NULL THEN
    RETURN;
  END IF;

  EXECUTE 'DROP POLICY IF EXISTS "nutrition_day_logs_client_select_own" ON public.nutrition_day_logs';
  EXECUTE 'DROP POLICY IF EXISTS "nutrition_day_logs_client_update_own" ON public.nutrition_day_logs';
  EXECUTE 'DROP POLICY IF EXISTS "nutrition_day_logs_pt_manage" ON public.nutrition_day_logs';
  EXECUTE 'DROP POLICY IF EXISTS "nutrition_day_logs_select_access" ON public.nutrition_day_logs';
  EXECUTE 'DROP POLICY IF EXISTS "nutrition_day_logs_update_access" ON public.nutrition_day_logs';
  EXECUTE 'DROP POLICY IF EXISTS "nutrition_day_logs_insert_pt" ON public.nutrition_day_logs';
  EXECUTE 'DROP POLICY IF EXISTS "nutrition_day_logs_delete_pt" ON public.nutrition_day_logs';

  EXECUTE format(
    'CREATE POLICY "nutrition_day_logs_select_access"
       ON public.nutrition_day_logs
       FOR SELECT
       TO authenticated
       USING ((%s) OR (%s))',
    v_pt_using,
    v_client_select_using
  );

  EXECUTE format(
    'CREATE POLICY "nutrition_day_logs_update_access"
       ON public.nutrition_day_logs
       FOR UPDATE
       TO authenticated
       USING ((%s) OR (%s))
       WITH CHECK ((%s) OR (%s))',
    v_pt_using,
    v_client_update_using,
    coalesce(v_pt_check, v_pt_using),
    coalesce(v_client_update_check, v_client_update_using)
  );

  EXECUTE format(
    'CREATE POLICY "nutrition_day_logs_insert_pt"
       ON public.nutrition_day_logs
       FOR INSERT
       TO authenticated
       WITH CHECK (%s)',
    coalesce(v_pt_check, v_pt_using)
  );

  EXECUTE format(
    'CREATE POLICY "nutrition_day_logs_delete_pt"
       ON public.nutrition_day_logs
       FOR DELETE
       TO authenticated
       USING (%s)',
    v_pt_using
  );
END
$$;

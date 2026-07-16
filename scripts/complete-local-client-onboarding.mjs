const apiUrl = process.env.E2E_SUPABASE_API_URL || "http://127.0.0.1:54321";

const ids = {
  workspace: "00000000-0000-4000-8000-000000000001",
  strengthTemplate: "00000000-0000-4000-8000-000000000201",
  conditioningTemplate: "00000000-0000-4000-8000-000000000202",
  nutritionTemplate: "00000000-0000-4000-8000-000000000301",
  checkinTemplate: "00000000-0000-4000-8000-000000000401",
  waistMarker: "00000000-0000-4000-8000-000000000602",
  pushupMarker: "00000000-0000-4000-8000-000000000603",
};

const clients = [
  {
    id: "00000000-0000-4000-8000-000000000101",
    email: "zoe.ramirez@repsync.test",
    name: "Zoe Ramirez",
    workoutId: "00000000-0000-4000-8000-000000001101",
    nutritionId: "00000000-0000-4000-8000-000000001201",
    baselineId: "00000000-0000-4000-8000-000000001301",
    conversationId: "00000000-0000-4000-8000-000000000501",
    messageId: "00000000-0000-4000-8000-000000001401",
    workoutTemplateId: ids.strengthTemplate,
    workoutName: "Lower Strength + Push",
    goal: "strength while dropping 6 kg",
    weight: 67.8,
    waist: 78.5,
    pushups: 34,
    offset: 1,
  },
  {
    id: "00000000-0000-4000-8000-000000000102",
    email: "marcus.chen@repsync.test",
    name: "Marcus Chen",
    workoutId: "00000000-0000-4000-8000-000000001102",
    nutritionId: "00000000-0000-4000-8000-000000001202",
    baselineId: "00000000-0000-4000-8000-000000001302",
    conversationId: "00000000-0000-4000-8000-000000001502",
    messageId: "00000000-0000-4000-8000-000000001402",
    workoutTemplateId: ids.strengthTemplate,
    workoutName: "Lower Strength + Push",
    goal: "lean mass and pain-free pressing",
    weight: 82.1,
    waist: 86,
    pushups: 29,
    offset: 2,
  },
  {
    id: "00000000-0000-4000-8000-000000000103",
    email: "layla.khan@repsync.test",
    name: "Layla Khan",
    workoutId: "00000000-0000-4000-8000-000000001103",
    nutritionId: "00000000-0000-4000-8000-000000001203",
    baselineId: "00000000-0000-4000-8000-000000001303",
    conversationId: "00000000-0000-4000-8000-000000001503",
    messageId: "00000000-0000-4000-8000-000000001403",
    workoutTemplateId: ids.conditioningTemplate,
    workoutName: "Zone 4 Bike Intervals",
    goal: "consistent training around travel",
    weight: 61.8,
    waist: 72,
    pushups: 24,
    offset: 3,
  },
  {
    id: "00000000-0000-4000-8000-000000000104",
    email: "ethan.brooks@repsync.test",
    name: "Ethan Brooks",
    workoutId: "00000000-0000-4000-8000-000000001104",
    nutritionId: "00000000-0000-4000-8000-000000001204",
    baselineId: "00000000-0000-4000-8000-000000001304",
    conversationId: "00000000-0000-4000-8000-000000001504",
    messageId: "00000000-0000-4000-8000-000000001404",
    workoutTemplateId: ids.conditioningTemplate,
    workoutName: "Zone 4 Bike Intervals",
    goal: "conditioning and a stronger deadlift",
    weight: 90.2,
    waist: 91,
    pushups: 31,
    offset: 4,
  },
  {
    id: "00000000-0000-4000-8000-000000000105",
    email: "amina.saleh@repsync.test",
    name: "Amina Saleh",
    workoutId: "00000000-0000-4000-8000-000000001105",
    nutritionId: "00000000-0000-4000-8000-000000001205",
    baselineId: "00000000-0000-4000-8000-000000001305",
    conversationId: "00000000-0000-4000-8000-000000001505",
    messageId: "00000000-0000-4000-8000-000000001405",
    workoutTemplateId: ids.strengthTemplate,
    workoutName: "Lower Strength + Push",
    goal: "baseline habits and back-friendly strength",
    weight: 74.6,
    waist: 83,
    pushups: 18,
    offset: 5,
  },
];

function sqlString(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function sqlJson(value) {
  return `${sqlString(JSON.stringify(value))}::jsonb`;
}

async function pgQuery(query) {
  const response = await fetch(`${apiUrl}/pg/query`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query }),
  });

  if (!response.ok) {
    throw new Error(`pg/query failed: ${await response.text()}`);
  }

  return response.json();
}

async function getUserId(email) {
  const rows = await pgQuery(
    `select id::text as id from auth.users where email = ${sqlString(email)} limit 1;`,
  );
  if (!rows[0]?.id) {
    throw new Error(`Missing local user ${email}. Run npm run seed:local:pt-demo first.`);
  }
  return rows[0].id;
}

const ptUserId = await getUserId("demo.pt@repsync.test");

const clientUserIds = new Map();
for (const client of clients) {
  clientUserIds.set(client.id, await getUserId(client.email));
}

const clientIdList = clients.map((client) => `'${client.id}'::uuid`).join(", ");
const workoutIdList = clients.map((client) => `'${client.workoutId}'::uuid`).join(", ");
const nutritionIdList = clients.map((client) => `'${client.nutritionId}'::uuid`).join(", ");
const baselineIdList = clients.map((client) => `'${client.baselineId}'::uuid`).join(", ");
const conversationIdList = clients
  .filter((client) => client.conversationId !== "00000000-0000-4000-8000-000000000501")
  .map((client) => `'${client.conversationId}'::uuid`)
  .join(", ");

const onboardingValues = clients
  .map((client) => {
    return `(
      '${ids.workspace}'::uuid,
      '${client.id}'::uuid,
      'direct_invite',
      'completed',
      ${sqlJson({ trainingAge: "seeded onboarding complete", equipment: "full gym", availability: "3-4 sessions weekly" })},
      ${sqlJson({ primary: client.goal, target: "first four-week coaching block" })},
      ${sqlJson({ frequency: "3 strength/conditioning sessions", recentBlock: "baseline build" })},
      ${sqlJson({ notes: "No blockers requiring medical referral. Adjust volume from check-ins." })},
      ${sqlJson({ calories: "assigned", protein: "assigned", mealPrep: "twice weekly" })},
      ${sqlJson({ basics: "complete", goals: "complete", training: "complete", review: "complete" })},
      '${client.baselineId}'::uuid,
      'Onboarding reviewed and activated. First training, nutrition, baseline, and check-in assignments are ready.',
      null,
      null,
      '${ids.checkinTemplate}'::uuid,
      current_date - extract(dow from current_date)::int + 6,
      now() - interval '${client.offset} hours',
      '${ptUserId}'::uuid,
      now() - interval '${client.offset + 12} hours',
      now() - interval '${client.offset + 11} hours',
      now() - interval '${client.offset + 10} hours',
      now() - interval '${client.offset + 9} hours'
    )`;
  })
  .join(",\n");

const workoutValues = clients
  .map((client) => {
    return `(
      '${client.workoutId}'::uuid,
      '${client.id}'::uuid,
      '${client.workoutTemplateId}'::uuid,
      current_date + interval '${client.offset} days',
      'planned',
      'workout',
      ${sqlString(`First active block for ${client.name}: keep execution clean and log notes after the session.`)},
      ${sqlString(client.workoutName)}
    )`;
  })
  .join(",\n");

const nutritionValues = clients
  .map((client) => {
    return `(
      '${client.nutritionId}'::uuid,
      '${client.id}'::uuid,
      '${ids.nutritionTemplate}'::uuid,
      current_date,
      current_date + interval '27 days',
      'active'
    )`;
  })
  .join(",\n");

const baselineValues = clients
  .map((client) => {
    return `(
      '${client.baselineId}'::uuid,
      '${client.id}'::uuid,
      '${ids.workspace}'::uuid,
      'submitted',
      ${sqlString(`Baseline completed for ${client.goal}.`)},
      'Reviewed during onboarding completion pass.',
      now() - interval '${client.offset + 8} hours'
    )`;
  })
  .join(",\n");

const baselineMetricsValues = clients
  .map((client) => {
    return `(
      '${client.baselineId}'::uuid,
      ${client.weight},
      170,
      24,
      ${Math.round((client.weight * 0.76) * 10) / 10},
      ${client.waist},
      92,
      98,
      55,
      29,
      60,
      42
    )`;
  })
  .join(",\n");

const markerTemplateValues = clients
  .flatMap((client) => [
    `('${client.baselineId}'::uuid, '${ids.waistMarker}'::uuid)`,
    `('${client.baselineId}'::uuid, '${ids.pushupMarker}'::uuid)`,
  ])
  .join(",\n");

const markerValueValues = clients
  .flatMap((client) => [
    `('${client.baselineId}'::uuid, '${ids.waistMarker}'::uuid, ${client.waist}, null)`,
    `('${client.baselineId}'::uuid, '${ids.pushupMarker}'::uuid, ${client.pushups}, null)`,
  ])
  .join(",\n");

const conversationValues = clients
  .map((client) => {
    return `(
      '${client.conversationId}'::uuid,
      '${client.id}'::uuid,
      '${ids.workspace}'::uuid,
      now() - interval '${client.offset} minutes',
      ${sqlString(`Onboarding complete. Your first assignments are ready, ${client.name.split(" ")[0]}.`)},
      'Nadia Mercer',
      'pt'
    )`;
  })
  .join(",\n");

await pgQuery(`
  select set_config('request.jwt.claim.role', 'authenticated', true);
  select set_config('request.jwt.claim.sub', '${ptUserId}', true);

  delete from public.assigned_workout_exercises
  where assigned_workout_id in (${workoutIdList});

  delete from public.assigned_workouts
  where id in (${workoutIdList});

  delete from public.assigned_workout_exercises
  where assigned_workout_id in (
    select id
    from public.assigned_workouts
    where client_id in (${clientIdList})
      and scheduled_date between current_date and current_date + interval '7 days'
      and workout_template_id in ('${ids.strengthTemplate}'::uuid, '${ids.conditioningTemplate}'::uuid)
  );

  delete from public.assigned_workouts
  where client_id in (${clientIdList})
    and scheduled_date between current_date and current_date + interval '7 days'
    and workout_template_id in ('${ids.strengthTemplate}'::uuid, '${ids.conditioningTemplate}'::uuid);

  delete from public.assigned_nutrition_plans
  where id in (${nutritionIdList});

  delete from public.baseline_marker_values
  where baseline_id in (${baselineIdList});

  delete from public.baseline_entry_marker_templates
  where baseline_id in (${baselineIdList});

  delete from public.baseline_metrics
  where baseline_id in (${baselineIdList});

  update public.workspace_client_onboardings
  set initial_baseline_entry_id = null
  where workspace_id = '${ids.workspace}'::uuid
    and initial_baseline_entry_id in (${baselineIdList});

  delete from public.baseline_entries
  where id in (${baselineIdList});

  ${conversationIdList ? `delete from public.conversations where id in (${conversationIdList});` : ""}

  insert into public.baseline_entries (
    id,
    client_id,
    workspace_id,
    status,
    client_notes,
    coach_notes,
    submitted_at
  )
  values ${baselineValues}
  on conflict (id) do update
    set status = excluded.status,
        client_notes = excluded.client_notes,
        coach_notes = excluded.coach_notes,
        submitted_at = excluded.submitted_at,
        updated_at = now();

  insert into public.baseline_metrics (
    baseline_id,
    weight_kg,
    height_cm,
    body_fat_pct,
    lean_mass_kg,
    waist_cm,
    chest_cm,
    hips_cm,
    thigh_cm,
    arm_cm,
    resting_hr,
    vo2max
  )
  values ${baselineMetricsValues}
  on conflict (baseline_id) do update
    set weight_kg = excluded.weight_kg,
        height_cm = excluded.height_cm,
        body_fat_pct = excluded.body_fat_pct,
        lean_mass_kg = excluded.lean_mass_kg,
        waist_cm = excluded.waist_cm,
        chest_cm = excluded.chest_cm,
        hips_cm = excluded.hips_cm,
        thigh_cm = excluded.thigh_cm,
        arm_cm = excluded.arm_cm,
        resting_hr = excluded.resting_hr,
        vo2max = excluded.vo2max,
        updated_at = now();

  insert into public.baseline_entry_marker_templates (baseline_id, template_id)
  values ${markerTemplateValues}
  on conflict (baseline_id, template_id) do nothing;

  insert into public.baseline_marker_values (
    baseline_id,
    template_id,
    value_number,
    value_text
  )
  values ${markerValueValues}
  on conflict (baseline_id, template_id) do update
    set value_number = excluded.value_number,
        value_text = excluded.value_text,
        updated_at = now();

  insert into public.workspace_client_onboardings (
    workspace_id,
    client_id,
    source,
    status,
    basics,
    goals,
    training_history,
    injuries_limitations,
    nutrition_lifestyle,
    step_state,
    initial_baseline_entry_id,
    coach_review_notes,
    first_program_template_id,
    first_program_applied_at,
    first_checkin_template_id,
    first_checkin_date,
    first_checkin_scheduled_at,
    reviewed_by_user_id,
    submitted_at,
    reviewed_at,
    activated_at,
    completed_at
  )
  values ${onboardingValues}
  on conflict (workspace_id, client_id) do update
    set source = excluded.source,
        status = excluded.status,
        basics = excluded.basics,
        goals = excluded.goals,
        training_history = excluded.training_history,
        injuries_limitations = excluded.injuries_limitations,
        nutrition_lifestyle = excluded.nutrition_lifestyle,
        step_state = excluded.step_state,
        initial_baseline_entry_id = excluded.initial_baseline_entry_id,
        coach_review_notes = excluded.coach_review_notes,
        first_checkin_template_id = excluded.first_checkin_template_id,
        first_checkin_date = excluded.first_checkin_date,
        first_checkin_scheduled_at = excluded.first_checkin_scheduled_at,
        reviewed_by_user_id = excluded.reviewed_by_user_id,
        submitted_at = excluded.submitted_at,
        reviewed_at = excluded.reviewed_at,
        activated_at = excluded.activated_at,
        completed_at = excluded.completed_at,
        updated_at = now();

  update public.clients
  set lifecycle_state = 'active',
      relationship_status = 'active',
      status = 'active',
      account_onboarding_completed_at = coalesce(account_onboarding_completed_at, now()),
      checkin_template_id = '${ids.checkinTemplate}'::uuid,
      checkin_frequency = 'weekly',
      checkin_start_date = current_date - extract(dow from current_date)::int + 6,
      lifecycle_changed_at = now(),
      updated_at = now()
  where id in (${clientIdList});

  insert into public.assigned_workouts (
    id,
    client_id,
    workout_template_id,
    scheduled_date,
    status,
    day_type,
    coach_note,
    workout_name
  )
  values ${workoutValues};

  insert into public.assigned_nutrition_plans (
    id,
    client_id,
    nutrition_template_id,
    start_date,
    end_date,
    status
  )
  values ${nutritionValues}
  on conflict (id) do update
    set nutrition_template_id = excluded.nutrition_template_id,
        start_date = excluded.start_date,
        end_date = excluded.end_date,
        status = excluded.status,
        updated_at = now();

  insert into public.conversations (
    id,
    client_id,
    workspace_id,
    last_message_at,
    last_message_preview,
    last_message_sender_name,
    last_message_sender_role
  )
  values ${conversationValues}
  on conflict (id) do update
    set last_message_at = excluded.last_message_at,
        last_message_preview = excluded.last_message_preview,
        last_message_sender_name = excluded.last_message_sender_name,
        last_message_sender_role = excluded.last_message_sender_role,
        updated_at = now();

`);

const summary = await pgQuery(`
  with workspace_clients as (
    select c.id, c.lifecycle_state
    from public.clients c
    where c.workspace_id = '${ids.workspace}'::uuid
  )
  select
    (select count(*)
     from public.workspace_client_onboardings wco
     join workspace_clients wc on wc.id = wco.client_id
     where wco.workspace_id = '${ids.workspace}'::uuid
       and wco.status = 'completed') as completed_onboardings,
    (select count(*)
     from workspace_clients wc
     where wc.lifecycle_state = 'active') as active_clients,
    (select count(distinct aw.client_id)
     from public.assigned_workouts aw
     join workspace_clients wc on wc.id = aw.client_id) as clients_with_workouts,
    (select count(distinct anp.client_id)
     from public.assigned_nutrition_plans anp
     join workspace_clients wc on wc.id = anp.client_id) as clients_with_nutrition,
    (select count(distinct be.client_id)
     from public.baseline_entries be
     join workspace_clients wc on wc.id = be.client_id) as clients_with_baselines,
    (select count(distinct ci.client_id)
     from public.checkins ci
     join workspace_clients wc on wc.id = ci.client_id) as clients_with_checkins;
`);

console.log("Completed all local client onboarding and assignments:", summary[0]);

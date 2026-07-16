const apiUrl = process.env.E2E_SUPABASE_API_URL || "http://127.0.0.1:54321";

const ids = {
  workspace: "00000000-0000-4000-8000-000000000001",
  zoe: "00000000-0000-4000-8000-000000000101",
  marcus: "00000000-0000-4000-8000-000000000102",
  strengthTemplate: "00000000-0000-4000-8000-000000000201",
  conditioningTemplate: "00000000-0000-4000-8000-000000000202",
  nutritionTemplate: "00000000-0000-4000-8000-000000000301",
  nutritionThu: "00000000-0000-4000-8000-000000000303",
  conversation: "00000000-0000-4000-8000-000000000501",
  checkinTemplate: "00000000-0000-4000-8000-000000000401",
  checkinMoodQuestion: "00000000-0000-4000-8000-000000000402",
  checkinWinQuestion: "00000000-0000-4000-8000-000000000403",
  futureWorkout: "00000000-0000-4000-8000-000000000951",
  clientWorkout: "00000000-0000-4000-8000-000000000952",
  activeNutrition: "00000000-0000-4000-8000-000000000953",
  freshCheckin: "00000000-0000-4000-8000-000000000954",
  marcusWorkout: "00000000-0000-4000-8000-000000000955",
};

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
const zoeUserId = await getUserId("zoe.ramirez@repsync.test");

await pgQuery(`
  select set_config('request.jwt.claim.role', 'authenticated', true);
  select set_config('request.jwt.claim.sub', '${ptUserId}', true);

  delete from public.messages
  where id in (
    '00000000-0000-4000-8000-000000000561'::uuid,
    '00000000-0000-4000-8000-000000000562'::uuid,
    '00000000-0000-4000-8000-000000000563'::uuid,
    '00000000-0000-4000-8000-000000000564'::uuid
  );

  delete from public.assigned_workout_exercises
  where assigned_workout_id in (
    '${ids.futureWorkout}'::uuid,
    '${ids.clientWorkout}'::uuid,
    '${ids.marcusWorkout}'::uuid
  );

  delete from public.workout_logs
  where id in (
    '00000000-0000-4000-8000-000000000956'::uuid,
    '00000000-0000-4000-8000-000000000957'::uuid
  );

  delete from public.assigned_workouts
  where id in (
    '${ids.futureWorkout}'::uuid,
    '${ids.clientWorkout}'::uuid,
    '${ids.marcusWorkout}'::uuid
  );

  delete from public.assigned_workout_exercises
  where assigned_workout_id in (
    select id
    from public.assigned_workouts
    where (client_id, scheduled_date, workout_template_id) in (
      ('${ids.zoe}'::uuid, current_date + interval '4 days', '${ids.conditioningTemplate}'::uuid),
      ('${ids.marcus}'::uuid, current_date + interval '1 day', '${ids.strengthTemplate}'::uuid)
    )
  );

  delete from public.assigned_workouts
  where (client_id, scheduled_date, workout_template_id) in (
    ('${ids.zoe}'::uuid, current_date + interval '4 days', '${ids.conditioningTemplate}'::uuid),
    ('${ids.marcus}'::uuid, current_date + interval '1 day', '${ids.strengthTemplate}'::uuid)
  );

  delete from public.assigned_nutrition_plans
  where id = '${ids.activeNutrition}'::uuid;

  delete from public.nutrition_template_meals
  where nutrition_template_day_id = '${ids.nutritionThu}'::uuid;

  delete from public.nutrition_template_days
  where id = '${ids.nutritionThu}'::uuid;

  delete from public.checkin_answers
  where checkin_id = '${ids.freshCheckin}'::uuid;

  delete from public.checkin_photos
  where checkin_id = '${ids.freshCheckin}'::uuid;

  delete from public.checkins
  where id = '${ids.freshCheckin}'::uuid;

  delete from public.checkin_answers
  where checkin_id in (
    select id
    from public.checkins
    where client_id = '${ids.zoe}'::uuid
      and week_ending_saturday = public.normalize_checkin_due_date(current_date - extract(dow from current_date)::int + 13)
  );

  delete from public.checkin_photos
  where checkin_id in (
    select id
    from public.checkins
    where client_id = '${ids.zoe}'::uuid
      and week_ending_saturday = public.normalize_checkin_due_date(current_date - extract(dow from current_date)::int + 13)
  );

  delete from public.checkins
  where client_id = '${ids.zoe}'::uuid
    and week_ending_saturday = public.normalize_checkin_due_date(current_date - extract(dow from current_date)::int + 13);

  delete from public.habit_logs
  where client_id = '${ids.zoe}'::uuid
    and log_date in (current_date, current_date - interval '1 day');

  delete from public.coach_activity_log
  where id in (
    '00000000-0000-4000-8000-000000000971'::uuid,
    '00000000-0000-4000-8000-000000000972'::uuid,
    '00000000-0000-4000-8000-000000000973'::uuid
  );

  delete from public.notification_events
  where idempotency_key like 'demo-active-%';

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
  values
    (
      '${ids.futureWorkout}'::uuid,
      '${ids.zoe}'::uuid,
      '${ids.conditioningTemplate}'::uuid,
      current_date + interval '4 days',
      'planned',
      'workout',
      'Keep this as controlled repeatable intervals. Stop if calf tightness climbs above 3/10.',
      'Zone 4 Bike Intervals'
    ),
    (
      '${ids.marcusWorkout}'::uuid,
      '${ids.marcus}'::uuid,
      '${ids.strengthTemplate}'::uuid,
      current_date + interval '1 day',
      'planned',
      'workout',
      'Shoulder-friendly pressing. No grinding reps.',
      'Lower Strength + Push'
    );

  update public.assigned_workouts
  set status = 'completed',
      completed_at = now() - interval '28 minutes'
  where id = '00000000-0000-4000-8000-000000000901'::uuid;

  insert into public.nutrition_template_days (
    id,
    nutrition_template_id,
    week_index,
    day_of_week,
    title,
    notes
  )
  values (
    '${ids.nutritionThu}'::uuid,
    '${ids.nutritionTemplate}'::uuid,
    1,
    extract(dow from current_date)::int,
    'Today - training day',
    'Fuel the completed strength day and keep dinner lighter.'
  );

  insert into public.nutrition_template_meals (
    nutrition_template_day_id,
    meal_order,
    meal_name,
    recipe_text,
    calories,
    protein_g,
    carbs_g,
    fat_g,
    notes
  )
  values
    ('${ids.nutritionThu}'::uuid, 10, 'Pre-workout breakfast', 'Egg white wrap, berries, coffee, and water.', 430, 38, 48, 9, 'Eat 90 minutes before lifting.'),
    ('${ids.nutritionThu}'::uuid, 20, 'Post-workout lunch', 'Chicken shawarma bowl with rice, salad, and yogurt sauce.', 680, 54, 82, 14, 'Keep sauce measured.'),
    ('${ids.nutritionThu}'::uuid, 30, 'Dinner', 'Cod, potatoes, cucumber salad, and olive oil.', 590, 46, 56, 18, 'Add fruit if steps exceed 10k.');

  insert into public.assigned_nutrition_plans (
    id,
    client_id,
    nutrition_template_id,
    start_date,
    end_date,
    status
  )
  values (
    '${ids.activeNutrition}'::uuid,
    '${ids.zoe}'::uuid,
    '${ids.nutritionTemplate}'::uuid,
    current_date,
    current_date + interval '27 days',
    'active'
  );

  insert into public.habit_logs (
    client_id,
    log_date,
    calories,
    protein_g,
    carbs_g,
    fats_g,
    weight_value,
    weight_unit,
    sleep_hours,
    steps,
    energy,
    hunger,
    stress,
    notes
  )
  values
    (
      '${ids.zoe}'::uuid,
      current_date,
      2075,
      142,
      224,
      57,
      67.8,
      'kg',
      7.2,
      11840,
      8,
      4,
      4,
      'Logged after completed strength session. Calf prep helped.'
    ),
    (
      '${ids.zoe}'::uuid,
      current_date - interval '1 day',
      2020,
      136,
      205,
      61,
      68.0,
      'kg',
      6.9,
      9460,
      7,
      5,
      5,
      'Busy work day but hit protein and steps.'
    );

  insert into public.coach_activity_log (
    id,
    workspace_id,
    client_id,
    actor_user_id,
    action,
    metadata,
    created_at
  )
  values
    (
      '00000000-0000-4000-8000-000000000971'::uuid,
      '${ids.workspace}'::uuid,
      '${ids.zoe}'::uuid,
      '${ptUserId}'::uuid,
      'pt_note',
      ${sqlJson({
        title: "Calf management",
        body: "Client reported calf tightness. Added warm-up prep and capped intensity on next intervals.",
      })},
      now() - interval '12 minutes'
    ),
    (
      '00000000-0000-4000-8000-000000000972'::uuid,
      '${ids.workspace}'::uuid,
      '${ids.zoe}'::uuid,
      '${ptUserId}'::uuid,
      'workout_assigned',
      ${sqlJson({ workout: "Zone 4 Bike Intervals", date: "next block" })},
      now() - interval '10 minutes'
    ),
    (
      '00000000-0000-4000-8000-000000000973'::uuid,
      '${ids.workspace}'::uuid,
      '${ids.marcus}'::uuid,
      '${ptUserId}'::uuid,
      'workout_assigned',
      ${sqlJson({ workout: "Lower Strength + Push", client: "Marcus Chen" })},
      now() - interval '7 minutes'
    );

  insert into public.checkins (
    id,
    client_id,
    template_id,
    week_ending_saturday,
    submitted_at,
    pt_feedback,
    reviewed_at,
    reviewed_by_user_id
  )
  values (
    '${ids.freshCheckin}'::uuid,
    '${ids.zoe}'::uuid,
    '${ids.checkinTemplate}'::uuid,
    current_date - extract(dow from current_date)::int + 13,
    null,
    null,
    null,
    null
  );

  insert into public.checkin_answers (
    checkin_id,
    question_id,
    value_text,
    value_number
  )
  values
    ('${ids.freshCheckin}'::uuid, '${ids.checkinMoodQuestion}'::uuid, null, 9),
    ('${ids.freshCheckin}'::uuid, '${ids.checkinWinQuestion}'::uuid, 'Completed the strength session and stayed under the calf tightness cap. Nutrition was easier with the updated plan.', null);

  insert into public.checkin_photos (
    checkin_id,
    client_id,
    url,
    storage_path,
    photo_type
  )
  values
    ('${ids.freshCheckin}'::uuid, '${ids.zoe}'::uuid, 'https://images.unsplash.com/photo-1517836357463-d25dfeac3438?w=900', '${ids.zoe}/${ids.freshCheckin}/front.jpg', 'front'),
    ('${ids.freshCheckin}'::uuid, '${ids.zoe}'::uuid, 'https://images.unsplash.com/photo-1518611012118-696072aa579a?w=900', '${ids.zoe}/${ids.freshCheckin}/side.jpg', 'side'),
    ('${ids.freshCheckin}'::uuid, '${ids.zoe}'::uuid, 'https://images.unsplash.com/photo-1517960413843-0aee8e2b3285?w=900', '${ids.zoe}/${ids.freshCheckin}/back.jpg', 'back');

  update public.checkins
  set submitted_at = now() - interval '6 minutes'
  where id = '${ids.freshCheckin}'::uuid;

  update public.checkins
  set pt_feedback = 'Great response this week. Strength is complete, nutrition is on target, and we will keep conditioning controlled until the calf is quiet for 72 hours.',
      reviewed_at = now() - interval '2 minutes',
      reviewed_by_user_id = '${ptUserId}'::uuid
  where id = '${ids.freshCheckin}'::uuid;

  insert into public.notification_events (
    recipient_user_id,
    actor_type,
    type,
    title,
    body,
    action_url,
    entity_type,
    entity_id,
    metadata,
    transactional,
    idempotency_key,
    notification_class,
    category,
    priority,
    action_label
  )
  values
    (
      '${ptUserId}'::uuid,
      'client',
      'checkin_submitted',
      'Zoe submitted a fresh check-in',
      'Recovery is 9/10 and the latest strength session is complete.',
      '/pt/clients/${ids.zoe}?tab=checkins',
      'checkin',
      '${ids.freshCheckin}',
      ${sqlJson({ clientId: ids.zoe })},
      false,
      'demo-active-pt-checkin',
      'product',
      'checkins',
      'high',
      'Review'
    ),
    (
      '${zoeUserId}'::uuid,
      'pt',
      'checkin_reviewed',
      'Nadia reviewed your check-in',
      'Great response this week. Keep conditioning controlled until the calf is quiet.',
      '/app/checkin',
      'checkin',
      '${ids.freshCheckin}',
      ${sqlJson({ clientId: ids.zoe })},
      false,
      'demo-active-client-review',
      'product',
      'checkins',
      'normal',
      'Open check-in'
    );
`);

await pgQuery(`
  select set_config('request.jwt.claim.role', 'authenticated', true);
  select set_config('request.jwt.claim.sub', '${ptUserId}', true);

  insert into public.messages (
    id,
    conversation_id,
    sender_user_id,
    body,
    sender_role,
    sender_name,
    preview,
    unread,
    workspace_id,
    created_at
  )
  values
    (
      '00000000-0000-4000-8000-000000000561'::uuid,
      '${ids.conversation}'::uuid,
      '${ptUserId}'::uuid,
      'I marked today completed and added the next interval session with a calf cap. Your nutrition plan is updated for today too.',
      'pt',
      'Nadia Mercer',
      'I marked today completed and added the next interval session.',
      false,
      '${ids.workspace}'::uuid,
      now() - interval '9 minutes'
    );

  select set_config('request.jwt.claim.sub', '${zoeUserId}', true);

  insert into public.messages (
    id,
    conversation_id,
    sender_user_id,
    body,
    sender_role,
    sender_name,
    preview,
    unread,
    workspace_id,
    created_at
  )
  values
    (
      '00000000-0000-4000-8000-000000000562'::uuid,
      '${ids.conversation}'::uuid,
      '${zoeUserId}'::uuid,
      'Perfect. I completed the strength session, logged habits, and submitted the check-in.',
      'client',
      'Zoe Ramirez',
      'Perfect. I completed the strength session, logged habits, and submitted the check-in.',
      true,
      '${ids.workspace}'::uuid,
      now() - interval '5 minutes'
    );

  select set_config('request.jwt.claim.sub', '${ptUserId}', true);

  insert into public.messages (
    id,
    conversation_id,
    sender_user_id,
    body,
    sender_role,
    sender_name,
    preview,
    unread,
    workspace_id,
    created_at
  )
  values
    (
      '00000000-0000-4000-8000-000000000563'::uuid,
      '${ids.conversation}'::uuid,
      '${ptUserId}'::uuid,
      'Saw it. Great work. Take the easy run tomorrow and keep calf prep in the warm-up.',
      'pt',
      'Nadia Mercer',
      'Saw it. Great work. Take the easy run tomorrow.',
      false,
      '${ids.workspace}'::uuid,
      now() - interval '3 minutes'
    );

  update public.conversations
  set last_message_id = '00000000-0000-4000-8000-000000000563'::uuid,
      last_message_at = now() - interval '3 minutes',
      last_message_preview = 'Saw it. Great work. Take the easy run tomorrow.',
      last_message_sender_name = 'Nadia Mercer',
      last_message_sender_role = 'pt',
      updated_at = now()
  where id = '${ids.conversation}'::uuid;
`);

const summary = await pgQuery(`
  select
    (select count(*) from public.messages where conversation_id = '${ids.conversation}'::uuid) as thread_messages,
    (select count(*) from public.assigned_workouts where client_id = '${ids.zoe}'::uuid) as zoe_workouts,
    (select count(*) from public.assigned_nutrition_plans where client_id = '${ids.zoe}'::uuid and status = 'active') as active_nutrition,
    (select count(*) from public.habit_logs where client_id = '${ids.zoe}'::uuid) as habit_logs,
    (select count(*) from public.checkins where client_id = '${ids.zoe}'::uuid and submitted_at is not null) as submitted_checkins;
`);

console.log("Simulated active PT/client usage:", summary[0]);

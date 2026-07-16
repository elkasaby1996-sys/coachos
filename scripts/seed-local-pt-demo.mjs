import { createClient } from "@supabase/supabase-js";

const apiUrl = process.env.E2E_SUPABASE_API_URL || "http://127.0.0.1:54321";
const serviceRoleKey =
  process.env.E2E_SUPABASE_SERVICE_ROLE_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

const demo = {
  pt: {
    email: "demo.pt@repsync.test",
    password: "DemoPass123!",
    fullName: "Nadia Mercer",
  },
  clients: [
    {
      id: "00000000-0000-4000-8000-000000000101",
      email: "zoe.ramirez@repsync.test",
      password: "DemoPass123!",
      fullName: "Zoe Ramirez",
      status: "active",
      goal: "Build strength while dropping 6 kg for a spring half marathon.",
      tags: ["Hybrid", "High adherence", "Check-in due"],
      weight: 68.4,
      city: "Doha",
      phone: "+974 5500 1101",
    },
    {
      id: "00000000-0000-4000-8000-000000000102",
      email: "marcus.chen@repsync.test",
      password: "DemoPass123!",
      fullName: "Marcus Chen",
      status: "active",
      goal: "Add lean mass and keep shoulder pain under control.",
      tags: ["Muscle gain", "Shoulder history"],
      weight: 82.1,
      city: "Doha",
      phone: "+974 5500 1102",
    },
    {
      id: "00000000-0000-4000-8000-000000000103",
      email: "layla.khan@repsync.test",
      password: "DemoPass123!",
      fullName: "Layla Khan",
      status: "active",
      goal: "Return to consistent training after travel-heavy work months.",
      tags: ["Lifestyle", "Travel"],
      weight: 61.8,
      city: "Dubai",
      phone: "+971 5500 1103",
    },
    {
      id: "00000000-0000-4000-8000-000000000104",
      email: "ethan.brooks@repsync.test",
      password: "DemoPass123!",
      fullName: "Ethan Brooks",
      status: "active",
      goal: "Improve conditioning and hit a 140 kg deadlift.",
      tags: ["Strength", "Conditioning"],
      weight: 90.2,
      city: "Riyadh",
      phone: "+966 5500 1104",
    },
    {
      id: "00000000-0000-4000-8000-000000000105",
      email: "amina.saleh@repsync.test",
      password: "DemoPass123!",
      fullName: "Amina Saleh",
      status: "active",
      goal: "Rebuild baseline habits and reduce back tightness.",
      tags: ["Mobility", "New client"],
      weight: 74.6,
      city: "Manama",
      phone: "+973 5500 1105",
    },
  ],
};

const ids = {
  workspace: "00000000-0000-4000-8000-000000000001",
  strengthTemplate: "00000000-0000-4000-8000-000000000201",
  conditioningTemplate: "00000000-0000-4000-8000-000000000202",
  nutritionTemplate: "00000000-0000-4000-8000-000000000301",
  nutritionDay: "00000000-0000-4000-8000-000000000302",
  checkinTemplate: "00000000-0000-4000-8000-000000000401",
  checkinMoodQuestion: "00000000-0000-4000-8000-000000000402",
  checkinWinQuestion: "00000000-0000-4000-8000-000000000403",
  conversation: "00000000-0000-4000-8000-000000000501",
  baseline: "00000000-0000-4000-8000-000000000601",
  waistMarker: "00000000-0000-4000-8000-000000000602",
  pushupMarker: "00000000-0000-4000-8000-000000000603",
  packageHybrid: "00000000-0000-4000-8000-000000000701",
  packageStrength: "00000000-0000-4000-8000-000000000702",
};

function sqlString(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function sqlArray(values) {
  return `array[${values.map(sqlString).join(", ")}]::text[]`;
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

const admin = createClient(apiUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

async function userIdByEmail(email) {
  const rows = await pgQuery(
    `select id::text as id from auth.users where email = ${sqlString(email)} limit 1;`,
  );
  return rows[0]?.id ?? null;
}

async function ensureUser({ email, password, fullName }) {
  const existingId = await userIdByEmail(email);
  const userData = {
    email,
    password,
    email_confirm: true,
    user_metadata: {
      full_name: fullName,
      name: fullName,
    },
  };

  if (existingId) {
    const { error } = await admin.auth.admin.updateUserById(
      existingId,
      userData,
    );
    if (error) throw error;
    return existingId;
  }

  const { data, error } = await admin.auth.admin.createUser(userData);
  if (error) throw error;
  return data.user.id;
}

function clientRows(clientsById) {
  return demo.clients
    .map((client) => {
      const userId = clientsById.get(client.id);
      return `(
        '${client.id}'::uuid,
        '${ids.workspace}'::uuid,
        '${userId}'::uuid,
        '${client.status}',
        ${sqlString(client.fullName)},
        ${sqlString(client.fullName)},
        ${sqlString(client.email)},
        ${sqlString(client.phone)},
        ${sqlString(client.city)},
        'Asia/Qatar',
        'metric',
        ${sqlString(client.goal)},
        ${sqlArray(client.tags)},
        170,
        '1992-04-12',
        'female',
        ${client.weight},
        ${client.weight},
        'kg',
        'active',
        now(),
        now(),
        '${ids.checkinTemplate}'::uuid,
        'weekly',
        current_date - extract(dow from current_date)::int + 6 - interval '21 days',
        now()
      )`;
    })
    .join(",\n");
}

async function main() {
  const ptUserId = await ensureUser(demo.pt);
  const clientUserIds = new Map();
  for (const client of demo.clients) {
    clientUserIds.set(client.id, await ensureUser(client));
  }

  const [zoe, marcus, layla, ethan, amina] = demo.clients;
  const zoeUserId = clientUserIds.get(zoe.id);

  await pgQuery(`
    select set_config('request.jwt.claim.sub', '${ptUserId}', true);
    select set_config('request.jwt.claim.role', 'authenticated', true);

    delete from public.notification_events
    where idempotency_key like 'demo-pt-%'
       or recipient_user_id in ('${ptUserId}'::uuid, '${zoeUserId}'::uuid);

    delete from public.messages
    where workspace_id = '${ids.workspace}'::uuid;

    delete from public.conversations
    where workspace_id = '${ids.workspace}'::uuid;

    delete from public.checkin_answers
    where checkin_id in (select id from public.checkins where client_id = any(array[${demo.clients.map((client) => `'${client.id}'::uuid`).join(", ")}]));

    delete from public.checkin_photos
    where client_id = any(array[${demo.clients.map((client) => `'${client.id}'::uuid`).join(", ")}]);

    delete from public.checkins
    where client_id = any(array[${demo.clients.map((client) => `'${client.id}'::uuid`).join(", ")}]);

    delete from public.checkin_questions
    where template_id = '${ids.checkinTemplate}'::uuid;

    delete from public.checkin_templates
    where workspace_id = '${ids.workspace}'::uuid;

    delete from public.workout_logs
    where client_id = any(array[${demo.clients.map((client) => `'${client.id}'::uuid`).join(", ")}]);

    delete from public.assigned_workout_exercises
    where assigned_workout_id in (select id from public.assigned_workouts where client_id = any(array[${demo.clients.map((client) => `'${client.id}'::uuid`).join(", ")}]));

    delete from public.assigned_workouts
    where client_id = any(array[${demo.clients.map((client) => `'${client.id}'::uuid`).join(", ")}]);

    delete from public.assigned_nutrition_plans
    where client_id = any(array[${demo.clients.map((client) => `'${client.id}'::uuid`).join(", ")}]);

    delete from public.nutrition_template_meals
    where nutrition_template_day_id in (select id from public.nutrition_template_days where nutrition_template_id = '${ids.nutritionTemplate}'::uuid);

    delete from public.nutrition_template_days
    where nutrition_template_id = '${ids.nutritionTemplate}'::uuid;

    delete from public.nutrition_templates
    where workspace_id = '${ids.workspace}'::uuid;

    delete from public.workout_template_exercises
    where workout_template_id in ('${ids.strengthTemplate}'::uuid, '${ids.conditioningTemplate}'::uuid);

    delete from public.workout_templates
    where workspace_id = '${ids.workspace}'::uuid;

    delete from public.exercises
    where workspace_id = '${ids.workspace}'::uuid;

    delete from public.client_wearable_activities
    where workspace_id = '${ids.workspace}'::uuid;

    delete from public.client_wearable_health_scores
    where workspace_id = '${ids.workspace}'::uuid;

    delete from public.client_wearable_sleep_sessions
    where workspace_id = '${ids.workspace}'::uuid;

    delete from public.client_wearable_daily_metrics
    where workspace_id = '${ids.workspace}'::uuid;

    delete from public.client_wearable_connections
    where workspace_id = '${ids.workspace}'::uuid;

    delete from public.habit_logs
    where client_id = any(array[${demo.clients.map((client) => `'${client.id}'::uuid`).join(", ")}]);

    delete from public.baseline_photos
    where client_id = '${zoe.id}'::uuid;

    delete from public.baseline_marker_values
    where baseline_id = '${ids.baseline}'::uuid;

    delete from public.baseline_entry_marker_templates
    where baseline_id = '${ids.baseline}'::uuid;

    delete from public.baseline_metrics
    where baseline_id = '${ids.baseline}'::uuid;

    delete from public.baseline_entries
    where workspace_id = '${ids.workspace}'::uuid;

    delete from public.baseline_marker_templates
    where workspace_id = '${ids.workspace}'::uuid;

    delete from public.coach_activity_log
    where workspace_id = '${ids.workspace}'::uuid;

    delete from public.workspace_client_onboardings
    where workspace_id = '${ids.workspace}'::uuid;

    delete from public.pt_hub_leads
    where user_id = '${ptUserId}'::uuid;

    delete from public.pt_packages
    where pt_user_id = '${ptUserId}'::uuid;

    delete from public.clients
    where id = any(array[${demo.clients.map((client) => `'${client.id}'::uuid`).join(", ")}]);

    delete from public.pt_profiles
    where user_id = '${ptUserId}'::uuid;

    delete from public.workspace_members
    where workspace_id = '${ids.workspace}'::uuid;

    delete from public.workspaces
    where id = '${ids.workspace}'::uuid;

    insert into public.workspaces (
      id,
      name,
      owner_user_id,
      timezone,
      unit_preference,
      week_start_day,
      client_welcome_message,
      slug
    )
    values (
      '${ids.workspace}'::uuid,
      'Mercer Performance Lab',
      '${ptUserId}'::uuid,
      'Asia/Qatar',
      'metric',
      'monday',
      'Welcome in. Log training, check-ins, habits, and messages here so we can make decisions from real data.',
      'mercer-performance-lab'
    )
    on conflict (id) do update
      set name = excluded.name,
          owner_user_id = excluded.owner_user_id,
          timezone = excluded.timezone,
          unit_preference = excluded.unit_preference,
          week_start_day = excluded.week_start_day,
          client_welcome_message = excluded.client_welcome_message,
          slug = excluded.slug,
          updated_at = now();

    insert into public.workspace_members (
      workspace_id,
      user_id,
      role,
      status,
      client_access_mode,
      joined_at
    )
    values (
      '${ids.workspace}'::uuid,
      '${ptUserId}'::uuid,
      'pt_owner',
      'active',
      'all_clients',
      now()
    )
    on conflict (workspace_id, user_id) do update
      set role = excluded.role,
          status = excluded.status,
          client_access_mode = excluded.client_access_mode,
          joined_at = coalesce(public.workspace_members.joined_at, excluded.joined_at),
          updated_at = now();

    insert into public.pt_profiles (
      user_id,
      workspace_id,
      full_name,
      display_name,
      coach_business_name,
      headline,
      bio,
      phone,
      location_country,
      location_city,
      languages,
      specialties,
      starting_price,
      onboarding_completed_at,
      public_slug
    )
    values (
      '${ptUserId}'::uuid,
      '${ids.workspace}'::uuid,
      ${sqlString(demo.pt.fullName)},
      ${sqlString(demo.pt.fullName)},
      'Mercer Performance Lab',
      'Hybrid strength, conditioning, and habit coaching for busy professionals.',
      'Nadia runs a compact high-touch roster with weekly reviews, clear training blocks, and nutrition targets that clients can actually follow.',
      '+974 5500 2200',
      'Qatar',
      'Doha',
      array['English', 'Arabic']::text[],
      array['Strength', 'Body recomposition', 'Endurance hybrid', 'Habit coaching']::text[],
      250,
      now(),
      'nadia-mercer'
    );

    insert into public.checkin_templates (
      id,
      workspace_id,
      name,
      description,
      is_active
    )
    values (
      '${ids.checkinTemplate}'::uuid,
      '${ids.workspace}'::uuid,
      'Weekly Performance Review',
      'A concise weekly pulse covering training, recovery, nutrition, and blockers.',
      true
    );

    insert into public.checkin_questions (
      id,
      template_id,
      sort_order,
      type,
      prompt,
      options,
      question_text,
      is_required,
      position
    )
    values
      (
        '${ids.checkinMoodQuestion}'::uuid,
        '${ids.checkinTemplate}'::uuid,
        10,
        'scale',
        'How would you rate recovery this week?',
        array[]::text[],
        'How would you rate recovery this week?',
        true,
        10
      ),
      (
        '${ids.checkinWinQuestion}'::uuid,
        '${ids.checkinTemplate}'::uuid,
        20,
        'text',
        'Biggest win or blocker?',
        array[]::text[],
        'Biggest win or blocker?',
        true,
        20
      );

    update public.workspaces
    set default_checkin_template_id = '${ids.checkinTemplate}'::uuid
    where id = '${ids.workspace}'::uuid;

    insert into public.clients (
      id,
      workspace_id,
      user_id,
      status,
      display_name,
      full_name,
      email,
      phone,
      location,
      timezone,
      unit_preference,
      goal,
      tags,
      height_cm,
      date_of_birth,
      sex,
      current_weight,
      weight_value_current,
      weight_unit,
      lifecycle_state,
      lifecycle_changed_at,
      account_onboarding_completed_at,
      checkin_template_id,
      checkin_frequency,
      checkin_start_date,
      updated_at
    )
    values ${clientRows(clientUserIds)};

    delete from public.checkins
    where client_id = any(array[${demo.clients.map((client) => `'${client.id}'::uuid`).join(", ")}]);

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
      coach_review_notes,
      first_checkin_template_id,
      first_checkin_date,
      reviewed_by_user_id,
      submitted_at,
      reviewed_at,
      activated_at,
      completed_at
    )
    values
      (
        '${ids.workspace}'::uuid,
        '${zoe.id}'::uuid,
        'direct_invite',
        'completed',
        ${sqlJson({ trainingAge: "3 years", equipment: "Full gym + treadmill" })},
        ${sqlJson({ primary: "Lean down while keeping strength", target: "Half marathon in 14 weeks" })},
        ${sqlJson({ frequency: "4 strength + 2 run sessions", recentBlock: "Hypertrophy base" })},
        ${sqlJson({ notes: "Occasional left calf tightness after tempo runs" })},
        ${sqlJson({ calories: 2050, protein: 135, mealPrep: "Sun/Wed" })},
        ${sqlJson({ basics: "complete", goals: "complete", review: "complete" })},
        'Strong intake. Keep running volume conservative for two weeks and monitor calf response.',
        '${ids.checkinTemplate}'::uuid,
        current_date + interval '3 days',
        '${ptUserId}'::uuid,
        now() - interval '20 days',
        now() - interval '19 days',
        now() - interval '18 days',
        now() - interval '18 days'
      );

    insert into public.exercises (
      id,
      workspace_id,
      name,
      muscle_group,
      equipment,
      instructions,
      notes,
      cues,
      primary_muscle,
      secondary_muscles,
      is_unilateral,
      tags,
      category,
      owner_user_id,
      source
    )
    values
      ('00000000-0000-4000-8000-000000000801'::uuid, '${ids.workspace}'::uuid, 'Trap Bar Deadlift', 'Lower body', 'Trap bar', 'Drive through the floor and keep ribs stacked.', 'Use controlled eccentrics this block.', 'Brace, push, lock tall.', 'Glutes', array['Hamstrings', 'Back']::text[], false, array['strength', 'hinge']::text[], 'strength', '${ptUserId}'::uuid, 'manual'),
      ('00000000-0000-4000-8000-000000000802'::uuid, '${ids.workspace}'::uuid, 'Incline Dumbbell Press', 'Chest', 'Dumbbells', 'Lower to a comfortable depth with shoulder blades set.', 'Avoid shoulder pinch.', 'Elbows 45 degrees, smooth lockout.', 'Chest', array['Triceps', 'Front delts']::text[], false, array['upper', 'push']::text[], 'strength', '${ptUserId}'::uuid, 'manual'),
      ('00000000-0000-4000-8000-000000000803'::uuid, '${ids.workspace}'::uuid, 'Bike Intervals', 'Conditioning', 'Bike', 'Alternate hard and easy efforts.', 'Cap RPE at 8.', 'Fast legs, calm breathing.', 'Cardio', array[]::text[], false, array['conditioning']::text[], 'conditioning', '${ptUserId}'::uuid, 'manual');

    insert into public.workout_templates (id, workspace_id, name, description, workout_type, workout_type_tag)
    values
      ('${ids.strengthTemplate}'::uuid, '${ids.workspace}'::uuid, 'Lower Strength + Push', 'Main lift, upper push, and trunk finisher.', 'bodybuilding', 'strength'),
      ('${ids.conditioningTemplate}'::uuid, '${ids.workspace}'::uuid, 'Zone 4 Bike Intervals', 'Short conditioning session for aerobic power.', 'crossfit', 'conditioning');

    insert into public.workout_template_exercises (
      workout_template_id,
      exercise_id,
      sort_order,
      sets,
      reps,
      rest_seconds,
      tempo,
      rpe,
      notes
    )
    values
      ('${ids.strengthTemplate}'::uuid, '00000000-0000-4000-8000-000000000801'::uuid, 10, 4, '5', 150, '3-1-1', 8, 'Add 2.5 kg if bar speed stays clean.'),
      ('${ids.strengthTemplate}'::uuid, '00000000-0000-4000-8000-000000000802'::uuid, 20, 3, '8-10', 90, '2-0-1', 7, 'Stop one rep before shoulder compensation.'),
      ('${ids.conditioningTemplate}'::uuid, '00000000-0000-4000-8000-000000000803'::uuid, 10, 8, '45s hard / 75s easy', 75, null, 8, 'Keep hard intervals repeatable.');

    insert into public.assigned_workouts (
      id,
      client_id,
      workout_template_id,
      scheduled_date,
      status,
      completed_at,
      day_type,
      coach_note,
      workout_name
    )
    values
      ('00000000-0000-4000-8000-000000000901'::uuid, '${zoe.id}'::uuid, '${ids.strengthTemplate}'::uuid, current_date, 'planned', null, 'workout', 'Film set 3 deadlifts from the side.', 'Lower Strength + Push'),
      ('00000000-0000-4000-8000-000000000902'::uuid, '${zoe.id}'::uuid, '${ids.conditioningTemplate}'::uuid, current_date - interval '2 days', 'completed', now() - interval '2 days', 'workout', 'Great pacing last week. Repeat before progressing.', 'Zone 4 Bike Intervals'),
      ('00000000-0000-4000-8000-000000000903'::uuid, '${marcus.id}'::uuid, '${ids.strengthTemplate}'::uuid, current_date + interval '1 day', 'planned', null, 'workout', 'Keep pressing pain-free.', 'Upper Strength'),
      ('00000000-0000-4000-8000-000000000904'::uuid, '${layla.id}'::uuid, '${ids.conditioningTemplate}'::uuid, current_date, 'planned', null, 'workout', 'Travel week version.', 'Hotel Conditioning');

    insert into public.assigned_workout_exercises (
      assigned_workout_id,
      exercise_id,
      sort_order,
      sets,
      reps,
      rpe,
      tempo,
      notes,
      weight_value,
      weight_unit,
      is_completed,
      rest_seconds,
      set_order,
      set_number,
      default_weight_unit,
      default_weight_value
    )
    values
      ('00000000-0000-4000-8000-000000000901'::uuid, '00000000-0000-4000-8000-000000000801'::uuid, 10, 4, '5', 8, '3-1-1', 'Hold form before adding load.', 92.5, 'kg', false, 150, 10, 1, 'kg', 92.5),
      ('00000000-0000-4000-8000-000000000901'::uuid, '00000000-0000-4000-8000-000000000802'::uuid, 20, 3, '8-10', 7, '2-0-1', 'Smooth shoulder path.', 22.5, 'kg', false, 90, 20, 1, 'kg', 22.5),
      ('00000000-0000-4000-8000-000000000902'::uuid, '00000000-0000-4000-8000-000000000803'::uuid, 10, 8, '45s hard / 75s easy', 8, null, 'Completed with even output.', null, 'kg', true, 75, 10, 1, 'kg', null);

    insert into public.workout_logs (
      id,
      client_id,
      assigned_workout_id,
      workout_template_id,
      started_at,
      finished_at,
      status,
      title,
      notes
    )
    values (
      '00000000-0000-4000-8000-000000000911'::uuid,
      '${zoe.id}'::uuid,
      '00000000-0000-4000-8000-000000000902'::uuid,
      '${ids.conditioningTemplate}'::uuid,
      now() - interval '2 days 2 hours',
      now() - interval '2 days 1 hour',
      'completed',
      'Zone 4 Bike Intervals',
      'Held all intervals between 245-255 watts. RPE 8.'
    );

    insert into public.nutrition_templates (
      id,
      workspace_id,
      name,
      description,
      duration_weeks,
      is_active,
      nutrition_type_tag
    )
    values (
      '${ids.nutritionTemplate}'::uuid,
      '${ids.workspace}'::uuid,
      'Performance Cut - 2050 kcal',
      'Moderate deficit with high protein and pre-run carbs.',
      4,
      true,
      'fat_loss'
    );

    insert into public.nutrition_template_days (
      id,
      nutrition_template_id,
      week_index,
      day_of_week,
      title,
      notes
    )
    values (
      '${ids.nutritionDay}'::uuid,
      '${ids.nutritionTemplate}'::uuid,
      1,
      1,
      'Training day',
      'Carbs around training, protein evenly split.'
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
      ('${ids.nutritionDay}'::uuid, 10, 'Breakfast', 'Greek yogurt, berries, oats, whey.', 460, 42, 52, 10, 'Prep the night before.'),
      ('${ids.nutritionDay}'::uuid, 20, 'Lunch', 'Chicken rice bowl with vegetables and tahini yogurt.', 620, 48, 72, 16, 'Use the same base on office days.'),
      ('${ids.nutritionDay}'::uuid, 30, 'Dinner', 'Salmon, potatoes, salad, olive oil dressing.', 710, 50, 58, 28, 'Swap salmon for lean beef once weekly.');

    insert into public.assigned_nutrition_plans (
      client_id,
      nutrition_template_id,
      start_date,
      end_date,
      status
    )
    values
      ('${zoe.id}'::uuid, '${ids.nutritionTemplate}'::uuid, current_date - interval '10 days', current_date + interval '18 days', 'active'),
      ('${marcus.id}'::uuid, '${ids.nutritionTemplate}'::uuid, current_date - interval '4 days', current_date + interval '24 days', 'active');

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
    values
      ('00000000-0000-4000-8000-000000000421'::uuid, '${zoe.id}'::uuid, '${ids.checkinTemplate}'::uuid, current_date - extract(dow from current_date)::int + 6, null, null, null, null),
      ('00000000-0000-4000-8000-000000000422'::uuid, '${marcus.id}'::uuid, '${ids.checkinTemplate}'::uuid, current_date - extract(dow from current_date)::int + 6, null, null, null, null);

    insert into public.checkin_answers (
      checkin_id,
      question_id,
      value_text,
      value_number
    )
    values
      ('00000000-0000-4000-8000-000000000421'::uuid, '${ids.checkinMoodQuestion}'::uuid, null, 8),
      ('00000000-0000-4000-8000-000000000421'::uuid, '${ids.checkinWinQuestion}'::uuid, 'Hit all lifts, but sleep dipped on two nights because of late work calls.', null),
      ('00000000-0000-4000-8000-000000000422'::uuid, '${ids.checkinMoodQuestion}'::uuid, null, 6);

    insert into public.checkin_photos (
      checkin_id,
      client_id,
      url,
      storage_path,
      photo_type
    )
    values
      ('00000000-0000-4000-8000-000000000421'::uuid, '${zoe.id}'::uuid, 'https://images.unsplash.com/photo-1517836357463-d25dfeac3438?w=900', '${zoe.id}/00000000-0000-4000-8000-000000000421/front.jpg', 'front'),
      ('00000000-0000-4000-8000-000000000421'::uuid, '${zoe.id}'::uuid, 'https://images.unsplash.com/photo-1518611012118-696072aa579a?w=900', '${zoe.id}/00000000-0000-4000-8000-000000000421/side.jpg', 'side'),
      ('00000000-0000-4000-8000-000000000421'::uuid, '${zoe.id}'::uuid, 'https://images.unsplash.com/photo-1517960413843-0aee8e2b3285?w=900', '${zoe.id}/00000000-0000-4000-8000-000000000421/back.jpg', 'back');

    update public.checkins
    set submitted_at = now() - interval '1 day',
        pt_feedback = 'Excellent consistency. Keep protein where it is and add one easy 25-minute run before Saturday.',
        reviewed_at = now() - interval '16 hours',
        reviewed_by_user_id = '${ptUserId}'::uuid
    where id = '00000000-0000-4000-8000-000000000421'::uuid;

    insert into public.baseline_marker_templates (
      id,
      workspace_id,
      name,
      unit,
      unit_label,
      value_type,
      sort_order,
      is_active,
      created_by_user_id,
      owner_user_id,
      help_text
    )
    values
      ('${ids.waistMarker}'::uuid, '${ids.workspace}'::uuid, 'Waist at navel', 'cm', 'cm', 'number', 10, true, '${ptUserId}'::uuid, '${ptUserId}'::uuid, 'Measured relaxed after exhale.'),
      ('${ids.pushupMarker}'::uuid, '${ids.workspace}'::uuid, 'Push-ups in 60 seconds', 'reps', 'reps', 'number', 20, true, '${ptUserId}'::uuid, '${ptUserId}'::uuid, 'Full lockout and chest depth.');

    insert into public.baseline_entries (
      id,
      client_id,
      workspace_id,
      status,
      client_notes,
      coach_notes,
      submitted_at
    )
    values (
      '${ids.baseline}'::uuid,
      '${zoe.id}'::uuid,
      '${ids.workspace}'::uuid,
      'submitted',
      'Energy is best on morning training days. Calf gets tight after faster runs.',
      'Good starting point. Priority is consistency and controlled run progression.',
      now() - interval '18 days'
    );

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
    values (
      '${ids.baseline}'::uuid,
      68.4,
      170,
      24.2,
      51.8,
      78.5,
      91,
      98,
      56,
      29,
      58,
      43
    );

    insert into public.baseline_entry_marker_templates (baseline_id, template_id)
    values
      ('${ids.baseline}'::uuid, '${ids.waistMarker}'::uuid),
      ('${ids.baseline}'::uuid, '${ids.pushupMarker}'::uuid);

    insert into public.baseline_marker_values (
      baseline_id,
      template_id,
      value_number
    )
    values
      ('${ids.baseline}'::uuid, '${ids.waistMarker}'::uuid, 78.5),
      ('${ids.baseline}'::uuid, '${ids.pushupMarker}'::uuid, 34);

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
      ('${zoe.id}'::uuid, current_date, 2035, 138, 215, 58, 67.9, 'kg', 7.4, 10420, 8, 4, 5, 'Good appetite control. Slight calf tightness after intervals.'),
      ('${zoe.id}'::uuid, current_date - interval '1 day', 2110, 132, 230, 62, 68.1, 'kg', 6.6, 8820, 7, 5, 6, 'Office day. Hit protein but dinner was later than planned.'),
      ('${zoe.id}'::uuid, current_date - interval '2 days', 1995, 140, 198, 55, 68.0, 'kg', 7.8, 12100, 8, 3, 4, 'Best run day of the week.');

    insert into public.client_wearable_connections (
      workspace_id,
      client_id,
      provider,
      open_wearables_user_id,
      open_wearables_connection_id,
      status,
      consent_granted_at,
      connected_at,
      last_sync_at,
      last_provider_sync_at
    )
    values (
      '${ids.workspace}'::uuid,
      '${zoe.id}'::uuid,
      'garmin',
      'ow-demo-zoe',
      'ow-conn-demo-zoe',
      'connected',
      now() - interval '18 days',
      now() - interval '18 days',
      now() - interval '20 minutes',
      now() - interval '35 minutes'
    );

    insert into public.client_wearable_daily_metrics (
      workspace_id,
      client_id,
      provider,
      metric_date,
      steps,
      active_minutes,
      distance_meters,
      calories_active_kcal,
      calories_total_kcal,
      avg_heart_rate_bpm,
      max_heart_rate_bpm,
      resting_heart_rate_bpm,
      hrv_rmssd_ms,
      spo2_percent,
      data_quality
    )
    values
      ('${ids.workspace}'::uuid, '${zoe.id}'::uuid, 'garmin', current_date, 10420, 74, 8200, 680, 2260, 82, 168, 58, 62, 98, 'complete'),
      ('${ids.workspace}'::uuid, '${zoe.id}'::uuid, 'garmin', current_date - interval '1 day', 8820, 51, 6500, 520, 2110, 78, 154, 59, 57, 98, 'complete');

    insert into public.client_wearable_sleep_sessions (
      workspace_id,
      client_id,
      provider,
      provider_record_id,
      sleep_date,
      start_at,
      end_at,
      duration_minutes,
      sleep_score,
      sleep_efficiency_percent,
      awake_minutes,
      light_minutes,
      deep_minutes,
      rem_minutes,
      avg_hr_bpm,
      avg_hrv_ms,
      avg_spo2_percent,
      respiratory_rate
    )
    values (
      '${ids.workspace}'::uuid,
      '${zoe.id}'::uuid,
      'garmin',
      'sleep-demo-zoe-today',
      current_date,
      now() - interval '9 hours',
      now() - interval '1 hour',
      444,
      84,
      91,
      38,
      226,
      82,
      98,
      56,
      62,
      98,
      14.2
    );

    insert into public.client_wearable_activities (
      workspace_id,
      client_id,
      provider,
      provider_record_id,
      activity_type,
      start_at,
      end_at,
      duration_seconds,
      distance_meters,
      calories_kcal,
      avg_hr_bpm,
      max_hr_bpm,
      strain_score
    )
    values (
      '${ids.workspace}'::uuid,
      '${zoe.id}'::uuid,
      'garmin',
      'activity-demo-zoe-run',
      'run',
      now() - interval '2 days 4 hours',
      now() - interval '2 days 3 hours 24 minutes',
      2160,
      6100,
      430,
      146,
      171,
      7.8
    );

    insert into public.conversations (
      id,
      client_id,
      workspace_id,
      last_message_at,
      last_message_preview,
      last_message_sender_name,
      last_message_sender_role
    )
    values (
      '${ids.conversation}'::uuid,
      '${zoe.id}'::uuid,
      '${ids.workspace}'::uuid,
      now() - interval '45 minutes',
      'Calf is a little tight after the bike intervals. I logged notes.',
      ${sqlString(zoe.fullName)},
      'client'
    );

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
    values (
      '00000000-0000-4000-8000-000000000511'::uuid,
      '${ids.conversation}'::uuid,
      '${ptUserId}'::uuid,
      'Great work on the first full week. Keep the easy run truly easy tomorrow.',
      'pt',
      ${sqlString(demo.pt.fullName)},
      'Great work on the first full week.',
      false,
      '${ids.workspace}'::uuid,
      now() - interval '2 hours'
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
    values (
      '00000000-0000-4000-8000-000000000512'::uuid,
      '${ids.conversation}'::uuid,
      '${zoeUserId}'::uuid,
      'Calf is a little tight after the bike intervals. I logged notes.',
      'client',
      ${sqlString(zoe.fullName)},
      'Calf is a little tight after the bike intervals.',
      true,
      '${ids.workspace}'::uuid,
      now() - interval '45 minutes'
    );

    select set_config('request.jwt.claim.sub', '${ptUserId}', true);

    update public.conversations
    set last_message_id = '00000000-0000-4000-8000-000000000512'::uuid
    where id = '${ids.conversation}'::uuid;

    insert into public.coach_activity_log (
      workspace_id,
      client_id,
      actor_user_id,
      action,
      metadata,
      created_at
    )
    values
      ('${ids.workspace}'::uuid, '${zoe.id}'::uuid, '${ptUserId}'::uuid, 'pt_note', ${sqlJson({ title: "Weekly review", body: "Adherence is strong. Watch calf tightness and keep the next aerobic run easy." })}, now() - interval '4 hours'),
      ('${ids.workspace}'::uuid, '${zoe.id}'::uuid, '${ptUserId}'::uuid, 'workout_assigned', ${sqlJson({ workout: "Lower Strength + Push" })}, now() - interval '1 day');

    insert into public.pt_packages (
      id,
      pt_user_id,
      title,
      subtitle,
      description,
      price_label,
      billing_cadence_label,
      cta_label,
      features,
      status,
      is_public,
      sort_order,
      currency_code
    )
    values
      ('${ids.packageHybrid}'::uuid, '${ptUserId}'::uuid, 'Hybrid Performance Coaching', 'Strength plus running support', 'Weekly programming, nutrition targets, habit review, and unlimited async form checks.', 'QAR 1,200', 'per month', 'Apply for hybrid coaching', ${sqlJson(["Weekly program updates", "Nutrition targets", "Check-in review", "Message support"])}, 'active', true, 10, 'QAR'),
      ('${ids.packageStrength}'::uuid, '${ptUserId}'::uuid, 'Strength Foundation', 'Three-day strength plan', 'Simple strength progression for busy clients who need structure and accountability.', 'QAR 850', 'per month', 'Start strength coaching', ${sqlJson(["3 sessions per week", "Exercise video review", "Monthly testing"])}, 'active', true, 20, 'QAR');

    insert into public.pt_hub_leads (
      id,
      user_id,
      full_name,
      email,
      phone,
      goal_summary,
      training_experience,
      budget_interest,
      package_interest,
      status,
      submitted_at,
      converted_workspace_id,
      converted_client_id,
      converted_at,
      source,
      source_slug,
      package_interest_id,
      package_interest_label_snapshot
    )
    values
      ('00000000-0000-4000-8000-000000000711'::uuid, '${ptUserId}'::uuid, 'Priya Nair', 'priya.nair@example.test', '+974 5500 3301', 'Wants structured strength training after a long break.', 'Beginner returning after 18 months', 'QAR 800-1200', 'Strength Foundation', 'new', now() - interval '6 hours', null, null, null, 'public_profile', 'nadia-mercer', '${ids.packageStrength}'::uuid, 'Strength Foundation'),
      ('00000000-0000-4000-8000-000000000712'::uuid, '${ptUserId}'::uuid, 'Omar Haddad', 'omar.haddad@example.test', '+974 5500 3302', 'Preparing for a 10K while reducing body fat.', 'Intermediate runner', 'QAR 1000-1500', 'Hybrid Performance Coaching', 'converted', now() - interval '8 days', '${ids.workspace}'::uuid, '${ethan.id}'::uuid, now() - interval '6 days', 'manual', 'nadia-mercer', '${ids.packageHybrid}'::uuid, 'Hybrid Performance Coaching');

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
      ('${ptUserId}'::uuid, 'client', 'checkin_submitted', 'Zoe submitted a check-in', 'Recovery is 8/10 and one blocker needs review.', '/pt/clients/${zoe.id}?tab=checkins', 'checkin', '00000000-0000-4000-8000-000000000421', ${sqlJson({ clientId: zoe.id })}, false, 'demo-pt-checkin-zoe', 'product', 'checkins', 'high', 'Review'),
      ('${zoeUserId}'::uuid, 'pt', 'workout_assigned', 'Workout assigned for today', 'Lower Strength + Push is ready with coach notes.', '/app/workouts/today', 'assigned_workout', '00000000-0000-4000-8000-000000000901', ${sqlJson({ workout: "Lower Strength + Push" })}, false, 'demo-pt-workout-zoe', 'product', 'training', 'normal', 'Open workout');
  `);

  await pgQuery(`
    select
      (select count(*) from public.clients where workspace_id = '${ids.workspace}'::uuid) as clients,
      (select count(*) from public.assigned_workouts where client_id = '${zoe.id}'::uuid) as zoe_workouts,
      (select count(*) from public.checkins where client_id = '${zoe.id}'::uuid) as zoe_checkins,
      (select count(*) from public.messages where conversation_id = '${ids.conversation}'::uuid) as messages;
  `).then((rows) => {
    console.log("Seeded local PT demo:", rows[0]);
  });

  console.log("PT login:", demo.pt.email, "/", demo.pt.password);
  console.log("Client login:", zoe.email, "/", zoe.password);
  console.log("Screenshot client ID:", zoe.id);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

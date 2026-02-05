create index if not exists assigned_workout_exercises_assigned_workout_id_sort_order_idx
  on public.assigned_workout_exercises (assigned_workout_id, sort_order);

create index if not exists workout_set_logs_workout_session_id_created_at_idx
  on public.workout_set_logs (workout_session_id, created_at desc);

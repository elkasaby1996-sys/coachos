-- Resolve RPC overload ambiguity by dropping the alternate signature
DROP FUNCTION IF EXISTS public.assign_workout_with_template(uuid, uuid, date);

-- Separate control-plane PostgreSQL database. NEVER an application migration.
-- No operational enrollment/admission implementation. Test authority is owner-only.
BEGIN;
CREATE ROLE bill04c_owner NOLOGIN;
CREATE ROLE bill04c_runtime NOLOGIN;
CREATE SCHEMA ledger_private AUTHORIZATION bill04c_owner;
CREATE SCHEMA ledger_api AUTHORIZATION bill04c_owner;
REVOKE ALL ON SCHEMA ledger_private, ledger_api FROM PUBLIC;
SET LOCAL ROLE bill04c_owner;
ALTER DEFAULT PRIVILEGES REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

CREATE DOMAIN ledger_private.digest AS text CHECK (VALUE ~ '^[a-f0-9]{64}$');
CREATE TABLE ledger_private.control (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  disposition text NOT NULL DEFAULT 'DISARMED' CHECK (disposition IN ('DISARMED','SYNTHETIC_LOCAL_ONLY')),
  boot_challenge ledger_private.digest NOT NULL,
  epoch uuid,
  policy_digest ledger_private.digest,
  authoritative_head ledger_private.digest,
  activated_at timestamptz,
  test_now timestamptz
);
INSERT INTO ledger_private.control(boot_challenge) VALUES (repeat('0',64));
CREATE TABLE ledger_private.epochs (
  epoch uuid PRIMARY KEY,
  policy_digest ledger_private.digest NOT NULL,
  boot_challenge ledger_private.digest NOT NULL,
  authoritative_head ledger_private.digest NOT NULL,
  activated_at timestamptz NOT NULL,
  revoked boolean NOT NULL DEFAULT false
);
-- This is NOT an activation endpoint. Only disposable tests, as database owner,
-- insert these exact synthetic permits. Runtime has no permit/epoch write access.
CREATE TABLE ledger_private.admission_permits (
  permit_id uuid PRIMARY KEY,
  binding jsonb NOT NULL CHECK (jsonb_typeof(binding) = 'object'),
  valid_until timestamptz NOT NULL,
  commands jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(commands) = 'array'),
  inspection_fence_digest ledger_private.digest
);
CREATE TABLE ledger_private.consumptions (
  operation_id uuid PRIMARY KEY,
  nonce uuid NOT NULL UNIQUE,
  action_digest ledger_private.digest NOT NULL UNIQUE,
  intent_digest ledger_private.digest NOT NULL,
  permit_id uuid NOT NULL UNIQUE REFERENCES ledger_private.admission_permits,
  epoch uuid NOT NULL REFERENCES ledger_private.epochs,
  policy_digest ledger_private.digest NOT NULL,
  target_key ledger_private.digest NOT NULL,
  target jsonb NOT NULL CHECK (target = '{"project":"exmrksgdikfprtfeltzu","organization":"aerjnyzewgglcpkbrxyn","origin":"https://repsync-staging-replacement.netlify.app"}'::jsonb),
  claim_document jsonb NOT NULL,
  repository_id text NOT NULL CHECK (repository_id ~ '^[0-9]+$'),
  environment text NOT NULL CHECK (environment = 'supabase-staging'),
  run_id text NOT NULL CHECK (run_id ~ '^[0-9]+$'),
  run_attempt integer NOT NULL CHECK (run_attempt > 0),
  phase text NOT NULL,
  mode text NOT NULL CHECK (mode IN ('preflight','apply')),
  category text NOT NULL CHECK (category IN ('EXCLUSIVE','INSPECTION')),
  blocked_operation_id uuid REFERENCES ledger_private.consumptions,
  claimed_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  UNIQUE(repository_id,environment,run_id,run_attempt,phase,mode),
  CHECK ((category = 'INSPECTION') = (blocked_operation_id IS NOT NULL))
);
CREATE TABLE ledger_private.operation_states (
  operation_id uuid PRIMARY KEY REFERENCES ledger_private.consumptions,
  state text NOT NULL CHECK (state IN ('CLAIMED_PENDING_RETENTION','RETENTION_CONFIRMED','RUNNING','FAILED','REVOKED','OUTCOME_UNKNOWN','BLOCKED_RETENTION')),
  retention_ack_digest ledger_private.digest,
  reservation_count integer NOT NULL DEFAULT 0 CHECK (reservation_count >= 0),
  revision integer NOT NULL DEFAULT 0 CHECK (revision >= 0),
  updated_at timestamptz NOT NULL,
  CHECK (state NOT IN ('RETENTION_CONFIRMED','RUNNING') OR retention_ack_digest IS NOT NULL)
);
CREATE TABLE ledger_private.target_ownership (
  operation_id uuid PRIMARY KEY REFERENCES ledger_private.consumptions,
  target_key ledger_private.digest NOT NULL,
  disposition text NOT NULL CHECK (disposition IN ('RESERVED','OWNED','QUARANTINED','RELEASED')),
  updated_at timestamptz NOT NULL,
  worker_lease_until timestamptz,
  project text NOT NULL DEFAULT 'exmrksgdikfprtfeltzu' CHECK (project='exmrksgdikfprtfeltzu'),
  organization text NOT NULL DEFAULT 'aerjnyzewgglcpkbrxyn' CHECK (organization='aerjnyzewgglcpkbrxyn')
);
CREATE UNIQUE INDEX one_active_owner ON ledger_private.target_ownership(project,organization)
  WHERE disposition IN ('RESERVED','OWNED','QUARANTINED');
CREATE TABLE ledger_private.command_reservations (
  operation_id uuid NOT NULL REFERENCES ledger_private.consumptions,
  sequence integer NOT NULL CHECK (sequence > 0),
  command_digest ledger_private.digest NOT NULL,
  artifact_digest ledger_private.digest NOT NULL,
  reserved_at timestamptz NOT NULL,
  PRIMARY KEY(operation_id,sequence)
);
CREATE TABLE ledger_private.transition_permits (
  permit_id uuid PRIMARY KEY,
  operation_id uuid NOT NULL REFERENCES ledger_private.consumptions,
  expected_revision integer NOT NULL CHECK (expected_revision >= 0),
  next_state text NOT NULL CHECK (next_state IN ('RETENTION_CONFIRMED','RUNNING')),
  retention_ack_digest ledger_private.digest NOT NULL,
  verified_package_digest ledger_private.digest NOT NULL,
  valid_until timestamptz NOT NULL,
  UNIQUE(operation_id,expected_revision)
);
CREATE TABLE ledger_private.audit_events (
  operation_id uuid NOT NULL REFERENCES ledger_private.consumptions,
  sequence integer NOT NULL CHECK (sequence > 0),
  event text NOT NULL CHECK (event IN ('CLAIMED','RETENTION_CONFIRMED','RUNNING','COMMAND_RESERVED','FAILED','REVOKED','OUTCOME_UNKNOWN','BLOCKED_RETENTION','DISARMED')),
  recorded_at timestamptz NOT NULL,
  previous_hash ledger_private.digest NOT NULL,
  payload jsonb NOT NULL,
  event_hash ledger_private.digest NOT NULL,
  PRIMARY KEY(operation_id,sequence)
);
CREATE FUNCTION ledger_private.immutable() RETURNS trigger LANGUAGE plpgsql
SET search_path = pg_catalog, ledger_private AS $$
BEGIN RAISE EXCEPTION USING MESSAGE = 'LEDGER_IMMUTABLE', ERRCODE = 'P0001'; END $$;
CREATE TRIGGER immutable_consumption BEFORE UPDATE OR DELETE ON ledger_private.consumptions FOR EACH ROW EXECUTE FUNCTION ledger_private.immutable();
CREATE TRIGGER immutable_reservation BEFORE UPDATE OR DELETE ON ledger_private.command_reservations FOR EACH ROW EXECUTE FUNCTION ledger_private.immutable();
CREATE TRIGGER immutable_audit BEFORE UPDATE OR DELETE ON ledger_private.audit_events FOR EACH ROW EXECUTE FUNCTION ledger_private.immutable();
CREATE TRIGGER immutable_admission BEFORE UPDATE OR DELETE ON ledger_private.admission_permits FOR EACH ROW EXECUTE FUNCTION ledger_private.immutable();
CREATE TRIGGER immutable_transition BEFORE UPDATE OR DELETE ON ledger_private.transition_permits FOR EACH ROW EXECUTE FUNCTION ledger_private.immutable();

CREATE FUNCTION ledger_private.check_authority(a jsonb) RETURNS ledger_private.control
LANGUAGE plpgsql SET search_path = pg_catalog, ledger_private AS $$
DECLARE c ledger_private.control; e ledger_private.epochs;
BEGIN
  -- Serialize all claims/dispatch reservations with disarming and epoch changes.
  SELECT * INTO STRICT c FROM ledger_private.control WHERE singleton FOR UPDATE;
  IF c.disposition <> 'SYNTHETIC_LOCAL_ONLY' OR current_database() !~ '^bill04c_[a-f0-9]+$'
    OR a IS NULL OR a->>'kind' IS DISTINCT FROM 'SYNTHETIC_LOCAL_ONLY'
    OR a->>'epoch' IS DISTINCT FROM c.epoch::text
    OR a->>'bootChallenge' IS DISTINCT FROM c.boot_challenge
    OR a->>'headDigest' IS DISTINCT FROM c.authoritative_head
    OR c.test_now IS NULL THEN
    RAISE EXCEPTION 'LEDGER_AUTHORITY_UNAVAILABLE';
  END IF;
  -- Hold the current epoch through transaction end. FOR SHARE conflicts with
  -- revoked-only updates; stale repeatable-read/serializable snapshots abort.
  -- Authority writers touching both records must lock control before epochs.
  SELECT * INTO e FROM ledger_private.epochs WHERE epoch=c.epoch FOR SHARE;
  IF NOT FOUND OR e.revoked OR e.policy_digest IS DISTINCT FROM c.policy_digest
    OR e.boot_challenge IS DISTINCT FROM c.boot_challenge OR e.authoritative_head IS DISTINCT FROM c.authoritative_head THEN
    RAISE EXCEPTION 'LEDGER_EPOCH_REJECTED';
  END IF;
  RETURN c;
END $$;

CREATE FUNCTION ledger_private.append_event(op uuid, event_name text, at_time timestamptz, fields jsonb DEFAULT '{}'::jsonb)
RETURNS void LANGUAGE plpgsql SET search_path = pg_catalog, ledger_private AS $$
DECLARE n integer; prev text; body jsonb; h text;
BEGIN
  -- Every caller first holds operation_states row lock, including the claim insert.
  -- Keep the transaction's WAL acknowledgement synchronous even if a client
  -- session used asynchronous commit. The adapter must acknowledge after COMMIT.
  PERFORM set_config('synchronous_commit','on',true);
  SELECT sequence,event_hash INTO n,prev FROM ledger_private.audit_events
    WHERE operation_id=op ORDER BY sequence DESC LIMIT 1;
  n:=coalesce(n,0)+1; prev:=coalesce(prev,repeat('0',64));
  body:=jsonb_build_object('operationId',op,'sequence',n,'event',event_name,'recordedAt',at_time,'fields',fields);
  h:=encode(sha256(convert_to('repsync-control-plane-audit/v1' || E'\n' || prev || E'\n' || body::text,'UTF8')),'hex');
  INSERT INTO ledger_private.audit_events VALUES(op,n,event_name,at_time,prev,body,h);
END $$;

CREATE FUNCTION ledger_api.claim(request jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, ledger_private AS $$
DECLARE c ledger_private.control; p ledger_private.admission_permits; b jsonb; op uuid; blocked uuid; cat text;
BEGIN
  c:=ledger_private.check_authority(request->'authority');
  SELECT * INTO p FROM ledger_private.admission_permits WHERE permit_id=(request->>'permitId')::uuid;
  b:=request->'binding';
  IF NOT FOUND OR b IS DISTINCT FROM p.binding OR p.valid_until <= c.test_now THEN RAISE EXCEPTION 'LEDGER_ADMISSION_PERMIT_REJECTED'; END IF;
  IF b->>'epoch' IS DISTINCT FROM c.epoch::text OR b->>'policyDigest' IS DISTINCT FROM c.policy_digest
    OR (b->>'runCreatedAt')::timestamptz <= c.activated_at
    OR (b->>'notBefore')::timestamptz > c.test_now OR (b->>'expiresAt')::timestamptz <= c.test_now THEN
    RAISE EXCEPTION 'LEDGER_EPOCH_OR_DEADLINE_REJECTED';
  END IF;
  op:=(b->>'claimId')::uuid; blocked:=(b->>'blockedOperationId')::uuid;
  cat:=CASE WHEN b->>'capability'='RECOVERY_INSPECT' THEN 'INSPECTION' ELSE 'EXCLUSIVE' END;
  IF cat='INSPECTION' THEN
    PERFORM 1 FROM ledger_private.target_ownership t JOIN ledger_private.consumptions x USING(operation_id)
      WHERE t.operation_id=blocked AND t.target_key=b->>'targetKey' AND t.disposition='QUARANTINED'
      AND x.action_digest=b->>'blockedActionDigest' FOR UPDATE OF t;
    IF NOT FOUND OR p.inspection_fence_digest IS NULL THEN RAISE EXCEPTION 'LEDGER_INSPECTION_FENCING_REQUIRED'; END IF;
  END IF;
  INSERT INTO ledger_private.consumptions VALUES(
    op,(b->>'nonce')::uuid,b->>'actionDigest',b->>'intentDigest',p.permit_id,c.epoch,c.policy_digest,
    b->>'targetKey',b->'target',jsonb_build_object('schemaVersion',1,'mode','founder_signed_control_plane_v2','epoch',c.epoch,'policyDigest',c.policy_digest,'claimId',op,'actionDigest',b->>'actionDigest','intentDigest',b->>'intentDigest','nonce',b->>'nonce','slot',b->'slot','consumed',true,'state','CLAIMED_PENDING_RETENTION','targetOwnership',CASE WHEN cat='INSPECTION' THEN 'INSPECTION' ELSE 'RESERVED' END,'claimedAt',to_char(c.test_now AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
    b#>>'{slot,repositoryId}',b#>>'{slot,environment}',b#>>'{slot,runId}',
    (b#>>'{slot,runAttempt}')::integer,b#>>'{slot,phase}',b#>>'{slot,mode}',cat,blocked,c.test_now,least((b->>'expiresAt')::timestamptz,p.valid_until));
  INSERT INTO ledger_private.operation_states(operation_id,state,updated_at) VALUES(op,'CLAIMED_PENDING_RETENTION',c.test_now);
  IF cat='EXCLUSIVE' THEN INSERT INTO ledger_private.target_ownership VALUES(op,b->>'targetKey','RESERVED',c.test_now); END IF;
  PERFORM ledger_private.append_event(op,'CLAIMED',c.test_now,jsonb_build_object('actionDigest',b->>'actionDigest','intentDigest',b->>'intentDigest','category',cat));
  RETURN jsonb_build_object('operationId',op,'state','CLAIMED_PENDING_RETENTION','consumed',true,'targetOwnership',CASE WHEN cat='INSPECTION' THEN 'INSPECTION' ELSE 'RESERVED' END,'claimedAt',c.test_now,'operational',false,'executionEligible',false);
EXCEPTION WHEN unique_violation THEN RAISE EXCEPTION 'LEDGER_REPLAY_OR_TARGET_CONFLICT';
END $$;

CREATE FUNCTION ledger_private.active_operation(request jsonb) RETURNS ledger_private.operation_states
LANGUAGE plpgsql SET search_path = pg_catalog, ledger_private AS $$
DECLARE c ledger_private.control; x ledger_private.consumptions; s ledger_private.operation_states;
BEGIN
  c:=ledger_private.check_authority(request->'authority');
  SELECT * INTO x FROM ledger_private.consumptions WHERE operation_id=(request->>'operationId')::uuid;
  IF NOT FOUND OR x.action_digest IS DISTINCT FROM request->>'actionDigest' OR x.epoch<>c.epoch
    OR x.policy_digest<>c.policy_digest OR x.expires_at<=c.test_now THEN RAISE EXCEPTION 'LEDGER_OPERATION_BINDING_REJECTED'; END IF;
  SELECT * INTO STRICT s FROM ledger_private.operation_states WHERE operation_id=x.operation_id FOR UPDATE;
  RETURN s;
END $$;

CREATE FUNCTION ledger_api.advance(request jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, ledger_private AS $$
DECLARE s ledger_private.operation_states; p ledger_private.transition_permits; c ledger_private.control;
BEGIN
  s:=ledger_private.active_operation(request);
  SELECT * INTO STRICT c FROM ledger_private.control;
  SELECT * INTO p FROM ledger_private.transition_permits WHERE permit_id=(request->>'permitId')::uuid;
  IF NOT FOUND OR p.operation_id<>s.operation_id OR p.expected_revision<>s.revision OR p.valid_until<=c.test_now
    OR p.next_state IS DISTINCT FROM request->>'nextState'
    OR p.retention_ack_digest IS DISTINCT FROM request->>'retentionAckDigest'
    OR p.verified_package_digest IS DISTINCT FROM request->>'verifiedPackageDigest'
    OR (p.next_state='RETENTION_CONFIRMED' AND s.state<>'CLAIMED_PENDING_RETENTION')
    OR (p.next_state='RUNNING' AND (s.state<>'RETENTION_CONFIRMED' OR s.retention_ack_digest<>p.retention_ack_digest)) THEN
    RAISE EXCEPTION 'LEDGER_RETENTION_OR_TRANSITION_REJECTED';
  END IF;
  UPDATE ledger_private.operation_states SET state=p.next_state,retention_ack_digest=p.retention_ack_digest,revision=revision+1,updated_at=c.test_now WHERE operation_id=s.operation_id;
  IF p.next_state='RUNNING' THEN UPDATE ledger_private.target_ownership SET disposition='OWNED',updated_at=c.test_now WHERE operation_id=s.operation_id AND disposition='RESERVED'; END IF;
  PERFORM ledger_private.append_event(s.operation_id,p.next_state,c.test_now,jsonb_build_object('retentionAckDigest',p.retention_ack_digest,'verifiedPackageDigest',p.verified_package_digest));
  RETURN jsonb_build_object('state',p.next_state,'operational',false,'executionEligible',false);
END $$;

CREATE FUNCTION ledger_api.reserve_command(request jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, ledger_private AS $$
DECLARE s ledger_private.operation_states; c ledger_private.control; x ledger_private.consumptions; p ledger_private.admission_permits; n integer;
BEGIN
  s:=ledger_private.active_operation(request);
  SELECT * INTO STRICT c FROM ledger_private.control;
  SELECT * INTO STRICT x FROM ledger_private.consumptions WHERE operation_id=s.operation_id;
  SELECT * INTO STRICT p FROM ledger_private.admission_permits WHERE permit_id=x.permit_id;
  n:=(request->>'sequence')::integer;
  IF s.state<>'RUNNING' OR s.retention_ack_digest IS NULL OR x.category='INSPECTION'
    OR (x.mode<>'apply' AND x.phase NOT IN ('BACKUP_180','BACKUP_184'))
    OR x.phase IN ('CAPTURE_BASELINE','STATUS','RECOVERY_INSPECT') OR x.phase LIKE 'MEASURE_TIMING:%'
    OR NOT EXISTS(SELECT 1 FROM ledger_private.target_ownership WHERE operation_id=s.operation_id AND disposition='OWNED') THEN
    RAISE EXCEPTION 'LEDGER_COMMAND_STATE_REJECTED';
  END IF;
  IF n<>s.reservation_count+1 OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p.commands) cmd
    WHERE cmd=jsonb_build_object('sequence',n,'commandDigest',request->>'commandDigest','artifactDigest',request->>'artifactDigest')) THEN
    RAISE EXCEPTION 'LEDGER_COMMAND_PLAN_OR_SEQUENCE_REJECTED';
  END IF;
  INSERT INTO ledger_private.command_reservations VALUES(s.operation_id,n,request->>'commandDigest',request->>'artifactDigest',c.test_now);
  UPDATE ledger_private.operation_states SET reservation_count=n,revision=revision+1,updated_at=c.test_now WHERE operation_id=s.operation_id;
  PERFORM ledger_private.append_event(s.operation_id,'COMMAND_RESERVED',c.test_now,jsonb_build_object('sequence',n,'commandDigest',request->>'commandDigest','artifactDigest',request->>'artifactDigest'));
  RETURN jsonb_build_object('reserved',true,'sequence',n,'operational',false,'executionEligible',false,'redispatchAllowed',false);
END $$;

-- No success/release endpoint: fencing, terminal custody and reconciliation are
-- future trusted integrations. Missing proof leaves ownership quarantined.
CREATE FUNCTION ledger_api.stop(request jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, ledger_private AS $$
DECLARE x ledger_private.consumptions; s ledger_private.operation_states; outcome text;
BEGIN
  -- Stopping is permitted after expiry/disarming; never increases authority.
  PERFORM 1 FROM ledger_private.control WHERE singleton FOR UPDATE;
  SELECT * INTO x FROM ledger_private.consumptions WHERE operation_id=(request->>'operationId')::uuid;
  IF NOT FOUND OR x.action_digest IS DISTINCT FROM request->>'actionDigest' THEN RAISE EXCEPTION 'LEDGER_OPERATION_BINDING_REJECTED'; END IF;
  SELECT * INTO STRICT s FROM ledger_private.operation_states WHERE operation_id=x.operation_id FOR UPDATE;
  outcome:=request->>'outcome';
  IF outcome NOT IN ('FAILED','REVOKED','OUTCOME_UNKNOWN','BLOCKED_RETENTION') OR outcome IS NULL
    OR s.state IN ('FAILED','REVOKED','OUTCOME_UNKNOWN','BLOCKED_RETENTION')
    OR (outcome='BLOCKED_RETENTION' AND s.state<>'CLAIMED_PENDING_RETENTION') THEN RAISE EXCEPTION 'LEDGER_TERMINAL_TRANSITION_REJECTED'; END IF;
  UPDATE ledger_private.operation_states SET state=outcome,revision=revision+1,updated_at=clock_timestamp() WHERE operation_id=x.operation_id;
  UPDATE ledger_private.target_ownership SET disposition='QUARANTINED',updated_at=clock_timestamp() WHERE operation_id=x.operation_id AND disposition<>'RELEASED';
  PERFORM ledger_private.append_event(x.operation_id,outcome,clock_timestamp());
  RETURN jsonb_build_object('state',outcome,'operational',false,'executionEligible',false,'quarantined',x.category='EXCLUSIVE');
END $$;

CREATE FUNCTION ledger_api.disarm() RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, ledger_private AS $$
DECLARE s ledger_private.operation_states;
BEGIN
  PERFORM set_config('synchronous_commit','on',true);
  PERFORM 1 FROM ledger_private.control WHERE singleton FOR UPDATE;
  UPDATE ledger_private.control SET disposition='DISARMED';
  FOR s IN SELECT * FROM ledger_private.operation_states WHERE state IN ('CLAIMED_PENDING_RETENTION','RETENTION_CONFIRMED','RUNNING') ORDER BY operation_id FOR UPDATE LOOP
    UPDATE ledger_private.operation_states SET state='OUTCOME_UNKNOWN',revision=revision+1,updated_at=clock_timestamp() WHERE operation_id=s.operation_id;
    UPDATE ledger_private.target_ownership SET disposition='QUARANTINED',updated_at=clock_timestamp() WHERE operation_id=s.operation_id AND disposition<>'RELEASED';
    PERFORM ledger_private.append_event(s.operation_id,'DISARMED',clock_timestamp());
  END LOOP;
END $$;

CREATE FUNCTION ledger_api.status(op uuid, action text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, ledger_private AS $$
DECLARE x ledger_private.consumptions; s ledger_private.operation_states; ownership text; events jsonb;
BEGIN
  -- Coherent state + audit snapshot against the same serialized writer boundary.
  PERFORM 1 FROM ledger_private.control WHERE singleton FOR SHARE;
  SELECT * INTO x FROM ledger_private.consumptions WHERE operation_id=op AND action_digest=action;
  IF NOT FOUND THEN RAISE EXCEPTION 'LEDGER_OPERATION_NOT_FOUND'; END IF;
  SELECT * INTO STRICT s FROM ledger_private.operation_states WHERE operation_id=op;
  SELECT disposition INTO ownership FROM ledger_private.target_ownership WHERE operation_id=op;
  SELECT jsonb_agg(jsonb_build_object('sequence',sequence,'previousHash',previous_hash,'payloadText',payload::text,'eventHash',event_hash) ORDER BY sequence) INTO events FROM ledger_private.audit_events WHERE operation_id=op;
  RETURN jsonb_build_object('operationId',op,'claimRecord',x.claim_document,'state',s.state,'revision',s.revision,'reservationCount',s.reservation_count,'consumed',true,'targetOwnership',coalesce(ownership,'INSPECTION'),'audit',events,'operational',false,'executionEligible',false,'redispatchAllowed',false);
END $$;

REVOKE ALL ON ALL TABLES IN SCHEMA ledger_private FROM PUBLIC, bill04c_runtime;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA ledger_private FROM PUBLIC, bill04c_runtime;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA ledger_api FROM PUBLIC;
GRANT USAGE ON SCHEMA ledger_api TO bill04c_runtime;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA ledger_api TO bill04c_runtime;
COMMIT;

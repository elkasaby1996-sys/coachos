# Local capacity query-plan evidence

Run with the reproducible, transaction-rolled-back [fixture](account-capacity-query-plans.sql). Added fixture: 2,001 auth identities; 20 owned workspaces; 1,000 linked clients; 50 distinct staff repeated across 20 workspaces (1,000 membership rows); 100 pending team invites; 1,000 published packages; 1,000 active reservations. Existing local browser fixtures were also present. No planner settings were changed.

The first complete snapshot took 16,880.921 ms because normalization hashed every auth email even for operation subjects. Prefix-gating those lookups and matching pending email directly reduced it to 307.447 ms. The component aggregations took 1.211 / 0.710 / 0.266 / 0.021 / 0.262 / 0.280 ms for clients / staff / pending invites / workspaces / packages / reservations respectively.

No new indexes were added to domain tables. Existing workspace/client relationship, active workspace-member, pending-invite, package-publication, and ownership indexes remain available. Sequential scans are appropriate here: the fixture account owns nearly all rows in small tables and aggregation needs nearly all of them. The account lookup uses its unique owner index. New reservation indexes cover active account/dimension/expiry, account/dimension/subject, status/expiry, and denied idempotency hashes.

Residual scaling concern: matching an email-hash reservation to auth identities is proportional to the auth-user population. Before PR-PRICE-04 accepts high-volume email reservations, resolve verified linked user IDs where available and measure a multi-account production-shaped fixture; review a dedicated privacy-safe identity lookup only if needed. These measurements are local evidence, not a production latency guarantee.

```text
BEGIN
INSERT 0 2001
INSERT 0 20
INSERT 0 1000
INSERT 0 1000
INSERT 0 100
INSERT 0 1000
INSERT 0 1000
ANALYZE
ANALYZE
ANALYZE
ANALYZE
ANALYZE
ANALYZE
ANALYZE
client aggregation and distinct linked identity
                                                                                         QUERY PLAN
--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
 Aggregate  (cost=64.51..64.52 rows=1 width=8) (actual time=1.167..1.168 rows=1 loops=1)
   Buffers: shared hit=47
   ->  Sort  (cost=64.43..64.44 rows=4 width=32) (actual time=0.962..0.996 rows=1000 loops=1)
         Sort Key: (COALESCE(('user:'::text || (c.user_id)::text), ('client:'::text || (c.id)::text)))
         Sort Method: quicksort  Memory: 118kB
         Buffers: shared hit=47
         ->  Hash Join  (cost=1.65..64.39 rows=4 width=32) (actual time=0.105..0.619 rows=1000 loops=1)
               Hash Cond: (c.workspace_id = w.id)
               Buffers: shared hit=47
               ->  Seq Scan on clients c  (cost=0.00..62.72 rows=6 width=48) (actual time=0.049..0.376 rows=1113 loops=1)
                     Filter: (((lifecycle_state IS NULL) OR (lifecycle_state <> ALL ('{completed,churned}'::text[]))) AND (COALESCE(relationship_status, 'active'::text) = 'active'::text))
                     Rows Removed by Filter: 2
                     Buffers: shared hit=46
               ->  Hash  (cost=1.40..1.40 rows=20 width=16) (actual time=0.010..0.010 rows=20 loops=1)
                     Buckets: 1024  Batches: 1  Memory Usage: 9kB
                     Buffers: shared hit=1
                     ->  Seq Scan on workspaces w  (cost=0.00..1.40 rows=20 width=16) (actual time=0.005..0.006 rows=20 loops=1)
                           Filter: (owner_user_id = 'a0310000-0000-4000-8000-000000000001'::uuid)
                           Rows Removed by Filter: 12
                           Buffers: shared hit=1
 Planning:
   Buffers: shared hit=210
 Planning Time: 0.744 ms
 Execution Time: 1.211 ms
(24 rows)

active human team aggregation
                                                                          QUERY PLAN
--------------------------------------------------------------------------------------------------------------------------------------------------------------
 Aggregate  (cost=67.89..67.90 rows=1 width=8) (actual time=0.684..0.685 rows=1 loops=1)
   Buffers: shared hit=43
   ->  Sort  (cost=67.76..67.82 rows=26 width=16) (actual time=0.603..0.641 rows=1020 loops=1)
         Sort Key: m.user_id
         Sort Method: quicksort  Memory: 25kB
         Buffers: shared hit=43
         ->  Hash Join  (cost=1.65..67.15 rows=26 width=16) (actual time=0.074..0.492 rows=1020 loops=1)
               Hash Cond: (m.workspace_id = w.id)
               Buffers: shared hit=43
               ->  Seq Scan on workspace_members m  (cost=0.00..65.38 rows=41 width=32) (actual time=0.057..0.369 rows=1032 loops=1)
                     Filter: ((status = 'active'::text) AND ((role)::text = ANY ('{owner,admin,coach,assistant_coach,viewer,pt_owner,pt_coach,pt}'::text[])))
                     Buffers: shared hit=42
               ->  Hash  (cost=1.40..1.40 rows=20 width=16) (actual time=0.009..0.009 rows=20 loops=1)
                     Buckets: 1024  Batches: 1  Memory Usage: 9kB
                     Buffers: shared hit=1
                     ->  Seq Scan on workspaces w  (cost=0.00..1.40 rows=20 width=16) (actual time=0.004..0.006 rows=20 loops=1)
                           Filter: (owner_user_id = 'a0310000-0000-4000-8000-000000000001'::uuid)
                           Rows Removed by Filter: 12
                           Buffers: shared hit=1
 Planning:
   Buffers: shared hit=78
 Planning Time: 0.336 ms
 Execution Time: 0.710 ms
(23 rows)

pending team invitations
                                                                QUERY PLAN
-------------------------------------------------------------------------------------------------------------------------------------------
 Aggregate  (cost=11.23..11.24 rows=1 width=8) (actual time=0.240..0.241 rows=1 loops=1)
   Buffers: shared hit=6
   ->  Sort  (cost=10.60..10.76 rows=63 width=25) (actual time=0.225..0.230 rows=100 loops=1)
         Sort Key: (lower(btrim(i.email)))
         Sort Method: quicksort  Memory: 31kB
         Buffers: shared hit=6
         ->  Hash Join  (cost=1.65..8.72 rows=63 width=25) (actual time=0.034..0.112 rows=100 loops=1)
               Hash Cond: (i.workspace_id = w.id)
               Buffers: shared hit=6
               ->  Seq Scan on workspace_member_invites i  (cost=0.00..6.77 rows=101 width=41) (actual time=0.013..0.030 rows=101 loops=1)
                     Filter: ((status = 'pending'::text) AND (expires_at > transaction_timestamp()))
                     Buffers: shared hit=5
               ->  Hash  (cost=1.40..1.40 rows=20 width=16) (actual time=0.009..0.009 rows=20 loops=1)
                     Buckets: 1024  Batches: 1  Memory Usage: 9kB
                     Buffers: shared hit=1
                     ->  Seq Scan on workspaces w  (cost=0.00..1.40 rows=20 width=16) (actual time=0.004..0.006 rows=20 loops=1)
                           Filter: (owner_user_id = 'a0310000-0000-4000-8000-000000000001'::uuid)
                           Rows Removed by Filter: 12
                           Buffers: shared hit=1
 Planning:
   Buffers: shared hit=57
 Planning Time: 0.349 ms
 Execution Time: 0.266 ms
(23 rows)

workspace ownership count
                                                 QUERY PLAN
------------------------------------------------------------------------------------------------------------
 Aggregate  (cost=1.45..1.46 rows=1 width=8) (actual time=0.009..0.009 rows=1 loops=1)
   Buffers: shared hit=1
   ->  Seq Scan on workspaces  (cost=0.00..1.40 rows=20 width=0) (actual time=0.006..0.008 rows=20 loops=1)
         Filter: (owner_user_id = 'a0310000-0000-4000-8000-000000000001'::uuid)
         Rows Removed by Filter: 12
         Buffers: shared hit=1
 Planning:
   Buffers: shared hit=3
 Planning Time: 0.047 ms
 Execution Time: 0.021 ms
(10 rows)

published package count
                                                        QUERY PLAN
---------------------------------------------------------------------------------------------------------------------------
 Aggregate  (cost=46.56..46.57 rows=1 width=8) (actual time=0.244..0.245 rows=1 loops=1)
   Buffers: shared hit=29
   ->  Seq Scan on pt_packages  (cost=0.00..44.06 rows=999 width=0) (actual time=0.038..0.207 rows=1000 loops=1)
         Filter: (is_public AND (pt_user_id = 'a0310000-0000-4000-8000-000000000001'::uuid) AND (status = 'active'::text))
         Rows Removed by Filter: 4
         Buffers: shared hit=29
 Planning:
   Buffers: shared hit=35
 Planning Time: 0.219 ms
 Execution Time: 0.262 ms
(10 rows)

active reservations
                                                                          QUERY PLAN
--------------------------------------------------------------------------------------------------------------------------------------------------------------
 Aggregate  (cost=80.44..80.45 rows=1 width=8) (actual time=0.259..0.260 rows=1 loops=1)
   Buffers: shared hit=53
   InitPlan 1
     ->  Index Scan using billing_accounts_owner_user_id_key on billing_accounts  (cost=0.15..8.17 rows=1 width=16) (actual time=0.006..0.006 rows=1 loops=1)
           Index Cond: (owner_user_id = 'a0310000-0000-4000-8000-000000000001'::uuid)
           Buffers: shared hit=2
   ->  Seq Scan on account_capacity_reservations  (cost=0.00..71.02 rows=500 width=0) (actual time=0.056..0.223 rows=1000 loops=1)
         Filter: ((billing_account_id = (InitPlan 1).col1) AND (status = 'active'::text) AND (expires_at > transaction_timestamp()))
         Rows Removed by Filter: 1
         Buffers: shared hit=53
 Planning:
   Buffers: shared hit=50
 Planning Time: 0.280 ms
 Execution Time: 0.280 ms
(14 rows)

complete snapshot including identity normalization and exclusions
                                                                          QUERY PLAN
--------------------------------------------------------------------------------------------------------------------------------------------------------------
 Result  (cost=8.17..8.43 rows=1 width=32) (actual time=307.432..307.433 rows=1 loops=1)
   Buffers: shared hit=28903
   InitPlan 1
     ->  Index Scan using billing_accounts_owner_user_id_key on billing_accounts  (cost=0.15..8.17 rows=1 width=16) (actual time=0.005..0.005 rows=1 loops=1)
           Index Cond: (owner_user_id = 'a0310000-0000-4000-8000-000000000001'::uuid)
           Buffers: shared hit=2
 Planning Time: 0.039 ms
 Execution Time: 307.447 ms
(8 rows)

ROLLBACK
```

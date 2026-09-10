# Atomic admission query-plan evidence

The [local rolled-back fixture](account-capacity-enforcement-query-plans.sql) adds 10,001 auth users, 21 workspaces across two accounts, 1,000 linked clients, 1,001 non-owner staff memberships, 200 pending invitations, 1,000 public packages, and 50 genuinely email-hashed reservations. It runs independently from browser tests.

Initially, repeated full auth-user scans made workspace/client/package admission take 4.3 seconds, email admission 7.1 seconds, and transfer 8.3 seconds. Accumulated transaction time exceeded the 30-second synchronous TTL before lead conversion, which correctly failed with ACCOUNT_CAPACITY_OPERATION_EXPIRED. That baseline lead probe did not complete.

An attempted local auth expression index was rejected because the migration role does not own auth.users. No auth index or permission change is included. The existing account_capacity_subjects and resolve_account_capacity helpers now batch identity resolution, and reserve_account_capacity matches aliases against the requested identity. No counter, identity mirror, or second reservation table was added.

| Admission or mutation                 | Execution time |
| ------------------------------------- | -------------: |
| Workspace +1                          |     129.598 ms |
| Linked client +1                      |     110.380 ms |
| Unlinked canonical-client fallback +1 |     109.153 ms |
| Pending email +1                      |     158.600 ms |
| Pending to active zero delta          |      11.280 ms |
| Package publication +1                |     108.092 ms |
| Cross-owner transfer RPC              |     206.929 ms |
| Two-dimension lead conversion RPC     |     585.653 ms |

The first six probes include account locking, fresh subjects, effective contract resolution, and reservations when positive. Transfer and lead probes run full RPCs including consumption. The unlinked probe admits a canonical client UUID fallback, not a linked person. Function-level EXPLAIN reports aggregate buffers and timing; separate identity lookup plans expose scan work. Individual hash matching still scans auth users once. These local figures do not establish production latency or load guarantees. No new indexes were needed after batching. Every statement completed and the fixture rolled back.

```text
BEGIN
ALTER TABLE
ALTER TABLE
ALTER TABLE
ALTER TABLE
ALTER TABLE
INSERT 0 10001
INSERT 0 1
INSERT 0 1
  ensure_commercial_billing_account
--------------------------------------
 762bb6d7-209e-4aac-8e86-8636db8d9b0d
(1 row)

  ensure_commercial_billing_account
--------------------------------------
 1952f329-ba4d-4b8f-a4eb-d2cc6c7b2ccd
(1 row)

INSERT 0 2
INSERT 0 20
INSERT 0 1
INSERT 0 1000
INSERT 0 1000
INSERT 0 1
INSERT 0 200
INSERT 0 1000
INSERT 0 50
ALTER TABLE
ALTER TABLE
ALTER TABLE
ALTER TABLE
ALTER TABLE
ANALYZE
ANALYZE
ANALYZE
ANALYZE
ANALYZE
ANALYZE
ANALYZE
              set_config
--------------------------------------
 a0410000-0000-4000-8000-000000000001
(1 row)

Workspace +1 admission including account lock and fresh contract
                                       QUERY PLAN
-----------------------------------------------------------------------------------------
 Result  (cost=0.00..0.26 rows=1 width=16) (actual time=129.588..129.588 rows=1 loops=1)
   Buffers: shared hit=5403
 Planning Time: 0.007 ms
 Execution Time: 129.598 ms
(4 rows)

Linked client +1 admission
                                       QUERY PLAN
-----------------------------------------------------------------------------------------
 Result  (cost=0.00..0.26 rows=1 width=16) (actual time=110.372..110.372 rows=1 loops=1)
   Buffers: shared hit=3267
 Planning Time: 0.006 ms
 Execution Time: 110.380 ms
(4 rows)

Unlinked client fallback +1 admission
                                       QUERY PLAN
-----------------------------------------------------------------------------------------
 Result  (cost=0.00..0.26 rows=1 width=16) (actual time=109.145..109.145 rows=1 loops=1)
   Buffers: shared hit=3266
 Planning Time: 0.006 ms
 Execution Time: 109.153 ms
(4 rows)

Pending team email +1 admission
                                       QUERY PLAN
-----------------------------------------------------------------------------------------
 Result  (cost=0.00..0.26 rows=1 width=16) (actual time=158.594..158.595 rows=1 loops=1)
   Buffers: shared hit=3503
 Planning Time: 0.068 ms
 Execution Time: 158.600 ms
(4 rows)

Pending to active zero-delta decision
                                      QUERY PLAN
---------------------------------------------------------------------------------------
 Result  (cost=0.00..0.26 rows=1 width=16) (actual time=11.271..11.272 rows=1 loops=1)
   Buffers: shared hit=1021
 Planning Time: 0.006 ms
 Execution Time: 11.280 ms
(4 rows)

Package +1 admission
                                       QUERY PLAN
-----------------------------------------------------------------------------------------
 Result  (cost=0.00..0.26 rows=1 width=16) (actual time=108.080..108.080 rows=1 loops=1)
   Buffers: shared hit=3264
 Planning Time: 0.007 ms
 Execution Time: 108.092 ms
(4 rows)

Email normalization lookup at 10001 users
                                            QUERY PLAN
---------------------------------------------------------------------------------------------------
 Seq Scan on users  (cost=0.00..303.47 rows=50 width=16) (actual time=1.404..6.191 rows=1 loops=1)
   Filter: (lower(btrim((email)::text)) = 'enforcement-plan-2001@example.test'::text)
   Rows Removed by Filter: 10083
   Buffers: shared hit=127
 Planning:
   Buffers: shared hit=5
 Planning Time: 0.033 ms
 Execution Time: 6.206 ms
(8 rows)

Hash normalization lookup at 10001 users
                                                               QUERY PLAN
----------------------------------------------------------------------------------------------------------------------------------------
 Seq Scan on users  (cost=0.00..2774.05 rows=50 width=16) (actual time=46.718..46.719 rows=0 loops=1)
   Filter: (account_capacity_email_key((email)::text) = 'email:c8e85a97699729f4235d3108ce3dab85a1fb1f6f736e72206882cabfdecd550f'::text)
   Rows Removed by Filter: 10084
   Buffers: shared hit=127
 Planning:
   Buffers: shared hit=5
 Planning Time: 0.316 ms
 Execution Time: 46.738 ms
(8 rows)

Cross-owner transfer RPC including both locks and continuity
                                                              QUERY PLAN
--------------------------------------------------------------------------------------------------------------------------------------
 ProjectSet  (cost=8.29..13.56 rows=1000 width=32) (actual time=206.903..206.905 rows=1 loops=1)
   Buffers: shared hit=16402
   InitPlan 1
     ->  Index Scan using clients_user_id_idx on clients  (cost=0.28..8.29 rows=1 width=16) (actual time=0.008..0.008 rows=1 loops=1)
           Index Cond: (user_id = 'a0410000-0000-4000-8000-000000000002'::uuid)
           Buffers: shared hit=3
   ->  Result  (cost=0.00..0.01 rows=1 width=0) (actual time=0.001..0.001 rows=1 loops=1)
 Planning Time: 0.087 ms
 Execution Time: 206.929 ms
(9 rows)

INSERT 0 1
Two-dimension lead conversion RPC including reservations and consumption
                                           QUERY PLAN
------------------------------------------------------------------------------------------------
 ProjectSet  (cost=0.00..5.27 rows=1000 width=32) (actual time=585.630..585.631 rows=1 loops=1)
   Buffers: shared hit=41718
   ->  Result  (cost=0.00..0.01 rows=1 width=0) (actual time=0.000..0.001 rows=1 loops=1)
 Planning Time: 0.014 ms
 Execution Time: 585.653 ms
(5 rows)

ROLLBACK

```

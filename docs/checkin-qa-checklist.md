# Check-in QA Checklist

Use this checklist for the final Repsync check-in MVP hardening pass.

## 1. PT template setup

- Create a new template in `/pt/checkins/templates`.
- Add at least one question of each supported type:
  - text
  - number
  - scale
  - choice
  - yes/no
- Mark a mix of questions required and optional.
- For a choice question:
  - add multiple options
  - edit an option
  - confirm the client renderer shows the updated options
- Reorder questions and confirm the client check-in page respects the saved order.
- Duplicate a template and confirm the duplicate keeps the original question structure.
- Activate/deactivate templates and confirm inactive templates are not used as fallback defaults.

## 2. PT assignment and cadence

- In PT client detail, assign a client-specific template override.
- Confirm the assignment summary clearly reflects:
  - client override
  - workspace default
  - latest active fallback
- Set each cadence separately and confirm the next due date preview is grounded:
  - weekly
  - biweekly
  - monthly
- Use a non-Saturday start date and confirm the stored/surfaced due date normalizes to the canonical week-ending Saturday.

## 3. Client submission flow

- Open `/app/checkin` for a client with an upcoming check-in and confirm the header state says `Upcoming`.
- Open `/app/checkin` on the due date and confirm the header state says `Due`.
- Leave an overdue check-in unsubmitted and confirm `/app/checkin` opens that overdue instance instead of skipping ahead.
- Confirm required question types behave correctly:
  - text requires non-empty text
  - number requires a number
  - scale requires a score
  - choice requires an option
  - yes/no requires a selection
- Try submitting without the required front/side/back photos and confirm submission fails.
- Submit a complete check-in and confirm:
  - success toast appears
  - the row locks
  - refresh keeps the check-in locked
  - coach feedback, once added, appears on the client page

## 4. Reminders

- For an overdue open check-in, confirm the client reminders card shows an overdue reminder.
- For a due-today open check-in, confirm the reminders card shows a due reminder.
- For an upcoming check-in inside the 3-day window, confirm the reminders card shows the upcoming reminder.
- Confirm reminders do not depend on a missing row; they should still appear after reconciliation with the shared due-state model.

## 5. PT review workflow

- Open `/pt/checkins` and confirm all operational buckets behave as expected:
  - Upcoming
  - Due
  - Overdue
  - Submitted
  - Reviewed
- From PT client detail:
  - open a submitted check-in
  - save a draft review
  - confirm the draft save message appears
  - mark the check-in reviewed
  - confirm reviewed metadata appears
- Confirm reviewed rows deep-link correctly from:
  - PT queue
  - PT calendar
- Confirm a reviewed check-in stays in the reviewed state after refresh.

## 6. Queue, dashboard, and calendar consistency

- Compare the same client/check-in across these surfaces:
  - `/pt/checkins`
  - `/pt/dashboard`
  - `/pt/calendar`
- Confirm the same due-state is shown everywhere for:
  - upcoming
  - due
  - overdue
  - submitted
  - reviewed
- Confirm the dashboard `Check-ins today` stat only counts due-today unsubmitted rows.
- Confirm dashboard `Upcoming Check-ins` excludes already submitted/reviewed rows.

## 7. Onboarding first check-in

- Complete onboarding with a first check-in template/date configured.
- Confirm:
  - `workspace_client_onboardings.first_checkin_template_id` is populated
  - `workspace_client_onboardings.first_checkin_date` matches the canonical normalized due date
  - `workspace_client_onboardings.first_checkin_scheduled_at` is populated
- Confirm the first actual check-in row exists or is immediately available after reconciliation.
- Confirm the first check-in appears consistently in:
  - client reminders
  - client `/app/checkin`
  - PT queue
  - PT dashboard
  - PT calendar

## 8. DB and security validation

- Run the local DB validation commands once Docker / local Supabase is available:
  - `npm run supabase:db:reset`
  - `npm run supabase:db:lint`
- After reset, verify server-side submission blocking:
  - missing required answers fail
  - missing required photos fail
- Verify post-submit immutability on the server side:
  - client cannot mutate the submitted check-in row
  - client cannot mutate submitted answers/photos
  - PT can still save review fields as intended

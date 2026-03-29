# Onboarding QA Checklist

Use this checklist for the final onboarding MVP pass before release.

## Client flows

- Direct invite:
  - Accept invite and confirm the client lands in `/app/onboarding` or sees the workspace soft gate immediately after join.
  - Confirm the onboarding row is created for the workspace/client relationship.
- Converted lead:
  - Convert a lead into a client and confirm the client sees onboarding entry/resume state on first workspace load.
- Draft save and resume:
  - Fill Basics and Goals.
  - Leave onboarding and return from `/app/home`.
  - Confirm progress, saved answers, and resume step are preserved.
- Baseline integration:
  - Enter onboarding Initial Assessment.
  - Start a baseline draft, leave, and return.
  - Submit the baseline and confirm onboarding returns to the assessment step with completion shown.
  - Confirm a baseline draft alone does not mark the onboarding step complete.
- Client soft gate:
  - Confirm incomplete onboarding shows the compact soft gate in client layout.
  - Confirm client home reminders show onboarding action/waiting state instead of the old standalone baseline reminder.
  - Confirm check-in empty states point back to onboarding while activation is still pending.
- Submit onboarding:
  - Complete all intake steps plus submitted baseline.
  - Submit onboarding and confirm status moves to `review_needed`.
  - Confirm onboarding becomes read-only for the client and prompts switch to waiting-state copy.

## PT flows

- Roster and dashboard visibility:
  - Confirm PT clients list and PT dashboard both show onboarding badges for invited, in progress, review needed, submitted, and completed states.
  - Confirm legacy clients gain onboarding rows/status when surfaced through PT workspace views.
- Review:
  - Open a submitted onboarding from client detail.
  - Verify intake sections, baseline summary, notes, checklist, and current status all render together.
- Program assignment:
  - Assign the first program from client detail/onboarding flow.
  - Confirm `workspace_client_onboardings.first_program_template_id` and `first_program_applied_at` update.
- Check-in scheduling:
  - Set the first check-in template/date.
  - Confirm `workspace_client_onboardings.first_checkin_template_id`, `first_checkin_date`, and `first_checkin_scheduled_at` update.
- Completion:
  - Complete the checklist and run the PT complete action.
  - Confirm status becomes `completed`, timestamps populate, and stable intake fields sync into `public.clients`.

## Legacy handling

- Existing client without onboarding row:
  - Open the client from PT roster or dashboard and confirm an onboarding row is ensured.
  - If the client already has a submitted baseline plus existing operational setup, confirm the row backfills to a grounded activation/completion state instead of blindly starting at invited.
  - If the client lacks grounding data, confirm the row remains incomplete without blocking current workspace access.

## Regression checks

- Confirm client home no longer shows the old baseline-only prompt.
- Confirm completed onboarding removes client soft-gate prompts/reminders.
- Confirm invite acceptance, baseline submission, onboarding submit, PT review, and PT completion all invalidate/refetch the right surfaces.

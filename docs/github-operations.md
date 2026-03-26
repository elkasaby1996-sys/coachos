# GitHub Operations Guide

This document describes the recommended GitHub label, milestone, and release hygiene for CoachOS.

## Label Taxonomy

Create these labels in GitHub and keep them consistent:

### Change Type

- `feature` for user-facing product additions
- `bug` for defects and regressions
- `refactor` for structural internal improvements
- `chore` for low-risk maintenance tasks
- `dependencies` for package and action upgrades

### Area

- `ui` for interface and design-system changes
- `db` for Supabase schema, policies, or SQL changes
- `ops` for release, CI, infra, and operational changes
- `security` for auth, secrets, permissions, and vulnerability work

### Delivery State

- `needs-review` for work ready for review
- `blocked` for work waiting on a dependency or decision
- `breaking` for changes that need explicit rollout coordination

## Milestone Scheme

Use milestones for release planning rather than as a catch-all backlog.

Recommended milestone patterns:

- `Launch Readiness`
- `Post-Launch Stabilization`
- `Q2 2026`
- `PT Hub Iteration`
- `Workspace Polish`

Keep milestones reserved for:

- release windows
- major product initiatives
- focused hardening periods

## Pull Request Labeling

Every PR should ideally have:

- one change-type label
- one area label when relevant
- `breaking` if rollout coordination is needed

Examples:

- a Supabase policy fix: `bug`, `db`, `security`
- a dashboard polish pass: `feature`, `ui`
- a workflow cleanup: `chore`, `ops`

## Release Drafter Expectations

Release Drafter groups merged PRs by labels. To keep draft releases useful:

- label PRs before merge
- use `breaking` deliberately
- avoid unlabeled maintenance PRs whenever practical

## Suggested Branch Protection Pairing

For `main`, combine this taxonomy with:

- required PR review
- required status checks
- required conversation resolution
- production environment reviewer approval

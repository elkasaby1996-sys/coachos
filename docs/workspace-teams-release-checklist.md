# Workspace Teams Release Checklist

Use this checklist before enabling Workspace Teams / Shared Workspace Access in production.

## Happy Path

- [ ] Owner opens Workspace Settings -> Team & Permissions.
- [ ] Owner invites a coach or assistant by email.
- [ ] Pending invite appears in Workspace Settings and no active workspace membership exists yet.
- [ ] Invitee opens `/team-invites/:token` while signed out.
- [ ] Invitee signs in or signs up using the invited email.
- [ ] Invitee accepts the invite.
- [ ] Membership is created only after acceptance.
- [ ] Shared workspace appears in PT Hub as `Shared workspace · {Role}`.
- [ ] Invitee opens `/workspace/:workspaceId`.
- [ ] Invitee sees only permitted clients.

## Edge Cases

- [ ] Wrong signed-in account cannot accept the invite.
- [ ] Expired invite cannot be accepted.
- [ ] Revoked invite cannot be accepted.
- [ ] Already accepted invite cannot create a duplicate membership.
- [ ] Old token after resend fails.
- [ ] Pending invite never grants workspace access.
- [ ] Suspended member loses access on the next request/navigation.
- [ ] Removed member loses access on the next request/navigation.
- [ ] Assigned-only member with no assignments sees no clients.
- [ ] Assigned-only member cannot open an unassigned client by direct URL.
- [ ] Viewer can read assigned clients but cannot write.

## PT Hub And Settings Architecture

- [ ] Team & Permissions lives under Workspace Settings top tabs.
- [ ] PT Hub shows owned and active shared workspaces.
- [ ] PT Hub does not expose team-management controls.
- [ ] Workspace switcher includes active shared workspaces and hides inactive memberships.
- [ ] No duplicate settings sidebar or duplicate team settings concept was introduced.

## Security And Data

- [ ] Raw invite token is never stored.
- [ ] Raw invite token is never logged.
- [ ] `token_hash` is never exposed in API/UI responses.
- [ ] Audit metadata contains no raw token, full invite URL, token hash, auth/session token, payment data, private message content, or full client payload.
- [ ] Invite emails do not include client names.
- [ ] Client list, search, counts, detail, message picker, message send, and write endpoints are backend/RLS gated.
- [ ] Lifecycle, risk, onboarding, or generic client status values are not used as team access logic.

## Audit And Notifications

- [ ] Audit event is created for invite created, accepted, mismatch, resent, and revoked.
- [ ] Audit event is created for role change, client assignment/unassignment, suspend, reactivate, and remove.
- [ ] Invite received email is queued/sent and says the recipient must sign in or create an account with the invited email.
- [ ] Invite accepted notification goes to the workspace owner and inviting admin when appropriate.
- [ ] Bulk client assignments create one summarized notification.
- [ ] Notification failure is logged safely and does not roll back successful business state.

## Migration And Compatibility

- [ ] Migrations apply cleanly on a clean local database.
- [ ] Migrations apply cleanly on a representative existing database.
- [ ] Existing workspace owners still access owned workspaces without `workspace_members` owner rows.
- [ ] Existing owned workspaces still appear in PT Hub.
- [ ] Existing owner client lists still work.
- [ ] Existing lifecycle/risk behavior is unchanged.

## Rollout

- [ ] If a feature-flag framework is introduced, gate with `workspace_teams_enabled`.
- [ ] Optional sub-flags, only if the repo convention supports them: `workspace_team_invites_enabled`, `workspace_shared_workspaces_pt_hub_enabled`, `workspace_team_client_assignments_enabled`.
- [ ] Monitor invite creation errors, wrong-account attempts, notification failures, and suspended/removed access attempts.

## Rollback

- [ ] Disable the feature flag first if one exists.
- [ ] Do not delete accepted memberships.
- [ ] Do not remove owner access or rely on destructive table drops.
- [ ] Preserve audit, member, invite, assignment, and notification delivery data.
- [ ] If UI must be hidden, leave backend permission checks and RLS in place.

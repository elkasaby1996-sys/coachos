# Workspace branding

Workspace owners and admins manage branding in **Workspace settings**:

- **General:** upload/remove a logo; choose/reset an accent colour and inspect the preview.
- **Client Experience:** set a welcome title and copy, plus an invite sender display name. Empty sender names fall back to the workspace name. Empty welcome title and copy hide the banner.

Branding appears in workspace and client headers, client home/onboarding, and valid client invite pages. Accent shades adjust for contrast in light/dark mode. Workspace logos use the public `workspace_branding` bucket with manager-only uploads and a 5 MB PNG/JPG/WebP limit.

Migration: `20260909120000_workspace_branding.sql`. Apply locally with `npm run supabase:migration:up -- --local`. No remote deployment is part of this change.

## Invitation email integration

Client invitations currently generate shareable links. Team invitations use the existing `workspace_team_email_deliveries` queue. New queued invitations and resends snapshot `senderName`, `senderMode: platform_no_reply`, `workspaceLogoUrl`, and `accentColor` in `template_model`. `ownerName` is also populated with the display identity for compatibility with existing templates. The browser-side invite email builder returns the same sender metadata.

The outbound delivery adapter must use `senderName` with the platform's configured, verified no-reply mailbox. The mailbox is deployment configuration, not a workspace-editable email address. This feature does not add an outbound email worker or change Supabase Auth emails; existing delivery infrastructure must consume the queued identity. No emails are sent during branding saves or previewing.

## Verification

- `npx vitest run tests/unit/workspace-branding.test.ts`
- Run `supabase/tests/workspace_branding.sql` against the local database: its transaction rolls back all fixtures and covers constraints, cross-account write denial, logo uploads, invite validity, and queued sender identity.

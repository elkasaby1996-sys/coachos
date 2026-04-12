# Client Homepage Reroute + Existing Homepage Audit (2026-04-09)

## Goal
Document what the current reroute logic does, what exists in the current client homepage, and what legacy/old homepage surfaces still exist so redesign can happen on top of accurate behavior.

## Source files reviewed
- `src/routes/app.tsx`
- `src/lib/auth.tsx`
- `src/components/layouts/client-layout.tsx`
- `src/pages/client/home.tsx`
- `src/features/lead-chat/components/client-lead-dashboard.tsx`
- `src/features/lead-chat/lib/invite-join-context.ts`
- `src/pages/public/invite.tsx`
- `src/pages/public/no-workspace.tsx`
- `src/pages/NoWorkspace.tsx` (legacy)
- `src/routes/lazy-pages.ts`
- `src/lib/use-workspace.ts`
- `src/components/ClientOnlyRoute.tsx` (legacy guard)
- `src/components/PTOnlyRoute.tsx` (legacy guard)

## 1) Current reroute behavior (canonical flow)

### 1.1 Authenticated landing
- `/` goes to `IndexRedirect` in `src/routes/app.tsx`.
- `IndexRedirect` uses `bootstrapPath` from auth bootstrap.
- If bootstrap not resolved, full-page loader is shown.

### 1.2 Redirect logic in auth bootstrap
`getAuthenticatedRedirectPath` in `src/lib/auth.tsx` currently resolves:
- PT:
  - Incomplete PT workspace -> `/pt/onboarding/workspace`
  - Otherwise -> `/pt-hub`
- Client:
  - Incomplete account -> `/client/onboarding/account` (keeps invite token query if present)
  - Complete account + no workspace membership -> `/app/home`
  - Complete account + workspace membership -> `/app/home`
- Unknown fallback:
  - Uses signup intent when available
  - Final fallback still returns `/no-workspace`

### 1.3 Route guard behavior (`RequireRole` in `src/routes/app.tsx`)
- PT account:
  - If PT workspace incomplete -> force `/pt/onboarding/workspace`
  - If route does not allow PT -> `/pt-hub`
- Client account:
  - If client account incomplete -> `/client/onboarding/account` (+ invite query if present)
  - If no workspace membership:
    - `/app/home` is allowed
    - Any other client route redirects to `/app/home`
  - If workspace onboarding hard gate required:
    - Non-home/non-onboarding routes redirect to `/app/onboarding`
  - If route disallows client -> `/app/home`
- Unknown account type -> `/no-workspace`

### 1.4 Client shell-level reroute
`ClientLayout` adds another safety redirect:
- `preWorkspaceMode = !hasWorkspaceMembership`
- In pre-workspace mode, any `/app/*` path other than `/app/home` redirects to `/app/home`.
- Sidebar/nav in pre-workspace mode is reduced to Home only.

### 1.5 Workspace bootstrap behavior for no-membership client
In `src/lib/use-workspace.ts`:
- If account is client and has no workspace membership:
  - clears workspace state
  - removes cached active workspace id
  - does not block auth/app flow
- This supports dashboard access without workspace membership.

## 2) Current client homepage (`/app/home`)

`ClientHomePage` in `src/pages/client/home.tsx` is now a mode switch:

- If `hasWorkspaceMembership === true`:
  - renders `ClientWorkspaceHomePage` (the existing full client workspace dashboard experience).
- If `hasWorkspaceMembership === false`:
  - renders `ClientLeadDashboard` (pre-workspace lead dashboard with lead chat).

It also contains post-invite informational modal logic.

### 2.1 Workspace member mode (`ClientWorkspaceHomePage`)
This is the existing rich client dashboard (not removed), including:
- Training summary and workout state
- Nutrition summary and targets
- Daily checklist
- Calendar/week plan cards
- Coach activity/reminders integration
- Links to workout, habits, profile, messages, nutrition

So the original client-home functionality is preserved for users with workspace membership.

### 2.2 No-workspace mode (`ClientLeadDashboard`)
Pre-conversion dashboard surface for lead users:
- Left rail list of lead conversations
  - unread badge
  - last message preview
  - last activity time
- Main thread view with message history
- Composer only when lead chat is writable
- Archived chats are read-only

This is intentionally separate from workspace chat.

### 2.3 Invite-join modal on home
`ClientHomePage` opens an informational modal when invite acceptance sets query params and workspace membership exists:
- Uses `deriveInviteJoinContext(...)`
- Safe fallback values are built in:
  - workspace name fallback: `"your coaching workspace"`
  - neutral fallback message when PT display name missing

## 3) Invite-route behavior relevant to homepage

In `src/pages/public/invite.tsx`:
- Invite is verified via RPC.
- If logged-in user is eligible and invite is accepted:
  - joins workspace via `accept_invite`
  - patches bootstrap to client-with-workspace
  - navigates deterministically to:
    - `/app/home?invite_joined=1&...context`
- `/app/home` then shows the informational modal from that context.

## 4) Old / legacy homepage surfaces still in repo

### 4.1 Active compatibility route: `/no-workspace`
- Route remains in `src/routes/app.tsx`.
- Active page file is `src/pages/public/no-workspace.tsx` (confirmed in `src/routes/lazy-pages.ts`).
- Current behavior: for modern client states, it redirects to `/app/home`.
- It still supports invite-token manual entry, so it acts as compatibility fallback.

### 4.2 Legacy unused no-workspace page
- `src/pages/NoWorkspace.tsx` still exists but is legacy.
- It uses old auth provider (`../providers/AuthProvider`).
- It is not wired by the lazy route map and should be treated as historical/cleanup candidate.

### 4.3 Legacy route guard components
- `src/components/ClientOnlyRoute.tsx`
- `src/components/PTOnlyRoute.tsx`
- Both use the old `providers/AuthProvider` path and are not part of the canonical app router in `src/routes/app.tsx`.
- `PTOnlyRoute` still sends role `none` to `/no-workspace`, which is legacy logic.

## 5) Reroute matrix (quick reference)

| User state | Primary destination |
|---|---|
| Unauthenticated | `/login` |
| PT, workspace incomplete | `/pt/onboarding/workspace` |
| PT, workspace complete | `/pt-hub` |
| Client, account incomplete | `/client/onboarding/account` |
| Client, account complete, no workspace | `/app/home` (lead dashboard mode) |
| Client, account complete, with workspace | `/app/home` (workspace dashboard mode) |
| Unknown fallback | `/no-workspace` (legacy compatibility path) |

## 6) What this means for redesign planning

### Stable constraints
- `/app/home` is now the unified client entry point.
- Home has two functional modes:
  - workspace dashboard mode
  - lead dashboard mode
- `/no-workspace` should be treated as compatibility fallback, not primary UX.

### Redesign implication
- Redesign can target a single home route (`/app/home`) with explicit mode-aware layout/content.
- Keep invite success modal contract and fallback handling.
- Preserve current behavior: no-workspace users must remain functional through lead dashboard mode.


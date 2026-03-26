# Security Policy

## Supported Branch

Security fixes should target `main` unless a different release branch is explicitly in use.

## Reporting A Vulnerability

Please do not open public GitHub issues for sensitive vulnerabilities.

Instead:

1. Email the maintainer or security contact directly if you have one established.
2. If email is not available, open a private GitHub security advisory in this repository.
3. Include clear reproduction steps, affected areas, and any known impact.

Please include:

- a short description of the issue
- the affected route, workflow, or schema area
- severity or impact estimate
- reproduction steps
- whether secrets, auth, or data exposure are involved

## Sensitive Areas In This Repo

Extra care is required for:

- `supabase/migrations`
- auth and session handling
- RLS policies and security definer functions
- GitHub Actions secrets and deploy workflows
- any code touching public profile publication, invites, or notifications

## Response Expectations

Reported issues should be:

- acknowledged as soon as practical
- triaged for severity and exploitability
- fixed privately when necessary
- disclosed responsibly after mitigation

## Secret Hygiene

If a secret is exposed:

1. rotate it immediately
2. update GitHub environment or repository secrets
3. remove it from logs or follow-up documentation where possible
4. evaluate whether dependent credentials should also be rotated

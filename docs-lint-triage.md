# Lint Warnings Triage (Non-Blocking)

Current state: lint has warnings only, no errors.

## Buckets

1. `react-hooks/exhaustive-deps`
   - Missing dependencies in `useEffect` / `useMemo`
   - Risk: stale closures, subtle runtime drift

2. `react-refresh/only-export-components`
   - Component files exporting utilities/constants
   - Risk: degraded Fast Refresh behavior in dev

3. `unused eslint-disable` comments
   - Suppression comments no longer needed
   - Risk: stale suppression noise

## Suggested rollout

1. Remove unused `eslint-disable` comments first.
2. Fix high-risk hook dependency warnings in auth/messaging/check-in flows.
3. Split mixed utility/component files for refresh warnings.
4. After cleanup, consider turning `react-hooks/exhaustive-deps` to `error`.

## Tracking

- Keep this file updated per warning bucket count.
- Treat warning count trend as release quality metric.

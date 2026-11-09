# Paddle configuration readiness

The `Ahmed-billing` implementation supports sandbox and production configuration, initial plan-plus-seat purchases, a merchant checkout page, and Paddle customer portal sessions. See [Paddle billing setup](paddle-billing.md) for configuration names, catalogue, deployment sequence, and operating limits. This supersedes the earlier sandbox-only implementation assessment.

Local code and synthetic tests do not establish account readiness. No Paddle credentials, real price bindings, approved merchant domain, notification destination, or named remote deployment were supplied in this cloud environment. Real-provider certification remains **not run**. Remote evidence must be refreshed against this branch's artifact and migrations.

The database realm, server realm, credentials, frontend token, and catalogue binding must agree. Sandbox uses `test` database authority and `sandbox` Paddle configuration; production uses `live` and `production`. Do not reuse a project containing sandbox paid authority as a production project.

# Supabase v2.109.1 migration-list fixtures

These fixtures reproduce the structural shape of privately captured stdout from
`supabase migration list --linked` using CLI v2.109.1 during the read-only diagnosis
of run 35000721926. They are constructed fixtures, not remote-state evidence.

The captured root has exactly `migrations` (an array) and `message` (a string).
Every captured migration row has exactly `local`, `remote`, and `time` strings.
Local versions contain 14 decimal digits. The captured unapplied remote value is
the empty string; null and absent version fields were not observed and are rejected.
Times use `YYYY-MM-DD HH:mm:ss` display formatting. The message is display-only.

The fixtures use the first three approved repository migration versions, derive
their display timestamps from those versions, and replace the message with fixed
synthetic text. No raw connection information, project reference, credentials,
user data, or provider identifiers are copied from the capture.

- `empty`: reproduces the observed unapplied state with three representative rows.
- `one`: synthesizes one matching local/remote version within the same row shape.
- `prefix`: synthesizes three matching ordered local/remote versions.

JSON rows must be strictly increasing by local version, with no duplicate remote
versions or local/remote disagreement. Only remote versions are returned, in CLI
order. The unchanged history validator separately checks exact authorization
equality and membership in the exact approved manifest prefix.

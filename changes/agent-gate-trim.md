Landing stops failing on housekeeping. `lane:close` runs `bun run gen` before `verify:fast`, so a stale export manifest, api.md, capability index or games ledger is rewritten and committed instead of refusing the lane (21 of the failed landings on Oct 25 were this). Four checks leave `verify:fast` and CI and stay available by name: `fixture-location`, `orphan-ratchet`, `skills` and `script-help` only ever failed lanes over where a test put a temp file, a baseline count, duplicated skill prose or a missing `--help`.

Prevention: none - tooling change, covered by the lane:close tests.

### Changed

- `bun run lane:close` regenerates derived files first; `--skill-api` is no longer passed to `verify:fast` there.
- `bun run check fixture-location|orphan-ratchet|skills|script-help` run only when named.

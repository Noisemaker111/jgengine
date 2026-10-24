### Fixed

- `lane:close` reads `calls` as the count it is, takes waits from a new `waits` list in `lane:audit --json`, and refuses an unfamiliar audit shape with `the audit output shape changed: <field> is <type>, expected <type> (keys seen: …)` instead of a TypeError. Exit codes unchanged: a sleep or CI watch is 2, `--waive` records the reason, no percentage thresholds.

Root cause: `lane:audit --json` had always reported `calls` as a number, while `lane:close` held it as a list of call objects; nothing read the real document until lane attribution started returning a lane, so the gate that judges a finishing lane crashed on the first lane that had one.

Before: `lane:close` landed the PR, then died with `source.filter is not a function` at `waitingGate`.
After: the same captured output is judged, the waits are listed, and the lane gets exit 2 with a report skeleton.

Verification:
- `bun test scripts/lane-audit.test.ts scripts/lane-close.test.ts` — pass, including the captured-output fixture
- `bun run verify:fast` — pass

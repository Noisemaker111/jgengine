### Added

- `bun run check:path-portability` fails a test that asserts one platform's path separator: a `\\` literal under `toContain`/`toEqual`/`toBe`/`includes`/`endsWith`, a bare `toContain("/")`, a POSIX root handed to `join`/`resolve`, or a literal compared with an OS path result. It reports the file, the line and the `join(...)` that replaces it. A genuinely single-platform assertion is named in `scripts/path-portability-allow.json` with a reason, printed on every run. This is the class behind #2301 (`toContain("proofs\\flows")`) and the `agent-worktree.test.ts` assertions that only pass on one OS.

Verification:
- `bun test scripts/check-path-portability.test.ts` - pass, including the pre-fix `proofs\\flows` line failing through the gate and the fixed one passing
- `bun run check:path-portability` - ok, 3 allowlisted with reasons
- `bun test scripts/agent-worktree.test.ts scripts/shot-metrics.test.ts scripts/lane-audit.test.ts` - pass

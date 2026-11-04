a test edit no longer reruns the skill-api, capabilities, barrels, export-manifest, games-ledger, part-stats and skill-routing generators or the doc-symbols gate, none of which read test files (a run-stages row says so with skipsTests)

Root cause: retries repeated work in three places: generator and gate cache keys counted test files they never read, fail-fast killed running test batches and dropped their results, and a failed batch remembered none of its passing files

### Fixed

- a test edit no longer reruns the skill-api, capabilities, barrels, export-manifest, games-ledger, part-stats and skill-routing generators or the doc-symbols gate, none of which read test files (a run-stages row says so with skipsTests)
- when one test fails, the test batches already running finish instead of being killed, so the next run reuses their passes
- a failed test batch still records every file in it whose own tests passed, read from its junit report, so the retry reruns only the failing file
- tarballInstall.test runs only when every package's dist is fresh; it used to pack a stale dist on every engine lane in a worktree that had built once, 35 to 230 s that proved nothing about the change (CI builds right before it, so it still runs there)

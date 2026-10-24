### Fixed

- A Playwright test file's `beforeAll` now outlives the Chrome launch it waits on, and `browser-test-budget` rejects a file that leaves the hook at or under Playwright's 30 s launch default. On `test (g)` in #2326 the hook's 30 s budget and that default expired together, so CI reported only `(unnamed) hook timed out` beside `killed 1 dangling process` and nothing named the launch.
- `packages/react/src/dialogBehavior.test.ts` gives its browser navigation its own 20 s deadline and one retry inside a 60 s hook.

Root cause: Bun prints a `beforeAll` timeout as an unnamed hook timeout, so a setup budget equal to Playwright's own 30 s launch default reports the anonymous timer instead of the launch that stalled.

Before: `test (g)` on #2326 reported `(fail) (unnamed) [30001.51ms] ^ a beforeEach/afterEach hook timed out` and `killed 1 dangling process`.
After: a stall now surfaces as Playwright's own `Timeout ... exceeded`, and `bun scripts/browser-test-budget.ts` names any file whose setup hook sits at or under the launch default.

Verification:
- `bun scripts/browser-test-budget.ts` - pass, and the new rule names the unraised files on the previous tip
- `bun test scripts/browser-test-budget.test.ts` - pass
- `bun test packages/react/src/dialogBehavior.test.ts packages/react/src/scrollRail.test.ts packages/shell/src/settingsBoundary.test.ts` - pass
- `bun run verify:fast` - pass

Landing fails fast: lane:close runs bun run preflight (install, gen, type-checks and gates) first and stops at the first failure, before any test runs

### Changed

- Landing fails fast: lane:close runs bun run preflight (install, gen, type-checks and gates) first and stops at the first failure, before any test runs
- bun run preflight is that cheap check on its own; preflight --ship is gone
- verify:fast starts type-checks and gates before tests and stops starting tests after a failure; --cheap runs only the type-checks and gates
- bun run gen runs independent generators side by side, and gen barrels reads core's surface once instead of five times
- lane:close starts the queue for its PR in the background and names the one command that prints the outcome

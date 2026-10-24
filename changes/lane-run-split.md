### Added

- `createSessionLoop` (`@jgengine/core/run/sessionLoop`) is one session loop for every game: a session opens, may carry a quantity, closes at its boundary, and the game's own `settle` callback decides what happens to what it carried. `carries: false` for a session with nothing at stake, and an optional `offers` table (with `present`/`choose`) for a game whose next session opens with an authored change; without a table nothing is drawn. `installSessionProbe` reports the live session on `window.__jgengineRun`.

### Changed

- `createRunLoop` is now a thin composition of `createSessionLoop` and is deprecated: bank-or-lose and a per-run change table are one game type's rules, so they live in the composition instead of the base. Its API, state shape and tests are unchanged. One difference: the option draw is seeded under `offer` rather than `run`, so a career that keeps its seed can see a different change on a given run than it would have on 0.37.0. Saved `changeId`s stay valid.

### Migrate

- Composing a session loop directly: pass your rule as `settle`, `carries: false` when nothing is carried, and your authored options as `offers`. `createRunLoop` is removed one minor release after Beacon Bastion and Drift Foundry stop using it.

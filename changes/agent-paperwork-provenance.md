Asset credits are recorded once, on the asset's metadata, and a game with a build plan states its gap to target there. `games/CONTENT-PROVENANCE.md` no longer copies each library model's author, license and page into a table; it points at the metadata the in-game credits are built from. `check games-design` accepts a game's `PLAN.md` `## Gaps` section in place of the README's "Gap to target".

### Added

- `PLAN_GAPS_HEADING` (`jgengine/plan/plan`): the generated `## Gaps` heading of a game's `PLAN.md`.

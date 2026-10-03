### Added

- `validateQuestCatalog` (`@jgengine/core/game/questCatalog`) checks authored quest ids, references, quantities, and blocked prerequisite dependencies with explicit external unlock and quest-start declarations, optional caller catalog lookups, and located error/warning diagnostics. The `quest-authoring` CLI recipe validates bounded generated batches against caller-owned canonical facts.

- Snapshot and freeze reviewed authoring inputs across async generation so caller or generator mutation cannot replace canon, catalog references, or batch limits.

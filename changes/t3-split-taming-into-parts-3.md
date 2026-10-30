ARK knockout taming (taming/knockoutTaming.ts); added subdual/subdualFeeding.ts, a general part for winning over a creature by keeping it subdued and feeding it, built on the meter, curve and requirement parts

Refs #2817

Engine seam: packages/core/src/subdual/subdualFeeding.ts, packages/core/src/taming/knockoutTaming.ts

### Migrate

- createKnockoutTaming, TamingFeeder and TamingState are gone; use createSubdualFeeding, FeedingSupply and SubdualFeedingState and pass your own capacity, drain, foods and costs

### Added

- `createSubdualFeeding` (`@jgengine/core/subdual/subdualFeeding`): Track subdual, feeding and quality for every creature the caller names. Also `FeedingDose`, `FeedingFood`, `FeedingSupply`, `SubdualFeeding`, `SubdualFeedingConfig`, `SubdualFeedingEvent`, `SubdualFeedingState`.

### Fixed

- Fernwild owns its taming numbers and food rows in data/taming.ts; old creature saves start fresh (save key fernwild.creatures2)

### Removed

- ARK knockout taming (taming/knockoutTaming.ts); added subdual/subdualFeeding.ts, a general part for winning over a creature by keeping it subdued and feeding it, built on the meter, curve and requirement parts
- `@jgengine/core/taming/knockoutTaming` no longer exports `KnockoutTaming`, `KnockoutTamingConfig`, `Narcotic`, `TamingEvent`, `TamingFeeder`, `TamingFood`, `TamingState`, `bonusLevels` and 5 more.

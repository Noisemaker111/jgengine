the second, ARK-only breeding system (game/breeding.ts) and every ARK stage name and number from breeding/breeding.ts

Refs #2817

Engine seam: packages/core/src/breeding/breeding.ts, packages/core/src/game/breeding.ts, packages/core/src/game/clipRoles.ts

### Migrate

- game/breeding.ts is gone; BabyStage, babyStage, mode, eggHealthSeconds and multiples are gone from breeding/breeding.ts; pass stages, a litter(rng) callback and a conceive callback (use inheritValues) to createBreedingField; saved babies are offspring and imprint is bond

### Added

- simple dog breeding needs only inheritValues and a tierAt stage list; a test shows it
- `BreedingEggSpec` (`@jgengine/core/breeding/breeding`): An egg's temperature band in °C, inclusive, and the seconds it survives out of that band before it is lost. Also `BreedingOffspring`.

### Fixed

- Fernwild owns its baby-to-adult stages, timings, incubation bands and litter odds; old breeding saves start fresh (save key fernwild.breeding2)

### Removed

- the second, ARK-only breeding system (game/breeding.ts) and every ARK stage name and number from breeding/breeding.ts
- `@jgengine/core/breeding/breeding` no longer exports `BabyStage`, `BreedingBaby`, `babyStage`.
- `@jgengine/core/game/breeding` no longer exports `BreedConfig`, `BreedResult`, `Genome`, `ImprintBonusConfig`, `IncubationConfig`, `IncubationState`, `MaturationStage`, `MutationEvent` and 8 more.

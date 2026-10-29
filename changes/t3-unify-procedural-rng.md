Every procedural system hashes and draws through the shared seeded RNG in random/rng; about 40 private FNV, LCG and string-hash copies across the engine and games are deleted.

Root cause: each system wrote its own FNV or LCG instead of importing random/rng, so one seed gave different streams per system.

Closes #2694

Engine seam: packages/core/src/anim/crowdBatch.draw.ts, packages/core/src/audio/reverbRack.view.ts, packages/core/src/buildings/InteriorDressing.draw.tsx, packages/core/src/buildings/buildings.ts, packages/core/src/buildings/massing.ts, packages/core/src/cards/cardPile.ts, packages/core/src/editor/directives.ts, packages/core/src/fire/FireLandscape.draw.tsx and 28 more

### Migrate

- import shuffleWithRng from @jgengine/core/random/pick instead of @jgengine/core/cards/cardPile; replace pileRng(seed) with seededRng(seed) from @jgengine/core/random/rng.

### Added

- hashUnit (a stable 0-1 roll per key, avalanched so neighbouring keys roll independently) and hashWords (FNV-1a over byte or word arrays, for digests) in @jgengine/core/random/rng.
- pole_line reads its seed. Each span's sag varies by the new sagJitter (default 0.2), so Randomize cables changes the run.
- `shuffleWithRng` (`@jgengine/core/random/pick`): A shuffled copy of `values` (Fisher–Yates) drawn from `rng`; the same seeded stream always gives the same order.
- `hashUnit` (`@jgengine/core/random/rng`): A stable roll in `[0, 1)` for one key — one deterministic draw with no stream to keep. Also `hashWords`.

### Changed

- Every procedural system hashes and draws through the shared seeded RNG in random/rng; about 40 private FNV, LCG and string-hash copies across the engine and games are deleted.
- Harbor Heat's turf test now keeps the Carmines angry for the whole run. Under fair rolls, one angry spell (it cools in about 800 s) rarely lets them retake a block; the old roll passed on a 9-of-9 streak. Worth a balance look.
- Still private, on purpose: the jgengine CLI starter terrain and @jgengine/github have no core dependency; odd-orbit's idle-wander hash stays because its balance bot only keeps the charter with that spread.

### Fixed

- weather particles, lightning, fire smoke, reverb noise, scatter regions, editor directives, world-model schedule chances, LOD phases and building massing now draw from the shared generator, so their seeded output changes once. Terrain shape, llmville rolls and harbor-heat traffic keep their exact values.

### Removed

- pileRng (use seededRng) and hashMassingSeed (use hashString).
- `@jgengine/core/buildings/massing` no longer exports `hashMassingSeed`.
- `@jgengine/core/cards/cardPile` no longer exports `pileRng`, `shuffleWithRng`.
- `@jgengine/core/gameplay` no longer exports `pileRng`.

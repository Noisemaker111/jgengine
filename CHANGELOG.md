# Changelog

All eight `@jgengine/*` packages are versioned in lockstep, so this one file
covers every release. Format follows [Keep a Changelog](https://keepachangelog.com);
each release **leads with a Migrate block** — the concrete steps to move a game
from the previous version onto the new APIs — because the point of a bump is to
let consumers pick up the better stuff, not just to list what moved.

Agents building on the published SDK can also read this programmatically:
`import { VERSION, CHANGELOG } from "@jgengine/core/meta/changelog"` gives the
same data as typed values, so an updater can diff its installed version against
the latest and surface the migration steps.

## Unreleased

### Added

- **Turn-based & tactics stack** — six pure, renderer-free `@jgengine/core` primitives for turn-based, grid-tactics, and card games (XCOM, BG3, Into the Breach, Slay the Spire, Marvel Snap, Tactical Breach Wizards, Divinity surfaces).
  - `@jgengine/core/turn/turnLoop` (`createTurnLoop`) — initiative machine with configurable `phases` and per-turn action-economy `pools` (`{ id, max, start? }`) that reset when a participant enters their turn; `advanceTurn`/`advancePhase`/`advanceRound`, `spend`/`canSpend`/`gain`/`refill`, and `setOrder`/`addParticipant`/`removeParticipant`. Covers both Slay-the-Spire single-energy resets and BG3's Action/Bonus/Movement/Reaction set.
  - `@jgengine/core/turn/commit` (`createCommitController`, also `turnLoop.commit`) — three commit modes: `immediate`, `simultaneous` (sealed hidden submissions → `reveal()` on `allReady()`), and `rewind` (visible `pending()` → `rewind()`/`commit()`).
  - `@jgengine/core/tactics/tacticalGrid` (`createTacticalGrid`) — tile occupancy, `reachable(from, budget)` flood-fill, `path`, and `push(id, dir, { distance, chain })` discrete knockback-to-tile with chained collisions (Into the Breach).
  - `@jgengine/core/tactics/predictiveQuery` (`predictAreaEffect`/`predictArcEffect`/`predictTiles`) — a would-this-effect-hit query for pre-commit overlays and enemy-intent telegraphs, reusing the exact AoE/LoS targeting behind `ctx.scene.entity.effect` (new shared `resolveAreaTargets` in `combat/effects`) so predictions match what the effect actually drains.
  - `@jgengine/core/tactics/snapshot` (`createSnapshotStore`, `deepClone`) — cheap, repeatable turn-undo over registered `capture()/restore()` slices (the grid, surfaces, and turn loop all qualify), with a `push()/pop()` undo stack.
  - `@jgengine/core/tactics/surface` (`createSurfaceLayer`) — a stateful tile surface layer with its own `tick(dt)` and a data-driven combination matrix (`reactions: [{ when: [a, b], result }]`) — grease+fire, water+lightning — distinct from terrain/water.
- `@jgengine/core/combat/effects` now exports `resolveAreaTargets` (+ `AreaTarget`, `AreaTargetInput`), the shared in-radius→LoS→falloff→accept targeting that both `applyEffect` and the predictive query run, guaranteeing parity by construction. No behavior change to `effect`.
### Added — card & board stack (`@jgengine/core`, `@jgengine/react`)

Pure, renderer-free primitives for card, board, and deckbuilder games — they sit **beside** the slot inventory, never replace it.

- **`@jgengine/core/cards/cardPile`** — a `cardPile` of named ordered zones (deck/hand/discard/exhaust) with seeded `shuffle`, `draw(n)` (hand limits + reshuffle-on-empty), `discard`/`exhaust`/`move`. Reuses the engine's seeded RNG (`pileRng`), so shuffles are deterministic under a seed. Slay the Spire, Balatro.
- **`@jgengine/core/cards/modifierPipeline`** — an ordered `{ source, apply(value) → value }` pipeline (`runPipeline` / `createModifierPipeline`) with an inspectable per-step `trace` (before/after/changed) for Balatro-style scoring readouts. Generic over the scored value.
- **`@jgengine/core/board/laneBoard`** — N lanes, per-side power aggregate + optional per-lane `LaneRule` modifier, with `laneOutcome`/`boardTotals`/`lanesWon`. Marvel Snap, Inscryption.
- **`@jgengine/core/board/timelineBoard`** — N slots each on an independent cooldown, `tick(dtMs)` resolving fires in expiry order (then slot index), multiple fires per slot per tick. The Bazaar auto-battlers.
- **`@jgengine/core/inventory/shapedGrid`** — a polyomino inventory variant: `Footprint` placement, `rotateFootprint`, `canPlace` overlap/bounds check, plus `gridAdjacencyQuery` (orthogonal/diagonal neighbors) feeding synergy effects, and `cellFromPoint` for pointer→cell snap. Backpack Hero, Tetris inventory.
- **`@jgengine/react/dragLayer`** — a 2-D UI-space drag/rotate/drop/snap gesture layer over the above: `useDragLayer`, headless `DraggableCard` (right-click rotate), `DropZone` (cell snap + active state), `DragGhost`.

### Migrate

- Bump every `@jgengine/*` dependency in lockstep. Additive only — no existing 0.6.0 API moved or changed.
- Optional: reach for the new `cards/*`, `board/*`, and `inventory/shapedGrid` primitives for card/deckbuilder/auto-battler games; they compose with the existing slot inventory rather than replacing it.
- `@jgengine/core/crafting/recipe` — a recipe graph primitive: `RecipeDef { inputs, outputs, seconds?, station?, stationRange?, requires? }` turns inputs + an optional required-workstation-in-range + time into outputs. `craft` / `canCraft` consume and produce on an `InventoryState` atomically (rejecting `missing-inputs` / `no-station` / `locked` / `no-output-space`); `stationSatisfied` does the range check against placed `{ catalogId, position }` stations; `createRecipeGraph` indexes recipes by `producing` / `using` / `category`. For Valheim/Enshrouded-style workbench tiers, Tarkov hideout stations, Palworld base craft. (#71)
- `@jgengine/core/economy/techTree` — a prerequisite-gated tech tree that **generalizes flat `unlocks`** rather than duplicating it: `TechNodeDef extends UnlockDef` adds `requires` (prereq ids), a `recipe` payload, and `grants`. `createTechTree(defs)` wraps `createUnlocks` and gates `unlock(userId, id)` on prerequisites, exposing `available` (frontier) and `recipes` (payloads unlocked). Flat unlocks are just nodes with no `requires`. For Once Human Memetics / Abiotic Factor branching trees. (#72)
- `@jgengine/core/crafting/production` — `productionBuilding({ inputs, outputs, rate, power? })` plus `tickProduction`, which consumes buffered inputs and emits outputs continuously through game-time `dt` (so pause/fast-forward apply for free). `feedProduction` / `drainOutput` are the buffer I/O, `advanceTransport` slides items along a conveyor path, `resolvePowerGrid` powers demands greedily against a supply. For Palworld/Satisfactory/Factorio automation. (#74)
- `@jgengine/core/crafting/crop` — a `cropTile` soil-and-growth state machine (`tillTile` / `plantCrop` / `waterTile` / `advanceCropDay` / `harvestCrop`, with regrow and daily-water rules) that advances stages on the simClock day tick, plus `applyToolToTiles(tiles, center, pattern, apply)` with `squarePattern` / `diamondPattern` / `rectPattern` for watering-can/hoe AoE under the cursor. `createCropField` wraps a tile grid; `createDayTicker` reads day rollovers off `ctx.time.calendar()`. For Stardew/Coral Island/Palia farming. (#75)
- **Survival & environment layer.** Renderer-free `@jgengine/core` primitives for survival games (Project Zomboid moodles, The Long Dark / Green Hell survival, DayZ / Tarkov per-limb health, weather-driven games, Nightingale realm cards), plus the `@jgengine/shell` fire visuals.
  - `@jgengine/core/survival/decayMeter` — named `decayMeter`s (`createDecayMeterSet`) that drain/recover on game-time `dt`, refill from consumables/actions, raise threshold moodles, and take environment-driven rate modifiers (cold speeds warmth loss, toxic biomes drop oxygen).
  - `@jgengine/core/survival/moodle` — a stacking status-effect display distinct from numeric bars: `stackMoodles(...)` folds meter/ailment/buff moodles worst-first, and `createMoodleStack()` holds timed buffs (Valheim-style concurrent food buffs) that expire on `tick(dt)`.
  - `@jgengine/core/survival/regionHealth` — a multi-region health component (`createMultiRegionHealth`): per-part pools with vulnerability + vital death, a stacking ailment queue (bleed/fracture) that drains over time, and per-injury treatment items (`treat("bandage")`). Shares the moodle display via `ailmentMoodles()`.
  - `@jgengine/core/world/envField` — sampleable environment fields (`createEnvironmentField`): temperature, wetness, light-exposure, and ambient-light at any world position and time, with sky occluders, heat sources, and a day/night sun cycle. Meters and spawn gating read it renderer-free.
  - `@jgengine/core/world/weather` — weather → gameplay modifiers (`resolveWeather` → grip/visibility/structure-damage/chill/ignition/spread) over a game-owned table, plus a **coarse cellular** fire-spread grid (`createFireGrid`, not a fluid solver): wind-biased propagation, fuel burn-through, firebreaks, and rain/wetness suppression.
  - `@jgengine/core/world/realm` — runtime realm composition (`composeRealm`): assemble a played instance from a deck of modifier cards (major biome + minor weather/day-length/spawn cards) that override environment params and spawn tables, recomposing a sampleable environment field on top of the weather hooks.
  - `@jgengine/shell/weather` `FireSpreadLayer` — renders a `FireGrid`'s burning flames + scorched cells; a `survival-demo` game wires the whole stack (moodle stack, per-part body panel, condition meters, weather readout, spreading fire).

## 0.6.0

An additive release: **every 0.5.0 API is unchanged**, so upgrading is only a
version bump. The headline is a whole outdoor-world layer — composable
`environment(...)` descriptors, renderer-free query primitives so gameplay reads
the same world the shell renders, a standalone rigid-body physics sim, and the
`@jgengine/shell` renderers that draw it all.

### Migrate

- Bump every `@jgengine/*` dependency to `^0.6.0` (the eight packages version in lockstep).
- No code change is required — 0.6.0 adds surface, it doesn't move or remove any.
- Optional: describe an outdoor scene once with `environment({ terrain, weather, vegetation, water, structures })` from `@jgengine/core/world/features`. `@jgengine/shell`'s `EnvironmentScene` renders it (terrain, rain/snow, grass, ocean, buildings), and gameplay reads the same world through the renderer-free primitives — `resolveTerrainField(...)` for ground-snap/collision, `windField(...)` for sway/sailing, `waterSurface(...)` for buoyancy, `scatter(...)` for prop/spawn placement, `buildingIndex(...)` for placement avoidance — no three.js needed.

### Added

- `@jgengine/core/world` query primitives — pure, renderer-free world sampling so gameplay and rendering read one source of truth. `world/terrain` (`TerrainField`, `noiseField`, `resolveTerrainField`, `resolveGroundStep` for slope-limited movement), `world/wind` (`windField` — one wind source for weather sway, grass, sailing, fire spread), `world/water` (`waterSurface` / `waterSurfaceFromDescriptor` — CPU Gerstner matching the ocean shader, for buoyancy and shorelines), `world/scatter` (`scatter` — seeded, overlap-aware point distribution for vegetation/props/spawns), `world/buildings` (`generateBuilding`, `generateBuildingDistrict`) and `world/buildingIndex` (`buildingIndex` — `at`/`within`/`nearest`/`isInside`/`blockers` over a district).
- `@jgengine/core/world/features` composable outdoor descriptors — `environment(...)` plus `terrain()`, `rain()`, `snow()`, `grass()`, `ocean()`, `building()`.
- `@jgengine/core/world/regions` (`createRegionField` — blend content-agnostic biomes by nearest selector, adding `tint`/`water`/`fog`/`speedMultiplier`/opaque `data`; extends `TerrainField` so it ground-snaps too) and `@jgengine/core/world/scatterItems` (`scatterItems` — region-driven content scatter: density per region, grounded, above-water/slope-aware, with `pickWeighted` for weighted rolls).
- `@jgengine/core/physics/physicsWorld` — standalone fixed-capacity rigid-body sim (SoA buffers, spatial-hash broadphase, sleeping) for many colliding dynamic bodies (piles, debris, stress scenes). Distinct from the `defineGame` `physics: { gravity }` character-controller config.
- `ctx.time` simulation clock (`@jgengine/core/time/simClock`) — `onTick`'s `dt` is now **game time**, so `rate * dt` decay/regen/AI obeys pause and fast-forward for free without per-system wiring. Configure with `defineGame({ time: { scale?, speeds?, dayLength?, start?, startPaused? } })` (all optional; default is real-time 1:1). `ctx.time` exposes `pause`/`play`/`toggle`/`setSpeed`/`cycleSpeed` + `snapshot()`/`calendar()`; `useGameClock()` binds it in React.
- `@jgengine/shell` environment/terrain/water/weather/structures renderers — `EnvironmentScene` mounts an `environment()` descriptor as R3F renderers; `GrassField`, `ProceduralGround`, `Ocean`, `RainField`, `SnowField`, `LightningStrike`, `GeneratedBuilding`, and `world/InstancedBodies` (renders `PhysicsWorld` bodies).
- `@jgengine/react/liveBind` — `useFrameBind` drives a DOM/SVG element from a per-frame value without re-rendering React (HUDs bound to live engine state never re-render or lag).

## 0.5.0

An additive release: **every 0.4.0 API is unchanged**, so upgrading is only a
version bump. New pure primitives across progression, inventory slots, world
geometry, and React store bindings.

### Migrate

- Bump every `@jgengine/*` dependency to `^0.5.0` (the eight packages version in lockstep).
- No code change is required — 0.5.0 adds surface, it doesn't move or remove any.
- Optional: replace a game's hand-rolled `progression/curves.ts` with the new `leveling(...)` track. `leveling({ xpForLevel: { kind: "power", base, exponent, round: "floor" }, maxLevel })` returns `xpForLevel`, `resolve`, and `grantXp(ctx.scene.entity.stats, userId, amount, onLevelUp?)` — a drop-in for the old `xpRequiredForLevel` / `resolveLevelProgress` / `grantXp` exports. `ctx.scene.entity.stats` satisfies the primitive's `LevelingStatAccess` structurally, so no adapter is needed.

### Added

- `@jgengine/core/game/progression` — genre-agnostic progression primitive. `curve(spec)` / `evalCurve(spec, x)` evaluate declarative scalar curves (`const`, `linear`, `power`, `geometric`, `steps`, `piecewise`, each with optional `round`/`min`/`max`) for speed-by-level, difficulty-by-wave, loot drop-rate ramps, and similar scaling. `leveling(config)` builds the stateful XP→level track (threshold accumulation, multi-level grants, cap handling, `stat.levelUp` emit) on top of an `xpForLevel` curve.
- `@jgengine/core/inventory/slotModel` — pure slot-grid primitives (`createSlots`, `placeAt`, `removeAt`, `moveSlot`).
- `@jgengine/core/world/geometry`, `/world/interiors`, `/world/placement` — pure world primitives: grid snapping, footprint AABBs and overlap, interior/exterior spaces, and placement validation.
- `@jgengine/react/engineStore` — raw-store React bindings (`useEngineState`, `useEngineStore`, `useEngineEvent`).
- Pure/functional tiers for the `trade`, `unlocks`, `quest`, and `feed` verbs in `@jgengine/core/game`.

## 0.4.0

Baseline release: the eight `@jgengine/*` packages (core, ws, sql, react,
convex, node, shell, assets) as the first tracked version. No migration —
this is the floor changelog entries are measured against.

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
- `@jgengine/core/audio/audioFalloff` — the audio contract + pure distance→gain math. `SoundDef`/`AudioBusDef` catalog types, `computeFalloffGain(distance, config)` (`"linear" | "inverse" | "none"` curves), and `resolveEmitterGain`/`distance3` helpers. No Web Audio in core — this is the tested math the shell plays from.
- `@jgengine/core/time/beatClock` — a BPM tick signal, separate from `simClock`. `createBeatClock({ bpm, beatsPerBar? }, onBeat?)` advances on **game-time** `dt` and fires `onBeat` per crossed beat; `createBeatInputBuffer` auto-corrects an off-beat press to fire on the next beat tick (`nextBeatTime` is the underlying pure quantization). For rhythm-quantized combat (Hi-Fi Rush–style).
- `@jgengine/shell` positional audio — `PlayableGame.audio = { sounds, buses? }` + `entitySounds`/`objectSounds` (kind/catalog-id → sound id, same convention as `entityModels`) declare looping positional emitters; the shell (`shell/audio/audioEngine`, `shell/audio/AudioComponents`) owns the `AudioContext`, attaches the listener to the camera every frame, and drives emitter gain from the core falloff curve. Music/SFX buses are plain per-bus gain nodes. No per-game Web Audio glue.
- `@jgengine/ws/voiceChannel` — a thin, coarse voice-channel router riding the same transport/presence model (channel/falloff model only, no WebRTC media). `createVoiceChannelRouter(channels?)`: `join`/`leave` any number of channels at once, `updatePosition` for proximity falloff (reusing the core audio falloff curve), `setMuted`, and `resolveRoutes(listenerUserId)` — one `{ fromUserId, channelId, gain }` per shared channel, so a positional proximity channel and a flat-gain walkie/crew channel resolve simultaneously and independently.
- `@jgengine/core/interaction/skillCheck` — a moving-target-zone, timed minigame (`evaluateSkillCheck`, `skillCheckMarkerPosition`, `skillCheckZoneAt`) for casting/reeling, active-reload, and production minigames from an `item.use` handler.
- `@jgengine/core/interaction/qte` — a timed-prompt QTE sequencer (`evaluateQteSequence`, `pendingQteStep`, `qteProgress`).
- `@jgengine/core/scene/captureCheck` — `captureChance`/`rollCapture`, an hp%+catchPower→probability formula for capture/tame mechanics.
- `@jgengine/core/scene/roster` — `createRoster()`, a persisted per-owner roster (capture/release/list/setEquipped) wired onto the runtime as `ctx.game.roster`, distinct from the ephemeral `game.social.party`.
- `@jgengine/core/stats/rollCheck` — `rollCheck`, a d20-style roll vs. DC with advantage/disadvantage and critical detection.
- Dialogue choices can now gate a branch behind a roll: `DialogueChoice.check` (+ `onSuccess`/`onFailure`) on the `@jgengine/react/components` `DialogueDef`/`DialogueChoice` types, resolved via `resolveDialogueInvoke`.
- `@jgengine/react` gained `SkillCheckBar`, `QteTrack`, and `CaptureOdds` headless minigame UI components, plus a `useRoster(userId?)` hook and extra `DialogueBox` slot classNames (`lineClassName`, `speakerClassName`, `choicesClassName`, `choiceClassName`, `checkClassName`).
- **Navigation & pointer-driven input.** A renderer-free foundation for click-to-move, RTS unit command, and pointer verbs.
  - `@jgengine/core/nav/navGrid` — a walkable grid + A* pathfinding (`createNavGrid`, `findPath`, `smoothPath`); blocked start/goal snap to the nearest walkable cell, paths are string-pulled, and one graph feeds both click-to-move and AI routing.
  - `@jgengine/core/nav/pathFollow` — an authored-polyline mover for tower-defense creeps needing no navmesh (`createPathFollow` + pure `advancePathFollow`); `pathFromNav` lifts an A* route so the same follower drives click-to-move.
  - `@jgengine/core/input/pointer` — the renderer-free `PointerHit` contract (`{ point, normal, entity, object }`) plus `aimToPoint` / `moveTargetFromHit` / `groundOf` so gameplay consumes cursor hits (aim, move-to, routing) without three.js.
  - `@jgengine/core/scene/selection` — pure box-select math (`createSelectionSet`, `screenRect`, `selectWithinRect`, `isMarquee`).
  - `@jgengine/core/interaction/contextMenu` — `contextVerb` / `buildContextMenu` / `contextVerbInput`; catalog entities/objects carry `verbs` for right-click menus.
  - `PlayableGame.pointer` config (`moveCommand`, `select`, `orderCommand`, `contextMenu`, `aim`) — the `@jgengine/shell` `GamePlayerShell` casts the cursor (`pointer.worldHit()`), renders a drag-marquee + right-click verb menu, routes primary-ability aim to the cursor, and remaps orbit to middle-drag so the left button drives verbs.
- **AI over the navmesh.** A renderer-free `ai/` domain for directors, aggro, jobs, and crowds — all ticking on game-time `dt` (the `ctx.time` simClock delta, so pause/fast-forward come free) and routing over the `nav/` navmesh.
  - `@jgengine/core/ai/spawnDirector` — a budget/escalation spawn director for wave shooters and difficulty directors (`createSpawnDirectorState` + pure `advanceSpawnDirector`). Per-`WaveManifest` budgets spent on weighted `SpawnEntry`s (`cost`/`weight`/`minWave`) under a `maxAlive` cap; `duration` auto-advances waves (or `advanceWave` on clear); budget trickles, ramps with sim-time (`escalationPerSecond`), scales per player, and surges on `raiseAlert`. Seeded/deterministic; `pickSpawnPoint` biases placement toward players.
  - `@jgengine/core/ai/threat` — an aggro/threat table (`createThreatTable`): accumulate/`decay` per source, `highest({ current, stickiness })` for sticky MMO target selection feeding `scene/targeting`, `ranked` for a threat meter.
  - `@jgengine/core/scene/behaviors` gained `patrol({ waypoints, speed, loop? })` — a waypoint route as a `BehaviorDescriptor` on top of `wander`, driven by `pathFollow` over `findPath`.
  - `@jgengine/core/ai/jobBoard` — a task/job queue NPCs pull from (`createJobBoard`): `post`/`claim`/`assign`/`release` plus a per-tick `advance(worker, dt, { distanceToStation })` state machine (`travelling → working → done`, `repeat` for production loops) that reports on completion. For colony/companion assignment (Palworld, Schedule I, Sons of the Forest).
  - `@jgengine/core/ai/crowd` — a flow field with congestion + POI routing for management sims (`computeFlowField` Dijkstra steering without per-agent A*, `createCrowdField` per-cell occupancy whose `penalty()` reroutes flow around crowds, `selectPoi` weighting appeal/proximity/capacity with a `findPath`-length distance override).
- **Dropped-item world entities & loot filter.** Loot no longer has to teleport straight to inventory — it can lie on the ground as a rarity-coded, beam-and-labelled `worldItem` you walk up to and grab (Borderlands/Diablo loot beams, ARPG ground loot, Apex/Lethal-Company pick-ups).
  - `@jgengine/core/game/worldItem` — the `worldItem` scene-entity model (position + item ref + rarity): `ctx.scene.worldItem.spawn / get / list / nearestInRadius / pickup` (a third scene bucket alongside object/entity, never merged into inventory). Pure helpers `createWorldItemStore`, `resolveDeathDrops` (splits rolled drops into scattered ground items vs direct grants), `scatterOffset` / `scatterPosition` (the on-death scatter impulse), `selectNearestWorldItem` (pickup-radius nearest selection), and `resolveWorldItemPresentation` (rarity baseline + filter overlay → render binding). Emits `worldItem.dropped` / `worldItem.picked_up`.
  - `onDeath.dropMode: "world"` (+ optional `onDeath.scatter`) routes an entity's death drops through scattered ground items instead of granting straight to the killer; currency still grants directly. Item catalog entries carry `rarity` / `baseType` read by the render binding + filter.
  - `@jgengine/core/game/lootFilter` — a PoE/Last-Epoch-style rule evaluator (`lootFilter`, `evaluateLootFilter`) keyed on rarity + base type + affix-tier that hides/recolors/beams/labels ground items. Rules are **data the game supplies**; first match wins, field-by-field over the rarity baseline. The render binding is engine-owned.
  - `PlayableGame.worldItem` config (`rarityStyle`, `filter`, `pickupRadius`, `beamHeight`) + `pointer.grabWorldItems` — `@jgengine/shell`'s `WorldItems` draws the rarity beam/color/label per drop and `GamePlayerShell` grants + despawns on a click within pickup radius (using `pointer.worldHit()`). `@jgengine/react`'s `useWorldItems()` / `useNearestWorldItem(radius)` drive a HUD pickup prompt.

- **Interactive placement, building & terraform.** Data-only placement becomes the build tooling of Valheim/Enshrouded/The Sims/Fortnite/Dinkum/Palia, all pure `@jgengine/core/world` driven by `pointer.worldHit()`, with shell renderers for the ghost/tint/brush.
  - `@jgengine/core/world/placementController` — `createPlacementController(footprint)` owns the placement ghost: `hover(hit)` → `PlacementPreview` (valid/invalid tint wrapping `validatePlacement`), `rotate`, grid/free/surface `snapMode`, `commit` → `PlacementCommit`.
  - `@jgengine/core/world/connectors` — typed connector sockets with `snapToNearest` snap-to-nearest-compatible (`socketsCompatible`, `worldSockets`).
  - `@jgengine/core/world/support` — `solveSupport` walks the connector graph to ground (`supported`/`unsupported`/hop-`distance` for white→red decay); `toDebrisBodies` sinks collapsed pieces into the `PhysicsWorld`.
  - `@jgengine/core/world/walls` — `createWallDrawTool` (drag walls → auto-enclose → `footprintFromWalls` → `autoRoof` hip/gable/flat) plus `createSurfacePaint` for per-tile floor/wall surfaces.
  - `@jgengine/core/world/placedStructureStore` — `createPlacedStructureStore` save/load/select/move/delete with a `snapshot`↔`load` round-trip that survives reload.
  - `@jgengine/core/world/terraform` — `createEditableTerrain({ bounds, base, cellSize })` makes a `TerrainField` you can **write back to** via `apply(edit)` (raise/lower/flatten/paint), and `createTerraformBrush` is the cursor tool. This height-offset grid is the shared terrain-edit write-back pattern.
  - `@jgengine/core/world/buildPermissions` — `createPlotPermissions` (per-plot/guild `BuildRole` edit authority) + `createContributionPool` (co-op pooled-resource contribution model).
  - `@jgengine/shell` renderers: `structures/PlacementGhost` (tinted ghost), `terrain/EditableGround` (renders an `EditableTerrain` with surface paint), `terrain/TerraformBrushCursor` (brush ring); the `builder-sandbox` demo game wires them to `pointer.worldHit()`.

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

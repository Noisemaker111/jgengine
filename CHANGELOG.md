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

- `@jgengine/core/item/durability` — per-instance item durability + repair. A catalog `DurabilitySpec` (`max`, `wearPerUse`/`wearPerHit`, `disableAtZero`, `repair`); `createDurability`/`wear`/`isDisabled`/`durabilityFraction` for the wear loop, `repairQuote(spec, state, { station?, to? })` for a quote-then-apply repair (material cost scaled by points restored, optional `qualityLossPerRepair` shrinking `max`), and `createDurabilityTracker()` to hold state per instance id. For weapon/tool/armor degradation repaired at stations.
- `@jgengine/core/item/affix` — rarity-weighted procgen roller. `createAffixRoller({ pools, rarities })` turns `base × rarity` into `{ rolled affixes, computed stats, name }`: draws `affixCount` distinct affixes without replacement (weighted via the engine `pickWeighted`), computes stats (base × rarity scale, then `add` then `mul` affixes), and composes a name from rarity + prefix/suffix parts. `seededRng(seed)` gives deterministic drops. For looter-shooter / ARPG generated weapons.
- `@jgengine/core/item/modularItem` — parts-in-typed-slots assembly. `ModularItemDef` with category-constrained `MountSlotDef`s; `install`/`uninstall` validate slot + category + occupancy, `computeEffectiveStats` rolls part `stats` (additive) then `multipliers` over the frame's `baseStats`, `missingRequiredSlots`/`isComplete` gate a buildable whole; `createModularItem(def)` is the stateful wrapper. For piece-by-piece guns and mech loadouts.
- `@jgengine/core/inventory/storageTier` — tiered extraction-economy inventory. A `tier: "carried" | "banked"` on inventory containers (`InventoryDeclaration.tier`); `partitionOnDeath` splits a death snapshot into kept (banked) vs lost (carried) with merged stacks, `createDeliveryQueue()` is the delayed-delivery (insurance) hook (`schedule`/`due`/`claimDue` on the game clock), `insureLost` filters the lost set to insured items with a delayed `deliverAt`, and `resolveConsolation` yields a baseline loadout id (apply via `applyLoadout`) for the post-death consolation grant. The inventory foundation the extraction session/round machines build on.
- `InventoryDeclaration` (`@jgengine/core/game/defineGame`) gained an optional `tier?: StorageTier` flag so containers declare carried-vs-banked storage directly.

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

export const VERSION = "0.6.0";

export interface ChangelogEntry {
  migrate: readonly string[];
  added: readonly string[];
  changed: readonly string[];
  removed: readonly string[];
}

export const CHANGELOG: Record<string, ChangelogEntry> = {
  "0.6.0": {
    migrate: [
      "Bump every @jgengine/* dependency to ^0.6.0 (the eight packages version in lockstep).",
      "0.6.0 is additive — every 0.5.0 API is unchanged, so no code change is required to upgrade.",
      "Optional: mount an outdoor scene by handing environment({ terrain, weather, vegetation, water, structures }) from @jgengine/core/world/features to the shell — @jgengine/shell EnvironmentScene renders terrain, rain/snow, grass, ocean, and buildings from it, while gameplay reads the same world through the renderer-free query primitives (resolveTerrainField, windField, waterSurface, scatter, buildingIndex).",
    ],
    added: [
      "@jgengine/core/world query primitives — renderer-free world sampling so gameplay reads the same world the shell renders: world/terrain (TerrainField, noiseField, resolveTerrainField, resolveGroundStep), world/wind (windField), world/water (waterSurface, waterSurfaceFromDescriptor, CPU Gerstner), world/scatter (scatter — seeded overlap-aware point distribution), world/buildings (generateBuilding, generateBuildingDistrict) and world/buildingIndex (buildingIndex — at/within/nearest/isInside/blockers).",
      "@jgengine/core/world/features gained composable outdoor descriptors: environment(), terrain(), rain(), snow(), grass(), ocean(), building().",
      "@jgengine/core/world/regions (createRegionField — blend content-agnostic biomes by nearest selector, extends TerrainField so it ground-snaps) and world/scatterItems (scatterItems — region-driven, grounded, above-water/slope-aware content scatter with pickWeighted).",
      "@jgengine/core/physics/physicsWorld — standalone fixed-capacity rigid-body sim (SoA buffers, spatial-hash broadphase, sleeping) for many colliding dynamic bodies; independent of the defineGame physics character-controller config.",
      "ctx.time simulation clock (@jgengine/core/time/simClock) — dt in onTick is game time, so decay/regen/AI written as rate*dt obey pause and fast-forward for free. Configure via defineGame({ time: { scale?, speeds?, dayLength?, start?, startPaused? } }); pause/play/setSpeed/calendar controls, and useGameClock() in React.",
      "@jgengine/shell environment/terrain/water/weather/structures renderers — EnvironmentScene mounts an environment() descriptor; GrassField, ProceduralGround, Ocean, RainField, SnowField, LightningStrike, GeneratedBuilding, and world/InstancedBodies (renders PhysicsWorld bodies).",
      "@jgengine/react/liveBind — useFrameBind drives a DOM/SVG element from a per-frame value without re-rendering React.",
    ],
    changed: [],
    removed: [],
  },
  "0.5.0": {
    migrate: [
      "Bump every @jgengine/* dependency to ^0.5.0 (the eight packages version in lockstep).",
      "0.5.0 is additive — all 0.4.0 APIs are unchanged, so no code change is required to upgrade.",
      "Optional: replace a game's hand-rolled progression/curves.ts with leveling({ xpForLevel: { kind: 'power', base, exponent, round: 'floor' }, maxLevel }) from @jgengine/core/game/progression; its xpForLevel/resolve/grantXp are drop-ins and ctx.scene.entity.stats satisfies LevelingStatAccess with no adapter.",
    ],
    added: [
      "@jgengine/core/game/progression — declarative scalar curves (curve/evalCurve: const, linear, power, geometric, steps, piecewise with round + min/max) and a leveling() XP->level track built on an xpForLevel curve.",
      "@jgengine/core/inventory/slotModel — pure slot-grid primitives (createSlots, placeAt, removeAt, moveSlot).",
      "@jgengine/core/world/geometry, /world/interiors, /world/placement — pure world primitives: grid snapping, footprint AABBs/overlap, interior/exterior spaces, and placement validation.",
      "@jgengine/react/engineStore — raw-store React bindings (useEngineState, useEngineStore, useEngineEvent).",
      "Pure/functional tiers for the trade, unlocks, quest, and feed verbs in @jgengine/core/game.",
    ],
    changed: [],
    removed: [],
  },
  "0.4.0": {
    migrate: [],
    added: ["Baseline release: core, ws, sql, react, convex, node, shell, assets."],
    changed: [],
    removed: [],
  },
};

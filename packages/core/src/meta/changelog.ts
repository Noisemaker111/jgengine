export const VERSION = "0.7.0";

export interface ChangelogEntry {
  migrate: readonly string[];
  added: readonly string[];
  changed: readonly string[];
  removed: readonly string[];
}

export const CHANGELOG: Record<string, ChangelogEntry> = {
  "0.7.0": {
    migrate: [
      "Bump every @jgengine/* dependency to ^0.7.0 (the eight packages version in lockstep).",
      "0.7.0 is additive — every 0.6.0 API is unchanged, so no code change is required to upgrade; existing games keep the orbit/first-person camera, single-player-entity control, and every existing primitive exactly as before.",
      "Opt into any new system by importing it directly: a camera rig via camera.rig; a sensor/* probe with @jgengine/shell/vision renderers; an ai/* director over the nav/ navmesh; turn/* + tactics/* for turn-based games; cards/* + board/* for deckbuilders; crafting/* for recipes/production/farming; survival/* + world/{envField,weather,realm} for survival; combat/{abilityKit,animationState,defensiveWindow} for action feel; physics/{vehicleBody,traversal,structure,ragdoll} for vehicles/destruction; session/* for contested/round/downed/ring/extraction machines; and multiplayer/* for lag-comp/hidden-commit/matchmaking.",
      "entityStore.update() now also accepts name, so possession/form can retarget an instance's catalog id without despawn/respawn.",
    ],
    added: [
      "Navigation & pointer input — nav/navGrid (A* walkable grid), nav/pathFollow, input/pointer (PointerHit), scene/selection, interaction/contextMenu, and PlayableGame.pointer (worldHit, marquee select, right-click verbs, move/aim commands) in @jgengine/shell.",
      "Camera rig library — eight rigs on PlayableGame.camera (topDown/iso, rts, shoulder, lockOn, chase + cockpit/hood/rear, orbit, first), a cinematic keyframe path, rig cross-fade, followEntityId: null, and a shared camera-shake/trauma channel (cameraShake / useCameraShake).",
      "Physics constraints & actors — PhysicsWorld joints (hinge/fixed/distance/spring), onCollision gameplay-event hook, physics/ragdoll, physics/carryable, physics/forceVolume + platformCarry, and physics/spatialGrid broad-phase.",
      "Vehicles, mounts & racing — physics/vehicleBody (suspension + grip curve), input/axisInput, physics/buoyancy boat, scene/mount multi-seat rideable, physics/damageZones crash stages, and game/race (raceTrack + raceState).",
      "Traversal & destruction — physics/traversal (grapple/glide), world/carve (voxel carve/deposit + terrain write-back), and physics/structure (integrity graph → debris collapse).",
      "AI director/behavior/crowds — ai/spawnDirector, ai/threat, ai/jobBoard, ai/crowd flow field, and a scene/behaviors patrol descriptor over the navmesh.",
      "Abilities, resources & cooldowns — combat/abilityKit (four-state slots), stats/accumulatorMeter + stats/eventMeter (ult/streak), scene/autoTarget, combat/resistance matrix, game/runDraft, and @jgengine/react useAbilitySlots / useEventMeter.",
      "Character combat feel — combat/animationState, combat/attackTags, combat/defensiveWindow, combat/comboString, combat/breakMeters (stagger/buildup), movement/dash, combat/hitReaction (hitstop + shake), combat/telegraph, and typed float-text styling.",
      "Item & gear — item/durability, item/affix roller, item/modularItem, and inventory/storageTier (carried vs banked + delivery/insurance/consolation).",
      "Objective/mode/session machines — session/contestedChannel, session/roundState, combat/downed, session/ring, session/extraction, and runtime/persistenceScope (run-vs-meta split with HostPersistence.resetScenario).",
      "Turn-based & tactics — turn/turnLoop (+ action-economy pools), turn/commit (immediate/simultaneous/rewind), tactics/tacticalGrid, tactics/predictiveQuery, tactics/snapshot, tactics/surface, and shared combat/effects resolveAreaTargets.",
      "Card & board stack — cards/cardPile, cards/modifierPipeline, board/laneBoard, board/timelineBoard, inventory/shapedGrid, and @jgengine/react dragLayer.",
      "Crafting, tech & production — crafting/recipe graph, economy/techTree (prereq-gated unlocks), crafting/production buildings + conveyor/power, and crafting/crop farming state machine.",
      "Survival & environment — survival/decayMeter, survival/moodle, survival/regionHealth, world/envField, world/weather (+ coarse fire grid), world/realm composition, and @jgengine/shell FireSpreadLayer.",
      "World items & loot — game/worldItem (third scene bucket), game/lootFilter, onDeath.dropMode world scatter, PlayableGame.worldItem render binding, and @jgengine/react useWorldItems / useNearestWorldItem.",
      "Placement, building & terraform — world/placementController, world/connectors, world/support, world/walls, world/placedStructureStore, world/terraform (editable terrain write-back), world/buildPermissions, and @jgengine/shell ghost/tint/brush renderers.",
      "Map, HUD & ping — world/markers, world/fog, world/minimap, game/ping, @jgengine/react Minimap/Compass/WorldMap + useMarkers/useFog, and @jgengine/shell bakeTerrainMap + MapMarkerBeacons.",
      "Audio & voice — audio/audioFalloff contract, time/beatClock, @jgengine/shell positional emitters (PlayableGame.audio + entitySounds/objectSounds), and @jgengine/ws voiceChannel router.",
      "Interaction verbs & minigames — interaction/skillCheck, interaction/qte, scene/captureCheck + scene/roster, stats/rollCheck, dialogue skill-check gates, and @jgengine/react SkillCheckBar/QteTrack/CaptureOdds + useRoster.",
      "Sensors, vision & observer — sensor/revealQuery, sensor/hiddenStateProbe, sensor/frustumSensor, sensor/recordingBuffer, the observer camera rig, and @jgengine/shell vision/replay renderers.",
      "Player embodiment & expression — scene/possession, scene/form (shapeshift), game/cosmetics loadouts, and social emote broadcast over the presence layer.",
      "Multiplayer depth — multiplayer/lagCompensation (position history + rewind), multiplayer/simultaneousCommit, multiplayer/combatSnapshot replay, scene/stationClaim shared-vehicle facets, economy/sharedWallet, and multiplayer/matchmaking (browse/filter/join-by-code) with @jgengine/node host support.",
    ],
    changed: [],
    removed: [],
  },
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

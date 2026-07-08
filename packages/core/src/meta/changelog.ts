export const VERSION = "0.7.0";

export interface ChangelogEntry {
  migrate: readonly string[];
  added: readonly string[];
  changed: readonly string[];
  removed: readonly string[];
}

export const CHANGELOG: Record<string, ChangelogEntry> = {
  Unreleased: {
    migrate: [
      "Additive only — every 0.7.0 API is unchanged; opt into any of the below by importing it directly.",
      "leveling({ thresholdMode: 'cumulative' }) is opt-in; the default 'perLevel' behavior is unchanged.",
      "defineGame.physics.gravity/jumpVelocity are now read by the built-in kinematics controller every frame — if a game already set them expecting a no-op, jump/fall now actually reflects them; omit both to keep the previous defaults.",
    ],
    added: [
      "Cumulative leveling — leveling({ thresholdMode: 'cumulative' }) tracks xp as a lifetime total that resolves upward across levels and clamps at the max-level threshold once capped (#12).",
      "Direction-aware pool depletion — EffectSystem.canReceive(instanceId, effect, magnitude?) takes an optional signed magnitude; negative checks the opposite direction and returns 'pools-full' only when every stat in the receive order is already at max, so heals reach fully-depleted targets (#168).",
      "Puzzle primitives — puzzle/cellGrid (uniform-cell boards: line-clear, match-3 cascade, run detection) and puzzle/fallingPiece (rotation-state shapes, ghost drop, lock delay, classic gravity/level/score curves) for Tetris/match-3 games (#166).",
      "Voxel field — world/voxelField (createVoxelField, chunked block lattice, neighbors/exposedFaces, 3D DDA raycast, dirty-tracked chunkVersion) for voxel games and instanced renderers; assert on field.summary() the way environment worlds assert on summarizeEnvironment (#166).",
      "defineGame games may omit assets (an empty catalog is injected); PlayableGame.presentation: 'hud' mounts no 3D canvas/camera/pointer for board/card/menu games; an environment() world auto-renders as the shell's backdrop when PlayableGame.environment is unset (#166).",
      "Declared-action intent board — turn/intent createIntentBoard for one-turn-ahead intents (Slay-the-Spire style), snapshot-compatible via capture/restore alongside turnLoop slices (#168).",
      "turnLoop lifecycle hooks — onTurnStart/onTurnEnd/onRoundStart/onPoolChange/onChange, the last wireable straight to ctx.game.state.invalidate for reactive turn state (#163/#168).",
      "ctx.game.state — a reactive per-game key-value store (define/get/set/update/attach/invalidate) plus @jgengine/react's useGameState, replacing hand-rolled module-level stores for ad-hoc reactive game state; createCardPile gained an onChange hook; CommandDefinition.apply may return void for side-effect-only commands (#163).",
      "Camera — sideOn rig (fixed lateral follow for 2.5D platformers/beat-'em-ups), rts.pan: false (static backdrop camera: no pan/edge-scroll/rotate/zoom, still re-centers on the follow target), and the observer rig now defaults to the local player when bind is unset (#167).",
      "Sensors + session — sensor/concealment (colorDistance/concealmentScore/createConcealmentSensor), sensor/freezeMonitor (createFreezeMonitor), session/roles (assignRoles), session/winConditions (createWinConditionSet); createRoundState takes an optional phaseOrder for arbitrary named phase cycles (#151).",
      "Appearance replication — presence rows carry an optional per-slot appearance channel (cosmetic ids, hex tints, model keys) alongside pose, riding the existing pose message with no protocol bump; wire ctx.player.cosmetics.get(userId) into the outgoing pose (#151).",
      "ctx.input — polls per-frame control state (isHeld/axis/aim/jumpHeld/sprintHeld/pointerLocked/snapshot) without bumping ctx.version(); action bindings gained repeatMs (repeat-fire while held); every command resolved from a bound action now carries aim; pointer.secondaryCommand runs a command on right-click off the same raycast as move/ping (#164).",
      "Object spatial queries + entity patching — ctx.scene.object.at/inBox/raycast/raycastAll over unit-box objects; ctx.scene.entity.update(id, patch) for name/position/rotation/role/movement/behaviors/meta; per-instance renderObject/objectStyles overrides; pointerService.centerHit() + pointer-lock center-ray aiming (#165).",
      "Controller physics — movement.groundHeight/constrain/lockAxis pre-commit hooks (pair constrain with nav/navConstrain's constrainToNavGrid for navmesh-walled movement); defineGame.physics.gravity/jumpVelocity are now honored by the built-in kinematics controller (distinct from the standalone physics/physicsWorld rigid-body sim); ctx.player.motion.impulse/setVerticalVelocity/launch; entity.spawnPoseOf/resetToSpawn/resetAllToSpawn (#162).",
      "Model material/animation + paint — ModelConfig.tint/metalness/roughness/animation (GLTF clip playback, paused pose holds); PointerHit.uv + pointerService.sampleSurface() for material-aware picking; ctx.scene.entity.paint runtime paint layer, auto-rendered via a per-instance canvas texture with no per-game wiring; remote-player appearance tint recolors the shell's default capsule (#151).",
    ],
    changed: [],
    removed: [],
  },
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
